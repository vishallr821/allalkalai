import { createClient } from "@supabase/supabase-js";
import { config } from "../../config/env";
import { recordAuditLog } from "../audit/audit";

export interface OverdueIssue {
  id: string;
  parent_ticket_id: string;
  department: string;
  issue_text: string;
  deadline?: string | null;
  priority: "low" | "medium" | "high";
  assigned_officer_id?: string | null;
  status: "new" | "assigned" | "in_progress" | "resolved" | "escalated";
  sla_deadline: string;
  created_at: string;
  duplicate_group_id?: string | null;
  escalation_notice?: string | null;
  escalation_reason?: string | null;
  escalated_to?: string | null;
}

export interface OfficerWorkload {
  officer_id: string;
  officer_name: string;
  department: string;
  open_issues_count: number;
}

export interface SupervisorProfile {
  supervisor_id: string;
  supervisor_name: string;
  role: "dept_head" | "official";
  department?: string | null;
}

export interface ReassignResult {
  success: boolean;
  issue_id: string;
  new_officer_id: string;
  previous_officer_id?: string | null;
  reassigned_at: string;
  reason?: string;
}

export interface EscalationResult {
  success: boolean;
  issue_id: string;
  status: "escalated";
  escalated_to: string;
  supervisor_name: string;
  notice: string;
  reasoning: string;
  escalated_at: string;
}

export class EscalationTools {
  // In-memory fallback and test store
  private memoryIssues: Map<string, OverdueIssue> = new Map();
  private memoryProfiles: Map<string, { id: string; name: string; role: "citizen" | "officer" | "dept_head" | "official"; department?: string | null }> = new Map();

  private getSupabase() {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
    return createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }

  /**
   * Registers or updates an issue in local memory (for testing and offline resilience)
   */
  public registerMemoryIssue(issue: OverdueIssue): void {
    this.memoryIssues.set(issue.id, { ...issue });
  }

  /**
   * Registers a profile in local memory (for testing and offline resilience)
   */
  public registerMemoryProfile(profile: { id: string; name: string; role: "citizen" | "officer" | "dept_head" | "official"; department?: string | null }): void {
    this.memoryProfiles.set(profile.id, { ...profile });
  }

  /**
   * Resets local memory state
   */
  public resetMemory(): void {
    this.memoryIssues.clear();
    this.memoryProfiles.clear();
  }

  /**
   * 1. get_overdue_issues()
   * Finds open issues past sla_deadline, not resolved/escalated, excluding duplicate children.
   */
  public async get_overdue_issues(): Promise<OverdueIssue[]> {
    const now = new Date().toISOString();
    const supabase = this.getSupabase();
    const overdueList: OverdueIssue[] = [];

    // Query remote Supabase database
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("issues")
          .select("id, parent_ticket_id, department, issue_text, deadline, priority, assigned_officer_id, status, sla_deadline, created_at, duplicate_group_id")
          .lt("sla_deadline", now)
          .in("status", ["new", "assigned", "in_progress"]);

        if (!error && data) {
          for (const item of data) {
            overdueList.push(item as OverdueIssue);
          }
        }
      } catch (err) {
        console.warn("[ESCALATION_TOOLS] DB query error on overdue issues:", err);
      }
    }

    // Merge in-memory registered issues
    for (const mem of this.memoryIssues.values()) {
      if (
        ["new", "assigned", "in_progress"].includes(mem.status) &&
        mem.sla_deadline &&
        new Date(mem.sla_deadline) < new Date(now)
      ) {
        if (!overdueList.some((i) => i.id === mem.id)) {
          overdueList.push(mem);
        }
      }
    }

    // Filter duplicate children (if duplicate_group_id exists, only process one canonical issue)
    const seenGroups = new Set<string>();
    const filteredIssues = overdueList.filter((issue) => {
      if (!issue.duplicate_group_id) return true;
      if (seenGroups.has(issue.duplicate_group_id)) return false;
      seenGroups.add(issue.duplicate_group_id);
      return true;
    });

    await recordAuditLog({
      actorType: "ai",
      action: "ESCALATION_TOOL_OVERDUE_FETCHED",
      entityType: "issues",
      reasoning: {
        total_found: filteredIssues.length,
        timestamp: now,
      },
    });

    return filteredIssues;
  }

  /**
   * 2. check_officer_workloads(department)
   * Calculates open issue counts per officer in the given department.
   */
  public async check_officer_workloads(department: string): Promise<OfficerWorkload[]> {
    const supabase = this.getSupabase();
    const workloads: OfficerWorkload[] = [];

    if (supabase) {
      try {
        const { data: officers, error } = await supabase
          .from("profiles")
          .select("id, name, department")
          .eq("role", "officer")
          .eq("department", department);

        if (!error && officers) {
          for (const officer of officers) {
            const { count } = await supabase
              .from("issues")
              .select("*", { count: "exact", head: true })
              .eq("assigned_officer_id", officer.id)
              .in("status", ["assigned", "in_progress"]);

            workloads.push({
              officer_id: officer.id,
              officer_name: officer.name,
              department: officer.department || department,
              open_issues_count: count || 0,
            });
          }
        }
      } catch (err) {
        console.warn("[ESCALATION_TOOLS] Error querying officer workloads from DB:", err);
      }
    }

    // Merge in-memory profiles
    for (const p of this.memoryProfiles.values()) {
      if (p.role === "officer" && p.department === department) {
        if (!workloads.some((w) => w.officer_id === p.id)) {
          // Count in-memory issues
          let memCount = 0;
          for (const i of this.memoryIssues.values()) {
            if (i.assigned_officer_id === p.id && ["assigned", "in_progress"].includes(i.status)) {
              memCount++;
            }
          }
          workloads.push({
            officer_id: p.id,
            officer_name: p.name,
            department: p.department || department,
            open_issues_count: memCount,
          });
        }
      }
    }

    // Sort by open_issues_count ascending (least loaded first)
    workloads.sort((a, b) => a.open_issues_count - b.open_issues_count);

    await recordAuditLog({
      actorType: "ai",
      action: "ESCALATION_TOOL_WORKLOADS_CHECKED",
      entityType: "department_officers",
      reasoning: {
        department,
        officers_evaluated: workloads.length,
        workloads,
      },
    });

    return workloads;
  }

  /**
   * 3. find_escalation_supervisor(issue)
   * Finds dept_head for the department, falling back to a general official.
   */
  public async find_escalation_supervisor(issue: { department: string }): Promise<SupervisorProfile> {
    const supabase = this.getSupabase();
    let supervisor: SupervisorProfile | null = null;

    if (supabase) {
      try {
        // First try department head
        const { data: deptHead } = await supabase
          .from("profiles")
          .select("id, name, role, department")
          .eq("role", "dept_head")
          .eq("department", issue.department)
          .limit(1)
          .maybeSingle();

        if (deptHead) {
          supervisor = {
            supervisor_id: deptHead.id,
            supervisor_name: deptHead.name,
            role: "dept_head",
            department: deptHead.department,
          };
        } else {
          // Fall back to general official
          const { data: official } = await supabase
            .from("profiles")
            .select("id, name, role, department")
            .eq("role", "official")
            .limit(1)
            .maybeSingle();

          if (official) {
            supervisor = {
              supervisor_id: official.id,
              supervisor_name: official.name,
              role: "official",
              department: official.department,
            };
          }
        }
      } catch (err) {
        console.warn("[ESCALATION_TOOLS] Error querying supervisor from DB:", err);
      }
    }

    // In-memory fallback
    if (!supervisor) {
      for (const p of this.memoryProfiles.values()) {
        if (p.role === "dept_head" && p.department === issue.department) {
          supervisor = {
            supervisor_id: p.id,
            supervisor_name: p.name,
            role: "dept_head",
            department: p.department,
          };
          break;
        }
      }
    }

    if (!supervisor) {
      for (const p of this.memoryProfiles.values()) {
        if (p.role === "official") {
          supervisor = {
            supervisor_id: p.id,
            supervisor_name: p.name,
            role: "official",
            department: p.department,
          };
          break;
        }
      }
    }

    // Default safety fallback if profiles table is empty
    if (!supervisor) {
      supervisor = {
        supervisor_id: "00000000-0000-0000-0000-000000000001",
        supervisor_name: `${issue.department} Department Head`,
        role: "dept_head",
        department: issue.department,
      };
    }

    await recordAuditLog({
      actorType: "ai",
      action: "ESCALATION_TOOL_SUPERVISOR_FOUND",
      entityType: "profile",
      entityId: supervisor.supervisor_id,
      reasoning: {
        department: issue.department,
        supervisor_id: supervisor.supervisor_id,
        supervisor_name: supervisor.supervisor_name,
        role: supervisor.role,
      },
    });

    return supervisor;
  }

  /**
   * 4. reassign_issue(issue_id, officer_id)
   * Reassigns an issue to a less-loaded officer.
   */
  public async reassign_issue(issue_id: string, officer_id: string, reason?: string): Promise<ReassignResult> {
    const supabase = this.getSupabase();
    const now = new Date().toISOString();
    let previousOfficerId: string | null = null;

    if (supabase) {
      try {
        const { data: current } = await supabase
          .from("issues")
          .select("assigned_officer_id")
          .eq("id", issue_id)
          .single();

        previousOfficerId = current?.assigned_officer_id || null;

        await supabase
          .from("issues")
          .update({
            assigned_officer_id: officer_id,
            status: "assigned",
            updated_at: now,
          })
          .eq("id", issue_id);
      } catch (err) {
        console.warn(`[ESCALATION_TOOLS] Error reassigning issue ${issue_id} in DB:`, err);
      }
    }

    // In-memory update
    const mem = this.memoryIssues.get(issue_id);
    if (mem) {
      previousOfficerId = mem.assigned_officer_id || null;
      mem.assigned_officer_id = officer_id;
      mem.status = "assigned";
    }

    await recordAuditLog({
      actorType: "ai",
      action: "ISSUE_REASSIGNED",
      entityType: "issue",
      entityId: issue_id,
      reasoning: {
        new_officer_id: officer_id,
        previous_officer_id: previousOfficerId,
        reason: reason || "Workload rebalancing by autonomous escalation agent",
        reassigned_at: now,
      },
    });

    return {
      success: true,
      issue_id,
      new_officer_id: officer_id,
      previous_officer_id: previousOfficerId,
      reassigned_at: now,
      reason,
    };
  }

  /**
   * 5. draft_escalation_notice(issue, context)
   * Drafts formal escalation notice text in English with a concise Tamil summary.
   */
  public async draft_escalation_notice(
    issue: OverdueIssue,
    context: { supervisor_name: string; days_overdue?: number; reason?: string }
  ): Promise<string> {
    const breachHours = issue.sla_deadline
      ? Math.max(1, Math.round((Date.now() - new Date(issue.sla_deadline).getTime()) / (1000 * 60 * 60)))
      : 24;

    const notice = [
      `OFFICIAL NOTICE OF SLA BREACH & DEPARTMENTAL ESCALATION`,
      `======================================================`,
      `To: ${context.supervisor_name} (${issue.department} Department)`,
      `Issue ID: ${issue.id}`,
      `Department: ${issue.department} | Priority: ${issue.priority.toUpperCase()}`,
      `Breach Duration: SLA expired ${breachHours} hour(s) ago (${new Date(issue.sla_deadline).toLocaleString()})`,
      `Problem Statement: "${issue.issue_text}"`,
      ``,
      `Action Taken: Autonomous escalation triggered due to lack of resolution within designated citizen charter timeframe.`,
      `Assigned Officer Status: ${issue.assigned_officer_id ? "Assigned but unfulfilled" : "Unassigned in queue"}`,
      context.reason ? `Analysis: ${context.reason}` : `Analysis: Workload saturation preventing timely field remediation.`,
      ``,
      `அவசரக் குறிப்பு (Tamil Summary):`,
      `"${issue.department} துறைக்கான மக்கள் குறைதீர்ப்பு காலக்கெடு ${breachHours} மணிநேரம் கடந்துவிட்டது. உடனடியாக ஆய்வு செய்து நடவடிக்கை எடுக்கவும்."`,
    ].join("\n");

    await recordAuditLog({
      actorType: "ai",
      action: "ESCALATION_TOOL_NOTICE_DRAFTED",
      entityType: "issue",
      entityId: issue.id,
      reasoning: {
        supervisor_name: context.supervisor_name,
        breach_hours: breachHours,
        notice_length: notice.length,
      },
    });

    return notice;
  }

  /**
   * 6. escalate_issue(issue_id, supervisor_id, notice, reasoning)
   * Formally escalates the issue to the supervisor and marks status as 'escalated'.
   */
  public async escalate_issue(
    issue_id: string,
    supervisor_id: string,
    notice: string,
    reasoning: string
  ): Promise<EscalationResult> {
    const supabase = this.getSupabase();
    const now = new Date().toISOString();
    let supervisorName = "Department Supervisor";

    if (supabase) {
      try {
        const { data: supervisor } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", supervisor_id)
          .maybeSingle();

        if (supervisor?.name) {
          supervisorName = supervisor.name;
        }

        // Try updating phase 1 columns (escalation_notice, escalation_reason, escalated_to)
        const updatePayload: Record<string, unknown> = {
          status: "escalated",
          escalated_to: supervisor_id,
          escalation_notice: notice,
          escalation_reason: reasoning,
          updated_at: now,
        };

        const { error } = await supabase
          .from("issues")
          .update(updatePayload)
          .eq("id", issue_id);

        if (error && error.code === "42703") {
          // Pre-migration schema fallback
          await supabase
            .from("issues")
            .update({
              status: "escalated",
              updated_at: now,
            })
            .eq("id", issue_id);
        }
      } catch (err) {
        console.warn(`[ESCALATION_TOOLS] Error escalating issue ${issue_id} in DB:`, err);
      }
    }

    // In-memory update
    const mem = this.memoryIssues.get(issue_id);
    if (mem) {
      mem.status = "escalated";
      mem.escalated_to = supervisor_id;
      mem.escalation_notice = notice;
      mem.escalation_reason = reasoning;
    }

    await recordAuditLog({
      actorType: "ai",
      action: "ISSUE_ESCALATED",
      entityType: "issue",
      entityId: issue_id,
      reasoning: {
        status: "escalated",
        escalated_to: supervisor_id,
        supervisor_name: supervisorName,
        reasoning,
        notice_summary: notice.slice(0, 150),
        escalated_at: now,
      },
    });

    return {
      success: true,
      issue_id,
      status: "escalated",
      escalated_to: supervisor_id,
      supervisor_name: supervisorName,
      notice,
      reasoning,
      escalated_at: now,
    };
  }
}

export const escalationTools = new EscalationTools();
