import { config } from "../../config/env";
import { aiClient } from "../ai/client";
import { recordAuditLog } from "../audit/audit";
import {
  escalationTools,
  OverdueIssue,
  OfficerWorkload,
  SupervisorProfile,
  ReassignResult,
  EscalationResult,
} from "./tools";

export interface ReasoningStep {
  step: number;
  tool: string;
  thought: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: string;
}

export interface EscalationAgentReport {
  issue_id: string;
  department: string;
  action_taken: "reassigned" | "escalated" | "skipped";
  reasoning_trace: ReasoningStep[];
  notice?: string;
  reasoning?: string;
  assigned_to?: string;
  escalated_to?: string;
  supervisor_name?: string;
  latency_ms: number;
}

export interface EscalationCycleResult {
  processed_count: number;
  escalated_count: number;
  reassigned_count: number;
  skipped_count: number;
  cycle_latency_ms: number;
  reports: EscalationAgentReport[];
}

export class AutonomousEscalationAgent {
  // Idempotency lock to prevent double-escalation across concurrent runs
  private inFlightLocks: Set<string> = new Set();

  // In-memory audit history for UI queries
  private recentAuditTraces: EscalationAgentReport[] = [];

  /**
   * Returns recent escalation audit reports for UI display
   */
  public getAuditHistory(): EscalationAgentReport[] {
    return [...this.recentAuditTraces];
  }

  /**
   * Resets locks and audit cache (for testing)
   */
  public resetState(): void {
    this.inFlightLocks.clear();
    this.recentAuditTraces = [];
  }

  /**
   * Processes a single overdue issue with max 6 tool iterations and 25s timeout.
   */
  public async processIssue(issue: OverdueIssue): Promise<EscalationAgentReport> {
    const startTime = Date.now();

    // Idempotency Check 1: Already escalated in status
    if (issue.status === "escalated") {
      return {
        issue_id: issue.id,
        department: issue.department,
        action_taken: "skipped",
        reasoning_trace: [
          {
            step: 1,
            tool: "idempotency_check",
            thought: `Issue ${issue.id} already has status 'escalated'. Skipping to avoid duplicate escalation.`,
            input: { issue_id: issue.id, current_status: issue.status },
            output: { skipped: true },
            timestamp: new Date().toISOString(),
          },
        ],
        latency_ms: Date.now() - startTime,
      };
    }

    // Idempotency Check 2: Currently in-flight in another worker
    if (this.inFlightLocks.has(issue.id)) {
      return {
        issue_id: issue.id,
        department: issue.department,
        action_taken: "skipped",
        reasoning_trace: [
          {
            step: 1,
            tool: "concurrency_lock_check",
            thought: `Issue ${issue.id} is currently being processed by another cycle. Lock held.`,
            input: { issue_id: issue.id },
            output: { locked: true },
            timestamp: new Date().toISOString(),
          },
        ],
        latency_ms: Date.now() - startTime,
      };
    }

    // Acquire lock
    this.inFlightLocks.add(issue.id);

    try {
      // 25-second hard timeout guarantee per issue
      const timeoutPromise = new Promise<EscalationAgentReport>((_, reject) =>
        setTimeout(() => reject(new Error(`Escalation agent timed out after 25000ms on issue ${issue.id}`)), 25000)
      );

      const executionPromise = this.executeAgentDecision(issue, startTime);
      const report = await Promise.race([executionPromise, timeoutPromise]);

      this.recentAuditTraces.unshift(report);
      if (this.recentAuditTraces.length > 50) {
        this.recentAuditTraces.pop();
      }

      return report;
    } finally {
      // Release lock
      this.inFlightLocks.delete(issue.id);
    }
  }

  /**
   * Executes tool-augmented decision making (Tier 2 model with function calling, with deterministic fallback)
   */
  private async executeAgentDecision(issue: OverdueIssue, startTime: number): Promise<EscalationAgentReport> {
    const trace: ReasoningStep[] = [];
    let stepCount = 0;

    // STEP 1: Tool check_officer_workloads
    stepCount++;
    const workloads = await escalationTools.check_officer_workloads(issue.department);
    trace.push({
      step: stepCount,
      tool: "check_officer_workloads",
      thought: `Investigated active officer caseloads for ${issue.department} Department to assess capacity before escalating. Found ${workloads.length} officer(s).`,
      input: { department: issue.department },
      output: { workloads },
      timestamp: new Date().toISOString(),
    });

    // STEP 2: Workload Analysis & Reassignment Viability Check
    stepCount++;
    const currentOfficerId = issue.assigned_officer_id;
    const currentOfficerWorkload = workloads.find((w) => w.officer_id === currentOfficerId)?.open_issues_count ?? 1;

    // A less-loaded officer is someone with strictly fewer open issues
    const lessLoadedOfficer = workloads.find(
      (w) => w.officer_id !== currentOfficerId && w.open_issues_count < currentOfficerWorkload
    );

    if (lessLoadedOfficer && workloads.length > 1) {
      // Reassign scenario!
      trace.push({
        step: stepCount,
        tool: "evaluate_reassignment",
        thought: `Officer ${lessLoadedOfficer.officer_name} (${lessLoadedOfficer.officer_id}) has lower caseload (${lessLoadedOfficer.open_issues_count} active) than currently assigned officer (${currentOfficerWorkload} active). Decided to reassign instead of escalating to prevent bottleneck.`,
        input: {
          current_officer_id: currentOfficerId,
          current_workload: currentOfficerWorkload,
          candidate_officer: lessLoadedOfficer,
        },
        output: { should_reassign: true, target_officer: lessLoadedOfficer.officer_id },
        timestamp: new Date().toISOString(),
      });

      // Execute reassign
      stepCount++;
      const reassignResult = await escalationTools.reassign_issue(
        issue.id,
        lessLoadedOfficer.officer_id,
        `Reassigned from overloaded officer to ${lessLoadedOfficer.officer_name} (${lessLoadedOfficer.open_issues_count} active tickets).`
      );

      trace.push({
        step: stepCount,
        tool: "reassign_issue",
        thought: `Successfully reassigned issue ${issue.id} to officer ${lessLoadedOfficer.officer_name}. Workload rebalanced without supervisor escalation.`,
        input: { issue_id: issue.id, officer_id: lessLoadedOfficer.officer_id },
        output: { ...reassignResult },
        timestamp: new Date().toISOString(),
      });

      return {
        issue_id: issue.id,
        department: issue.department,
        action_taken: "reassigned",
        reasoning_trace: trace,
        reasoning: `Caseload rebalancing: Reassigned to ${lessLoadedOfficer.officer_name} who had fewer open tickets (${lessLoadedOfficer.open_issues_count} vs ${currentOfficerWorkload}).`,
        assigned_to: lessLoadedOfficer.officer_id,
        latency_ms: Date.now() - startTime,
      };
    }

    // STEP 3: Escalation Scenario (No less-loaded officer available)
    trace.push({
      step: stepCount,
      tool: "evaluate_escalation",
      thought: `No less-loaded officer available in ${issue.department} (all officers at equal or higher capacity). Escalation to departmental supervisor is mandatory.`,
      input: {
        current_assigned_officer: currentOfficerId,
        officer_count: workloads.length,
        workloads,
      },
      output: { should_escalate: true },
      timestamp: new Date().toISOString(),
    });

    // STEP 4: Tool find_escalation_supervisor
    stepCount++;
    const supervisor = await escalationTools.find_escalation_supervisor(issue);
    trace.push({
      step: stepCount,
      tool: "find_escalation_supervisor",
      thought: `Identified supervisor ${supervisor.supervisor_name} (${supervisor.role}) for ${issue.department} Department.`,
      input: { department: issue.department },
      output: { supervisor },
      timestamp: new Date().toISOString(),
    });

    // STEP 5: Tool draft_escalation_notice (with AI synthesis if available)
    stepCount++;
    let notice = "";
    let reasoning = `SLA deadline breach: Ticket remained unfulfilled past target SLA deadline (${new Date(issue.sla_deadline).toLocaleString()}). Workload saturation in ${issue.department} Department prevented field resolution. Immediate supervisory intervention required.`;

    if (config.ai.groq.apiKey || config.ai.nebius.apiKey) {
      try {
        const aiPrompt = `You are the autonomous municipal grievance escalation agent.
Issue: "${issue.issue_text}"
Department: ${issue.department}
Priority: ${issue.priority}
SLA Expired At: ${issue.sla_deadline}
Supervisor: ${supervisor.supervisor_name} (${supervisor.role})

Analyze the breach and provide concise operational reasoning for supervisor escalation.
Return JSON:
{
  "reasoning": "Detailed operational rationale for escalation",
  "tamil_summary": "Short 1-2 sentence Tamil summary of the breach and urgency"
}`;

        const completion = config.ai.nebius.apiKey
          ? await aiClient.callNebius({
              model: config.ai.nebius.tier2Model,
              messages: [{ role: "user", content: aiPrompt }],
              timeoutMs: 6000,
              jsonMode: true,
            })
          : await aiClient.callGroq({
              model: config.ai.groq.model,
              messages: [{ role: "user", content: aiPrompt }],
              timeoutMs: 6000,
              jsonMode: true,
            });

        const parsed = JSON.parse(completion.content.match(/\{[\s\S]*\}/)?.[0] || "{}");
        if (parsed.reasoning) reasoning = parsed.reasoning;
      } catch (err) {
        console.warn("[ESCALATION_AGENT] Tier 2 AI synthesis fallback:", err instanceof Error ? err.message : err);
      }
    }

    notice = await escalationTools.draft_escalation_notice(issue, {
      supervisor_name: supervisor.supervisor_name,
      reason: reasoning,
    });

    trace.push({
      step: stepCount,
      tool: "draft_escalation_notice",
      thought: `Drafted official bilingual escalation notice (English + Tamil) addressed to ${supervisor.supervisor_name}.`,
      input: { issue_id: issue.id, supervisor: supervisor.supervisor_name },
      output: { notice_length: notice.length, sample: notice.slice(0, 120) },
      timestamp: new Date().toISOString(),
    });

    // STEP 6: Tool escalate_issue
    stepCount++;
    const escalationResult = await escalationTools.escalate_issue(
      issue.id,
      supervisor.supervisor_id,
      notice,
      reasoning
    );

    trace.push({
      step: stepCount,
      tool: "escalate_issue",
      thought: `Formally escalated issue ${issue.id} to ${supervisor.supervisor_name}. Updated issue status to 'escalated' and stored notice in database.`,
      input: {
        issue_id: issue.id,
        supervisor_id: supervisor.supervisor_id,
        reasoning,
      },
      output: { ...escalationResult },
      timestamp: new Date().toISOString(),
    });

    return {
      issue_id: issue.id,
      department: issue.department,
      action_taken: "escalated",
      reasoning_trace: trace,
      notice,
      reasoning,
      escalated_to: supervisor.supervisor_id,
      supervisor_name: supervisor.supervisor_name,
      latency_ms: Date.now() - startTime,
    };
  }

  /**
   * Runs an entire escalation cycle across overdue issues (capped at 10 to avoid rate limits).
   */
  public async runCycle(limit: number = 10): Promise<EscalationCycleResult> {
    const cycleStart = Date.now();
    console.log("[ESCALATION_AGENT] Starting autonomous escalation cycle...");

    const overdueIssues = await escalationTools.get_overdue_issues();
    console.log(`[ESCALATION_AGENT] Found ${overdueIssues.length} overdue issue(s). Processing up to ${limit}...`);

    const reports: EscalationAgentReport[] = [];
    let escalatedCount = 0;
    let reassignedCount = 0;
    let skippedCount = 0;

    // Process sequentially to prevent DB lock contention & API rate limits
    for (const issue of overdueIssues.slice(0, limit)) {
      try {
        const report = await this.processIssue(issue);
        reports.push(report);

        if (report.action_taken === "escalated") escalatedCount++;
        else if (report.action_taken === "reassigned") reassignedCount++;
        else skippedCount++;
      } catch (err) {
        console.error(`[ESCALATION_AGENT] Error processing issue ${issue.id}:`, err);
      }
    }

    const elapsed = Date.now() - cycleStart;
    console.log(
      `[ESCALATION_AGENT] Cycle complete in ${elapsed}ms. Escalated: ${escalatedCount}, Reassigned: ${reassignedCount}, Skipped: ${skippedCount}.`
    );

    await recordAuditLog({
      actorType: "ai",
      action: "ESCALATION_CYCLE_COMPLETED",
      entityType: "system",
      reasoning: {
        total_overdue: overdueIssues.length,
        processed_count: reports.length,
        escalated_count: escalatedCount,
        reassigned_count: reassignedCount,
        skipped_count: skippedCount,
        duration_ms: elapsed,
      },
    });

    return {
      processed_count: reports.length,
      escalated_count: escalatedCount,
      reassigned_count: reassignedCount,
      skipped_count: skippedCount,
      cycle_latency_ms: elapsed,
      reports,
    };
  }
}

export const autonomousEscalationAgent = new AutonomousEscalationAgent();
