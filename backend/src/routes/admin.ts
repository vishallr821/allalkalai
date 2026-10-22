import { Router, Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env";
import { runEscalationCycle } from "../jobs/slaRunner";
import { autonomousEscalationAgent } from "../services/escalation/agent";
import { escalationTools, OverdueIssue } from "../services/escalation/tools";

export const adminRouter = Router();

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  return createClient(config.supabase.url, config.supabase.serviceRoleKey);
}

/**
 * POST /api/admin/run-escalation
 * Triggers autonomous escalation cycle across all overdue issues.
 */
adminRouter.post("/api/admin/run-escalation", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = typeof req.body?.limit === "number" ? req.body.limit : 10;
    const result = await runEscalationCycle(limit);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/escalation-audit
 * Retrieves recent reasoning traces, reports, and notices from the escalation agent.
 */
adminRouter.get("/api/admin/escalation-audit", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const history = autonomousEscalationAgent.getAuditHistory();
    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/demo/fast-forward
 * Shifts a chosen issue's SLA deadline into the past and executes the agent live.
 */
adminRouter.post("/api/demo/fast-forward", async (req: Request, res: Response, next: NextFunction) => {
  const t0 = Date.now();
  try {
    const { issueId, minutesAgo = 120, department = "Electricity" } = req.body || {};
    const pastTime = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    const supabase = getSupabaseClient();

    let targetIssue: OverdueIssue | null = null;

    if (issueId) {
      if (supabase) {
        try {
          const { data } = await supabase
            .from("issues")
            .select("*")
            .eq("id", issueId)
            .single();

          if (data) {
            await supabase
              .from("issues")
              .update({
                sla_deadline: pastTime,
                status: "assigned",
                updated_at: new Date().toISOString(),
              })
              .eq("id", issueId);

            targetIssue = {
              ...(data as OverdueIssue),
              sla_deadline: pastTime,
              status: "assigned",
            };
          }
        } catch {
          // Handled below
        }
      }
    }

    // If no issue found or specified, pick an existing open issue or synthesize demo issue
    if (!targetIssue && supabase) {
      try {
        const { data: openIssues } = await supabase
          .from("issues")
          .select("*")
          .in("status", ["new", "assigned", "in_progress"])
          .limit(1);

        if (openIssues && openIssues.length > 0) {
          const chosen = openIssues[0];
          await supabase
            .from("issues")
            .update({
              sla_deadline: pastTime,
              status: "assigned",
              updated_at: new Date().toISOString(),
            })
            .eq("id", chosen.id);

          targetIssue = {
            ...(chosen as OverdueIssue),
            sla_deadline: pastTime,
            status: "assigned",
          };
        }
      } catch {
        // Handled below
      }
    }

    // In-memory fallback if no DB issue exists
    if (!targetIssue) {
      targetIssue = {
        id: issueId || `demo-overdue-${Date.now()}`,
        parent_ticket_id: "demo-ticket-001",
        department,
        issue_text: "High-voltage transformer sparking and power failure in residential layout.",
        priority: "high",
        assigned_officer_id: "ab31db23-5689-4f22-bb7c-d705b64b5fd5",
        status: "assigned",
        sla_deadline: pastTime,
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      };
      escalationTools.registerMemoryIssue(targetIssue);
    }

    // Execute the escalation agent live on the fast-forwarded issue
    const report = await autonomousEscalationAgent.processIssue(targetIssue);
    const elapsed = Date.now() - t0;

    res.json({
      success: true,
      message: `Issue ${targetIssue.id} SLA deadline shifted ${minutesAgo}m into the past. Escalation agent executed live.`,
      target_issue_id: targetIssue.id,
      department: targetIssue.department,
      new_sla_deadline: pastTime,
      total_time_ms: elapsed,
      agent_report: report,
    });
  } catch (err) {
    next(err);
  }
});
