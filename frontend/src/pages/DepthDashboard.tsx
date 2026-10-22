import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Issue } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import { API_BASE_URL } from "../config";
import {
  Button,
  Card,
  Badge,
  Select,
  LoadingState,
} from "../components/ui";
import StatusBadge from "../components/ui/StatusBadge";
import DepartmentBadge from "../components/ui/DepartmentBadge";
import { DashboardLayout } from "../components/layout";
import { DEPT_COLORS } from "../lib/utils";

interface Officer {
  id: string;
  name: string;
  currentWorkload: number;
}

export default function DepthDashboard() {
  usePageTitle("Department Dashboard");
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [deptHeadDept, setDeptHeadDept] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigningIssueId, setAssigningIssueId] = useState<string | null>(null);
  const [selectedOfficer, setSelectedOfficer] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError("");
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("department")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        const dept = profileData?.department;
        if (!dept) throw new Error("Department not found in profile");

        console.log(`[PIPELINE_STEP_3] Dept head profile department: "${dept}" (type: ${typeof dept}, length: ${dept.length})`);

        setDeptHeadDept(dept);

        console.log(`[PIPELINE_STEP_5a] Querying issues with filter department = "${dept}"`);

        const { data: issuesData, error: issuesError } = await supabase
          .from("issues")
          .select("*")
          .eq("department", dept)
          .order("created_at", { ascending: false });

        console.log(`[PIPELINE_STEP_5b] Supabase returned ${issuesData?.length || 0} rows`, issuesData?.map((i: any) => ({ id: i.id, department: i.department, status: i.status })) || []);

        if (issuesError) throw issuesError;
        setIssues(issuesData || []);

        const { data: officersData, error: officersError } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("role", "officer")
          .eq("department", dept);

        if (officersError) throw officersError;

        const officersWithWorkload: Officer[] = await Promise.all(
          (officersData || []).map(async (officer: any) => {
            const { count, error: countError } = await supabase
              .from("issues")
              .select("*", { count: "exact", head: true })
              .eq("assigned_officer_id", officer.id)
              .in("status", ["assigned", "in_progress"]);

            if (countError) console.error("Error counting workload:", countError);

            return {
              id: officer.id,
              name: officer.name,
              currentWorkload: count || 0,
            };
          })
        );

        setOfficers(officersWithWorkload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  useEffect(() => {
    const channel = supabase
      .channel(`issues-${deptHeadDept}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
        },
        async () => {
          try {
            const { data: refreshedIssues, error: fetchError } = await supabase
              .from("issues")
              .select("*")
              .eq("department", deptHeadDept)
              .order("created_at", { ascending: false });

            if (!fetchError) {
              setIssues(refreshedIssues || []);
            }
          } catch (err) {
            console.error("Error refetching issues:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deptHeadDept]);

  const handleAssignOfficer = async (issueId: string, officerId: string) => {
    if (!officerId) {
      setError("Please select an officer");
      return;
    }

    try {
      setError("");
      setAssigningIssueId(issueId);

      const slaDeadline = new Date();
      slaDeadline.setHours(slaDeadline.getHours() + 48);

      console.log(`[PIPELINE_STEP_6a] Writing assigned_officer_id: "${officerId}" (type: ${typeof officerId}, length: ${officerId.length})`);

      const { error: updateError } = await supabase
        .from("issues")
        .update({
          assigned_officer_id: officerId,
          status: "assigned",
          sla_deadline: slaDeadline.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", issueId);

      if (updateError) throw updateError;

      setIssues(
        issues.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                assigned_officer_id: officerId,
                status: "assigned" as const,
                sla_deadline: slaDeadline.toISOString(),
              }
            : issue
        )
      );

      setOfficers(
        officers.map((officer) =>
          officer.id === officerId
            ? { ...officer, currentWorkload: officer.currentWorkload + 1 }
            : officer
        )
      );

      setSelectedOfficer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setAssigningIssueId(null);
    }
  };

  const [checkingSLA, setCheckingSLA] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [viewMode, setViewMode] = useState<"board" | "escalation_audit" | "verification_queue">("board");
  const [escalationReports, setEscalationReports] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [fastForwarding, setFastForwarding] = useState(false);

  const reviewQueueIssues = issues.filter(
    (i) => Boolean(i.after_photo_url) || i.verification_status === "needs_review" || i.verification_status === "flagged"
  );

  const handleApproveResolution = async (issueId: string) => {
    try {
      await supabase.from("issues").update({ verification_status: "verified" }).eq("id", issueId);
      setIssues(issues.map((i) => (i.id === issueId ? { ...i, verification_status: "verified" } : i)));
    } catch (err) {
      console.error("Failed to approve resolution:", err);
    }
  };

  const handleRejectResolution = async (issueId: string) => {
    try {
      await supabase.from("issues").update({ status: "in_progress", verification_status: "flagged" }).eq("id", issueId);
      setIssues(issues.map((i) => (i.id === issueId ? { ...i, status: "in_progress", verification_status: "flagged" } : i)));
    } catch (err) {
      console.error("Failed to reject resolution:", err);
    }
  };

  const fetchEscalationAudit = async () => {
    try {
      setLoadingAudit(true);
      const res = await fetch(`${API_BASE_URL}/api/admin/escalation-audit`);
      if (res.ok) {
        const data = await res.json();
        setEscalationReports(data.history || []);
      }
    } catch (err) {
      console.warn("Failed to fetch escalation audit:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (viewMode === "escalation_audit") {
      fetchEscalationAudit();
    }
  }, [viewMode]);

  const handleRunEscalation = async () => {
    try {
      setError("");
      setCheckingSLA(true);

      const response = await fetch(`${API_BASE_URL}/api/admin/run-escalation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to run escalation agent");
      }

      await fetchEscalationAudit();

      // Refresh issues
      const { data: refreshedIssues, error: fetchError } = await supabase
        .from("issues")
        .select("*")
        .eq("department", deptHeadDept)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setIssues(refreshedIssues || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setCheckingSLA(false);
    }
  };

  const handleFastForwardDemo = async () => {
    try {
      setError("");
      setFastForwarding(true);

      const response = await fetch(`${API_BASE_URL}/api/demo/fast-forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutesAgo: 180,
          department: deptHeadDept || "Electricity",
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Fast-forward failed");
      }

      await fetchEscalationAudit();

      // Switch to escalation audit view automatically so the user sees the trace instantly!
      setViewMode("escalation_audit");

      // Refresh issues
      const { data: refreshedIssues } = await supabase
        .from("issues")
        .select("*")
        .eq("department", deptHeadDept)
        .order("created_at", { ascending: false });

      if (refreshedIssues) setIssues(refreshedIssues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fast-forward failed");
    } finally {
      setFastForwarding(false);
    }
  };

  const isSlaPassed = (slaDeadline: string | null, status: string) => {
    if (!slaDeadline || status === "resolved") return false;
    return new Date(slaDeadline) < new Date();
  };

  const getIssuesByStatus = (status: string) => {
    return issues.filter((issue) => issue.status === status);
  };

  const statusCounts = {
    new: getIssuesByStatus("new").length,
    assigned: getIssuesByStatus("assigned").length,
    in_progress: getIssuesByStatus("in_progress").length,
    escalated: getIssuesByStatus("escalated").length,
    resolved: getIssuesByStatus("resolved").length,
  };

  const deptColor =
    DEPT_COLORS[deptHeadDept as keyof typeof DEPT_COLORS] || "#718096";

  if (loading) {
    return (
      <DashboardLayout role="dept_head">
        <LoadingState message="Loading issues..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="dept_head">
      <div className="space-y-6">
        {/* Header with Autonomous Agent Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-800">
                {deptHeadDept} Department Management
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                Autonomous SLA Agent Active
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Autonomous, tool-using escalation engine monitoring field resolution deadlines.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={handleRunEscalation}
              disabled={checkingSLA}
              className="text-xs"
            >
              {checkingSLA ? "Running Agent..." : "Trigger Escalation Cycle"}
            </Button>
            <Button
              variant="primary"
              onClick={handleFastForwardDemo}
              disabled={fastForwarding}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white border-none"
            >
              {fastForwarding ? "Fast-Forwarding..." : "⚡ Fast-Forward SLA Demo"}
            </Button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setViewMode("board")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === "board"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            📋 Department Board ({issues.length})
          </button>
          <button
            onClick={() => setViewMode("escalation_audit")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              viewMode === "escalation_audit"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            🤖 Escalation Audit
            {statusCounts.escalated > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {statusCounts.escalated}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("verification_queue")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              viewMode === "verification_queue"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            🔍 Review & Approvals
            {reviewQueueIssues.length > 0 && (
              <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {reviewQueueIssues.length}
              </span>
            )}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {viewMode === "escalation_audit" ? (
          /* ESCALATION AUDIT PANEL */
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Autonomous SLA Escalation Audit Trail
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Complete step-by-step reasoning traces generated by the Tier 2 function-calling agent.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={fetchEscalationAudit}
                  disabled={loadingAudit}
                  className="text-xs"
                >
                  {loadingAudit ? "Refreshing..." : "Refresh Audit Logs"}
                </Button>
              </div>
            </Card>

            {loadingAudit ? (
              <LoadingState message="Fetching agent reasoning traces..." />
            ) : escalationReports.length === 0 ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-4xl mb-3">🛡️</p>
                  <h3 className="text-base font-semibold text-slate-800">No Escalations Recorded</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    All departmental complaints are currently progressing within their SLA timeframes.
                    Use the demo button above to fast-forward an issue and view the agent live.
                  </p>
                  <Button
                    variant="primary"
                    onClick={handleFastForwardDemo}
                    disabled={fastForwarding}
                    className="mt-4 text-xs bg-amber-600 hover:bg-amber-700"
                  >
                    ⚡ Fast-Forward SLA Demo
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {escalationReports.map((report, idx) => (
                  <Card key={`${report.issue_id}-${idx}`} className="space-y-4">
                    <div className="flex items-start justify-between flex-wrap gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {report.issue_id}
                          </code>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {report.department}
                          </span>
                          {report.action_taken === "escalated" ? (
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                              ⚠ ESCALATED TO SUPERVISOR
                            </span>
                          ) : report.action_taken === "reassigned" ? (
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                              ↻ REASSIGNED TO LESS-LOADED OFFICER
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              SKIPPED (IDEMPOTENT)
                            </span>
                          )}
                        </div>
                        {report.reasoning && (
                          <p className="text-sm font-medium text-slate-800 mt-2">
                            {report.reasoning}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded">
                        Latency: {report.latency_ms}ms
                      </span>
                    </div>

                    {/* Step-by-Step Reasoning Trace */}
                    {report.reasoning_trace && report.reasoning_trace.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                          Agent Step-by-Step Reasoning Trace
                        </h4>
                        <div className="space-y-2.5">
                          {report.reasoning_trace.map((step: any, sIdx: number) => (
                            <div
                              key={sIdx}
                              className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white inline-flex items-center justify-center text-[10px]">
                                    {step.step || sIdx + 1}
                                  </span>
                                  Tool: <code className="font-mono text-blue-700">{step.tool}</code>
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : ""}
                                </span>
                              </div>
                              <p className="text-slate-700 font-medium pl-6">
                                {step.thought}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notice Card Preview (if escalated) */}
                    {report.notice && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                            Drafted Bilingual Escalation Notice
                          </p>
                          {report.supervisor_name && (
                            <span className="text-xs font-medium text-amber-800">
                              Escalated to: <strong>{report.supervisor_name}</strong>
                            </span>
                          )}
                        </div>
                        <pre className="text-xs font-mono text-amber-950 whitespace-pre-wrap bg-white/70 p-3 rounded border border-amber-200/60 max-h-48 overflow-y-auto">
                          {report.notice}
                        </pre>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : viewMode === "verification_queue" ? (
          /* VERIFICATION & APPROVALS QUEUE */
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    AI Photo Verification & Resolution Approval Queue
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Review completed field tasks with multimodal Before/After photos and automated AI verification scores.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                  {reviewQueueIssues.length} In Review Queue
                </span>
              </div>
            </Card>

            {reviewQueueIssues.length === 0 ? (
              <Card>
                <div className="text-center py-10 space-y-2">
                  <p className="text-3xl">✨</p>
                  <h3 className="text-base font-semibold text-slate-800">No Pending Approvals</h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    All resolution photos have been verified or no tasks are currently awaiting supervisor sign-off.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {reviewQueueIssues.map((issue) => (
                  <Card key={issue.id} className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <DepartmentBadge department={issue.department as any} />
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          issue.verification_status === "verified"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : issue.verification_status === "flagged"
                            ? "bg-red-100 text-red-800 border border-red-300"
                            : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                      >
                        {issue.verification_status || "Needs Review"}
                      </span>
                    </div>

                    <p className="text-sm text-slate-800 font-semibold leading-snug">
                      {issue.issue_text}
                    </p>

                    {/* Before & After Viewer */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-100/70 p-2 rounded-xl">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Before Photo</span>
                        <div className="aspect-4/3 rounded-lg overflow-hidden bg-slate-200">
                          {issue.before_photo_url ? (
                            <img
                              src={issue.before_photo_url}
                              alt="Before"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                              No before photo
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase">After Resolution</span>
                        <div className="aspect-4/3 rounded-lg overflow-hidden bg-slate-200">
                          {issue.after_photo_url ? (
                            <img
                              src={issue.after_photo_url}
                              alt="After"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                              No after photo
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* AI Scoring Note */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">AI Confidence:</span>
                        <span className="font-mono font-bold text-violet-700">
                          {issue.verification_score ? `${Math.round(issue.verification_score * 100)}% Match` : "Automated Check Pending"}
                        </span>
                      </div>
                      {issue.verification_flag_reason && (
                        <p className="text-red-700 text-[11px]">
                          <strong>Flag:</strong> {issue.verification_flag_reason}
                        </p>
                      )}
                    </div>

                    {/* Approval / Rejection Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <Button
                        variant="primary"
                        onClick={() => handleApproveResolution(issue.id)}
                        className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                      >
                        ✓ Approve & Verify
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleRejectResolution(issue.id)}
                        className="text-xs text-red-700 hover:bg-red-50 border-red-200"
                      >
                        Reject / Re-work
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* KANBAN BOARD VIEW */
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-800">
                    {statusCounts.new}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">New</div>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-800">
                    {statusCounts.assigned}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Assigned</div>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-800">
                    {statusCounts.in_progress}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">In Progress</div>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-red-600">
                    {statusCounts.escalated}
                  </div>
                  <div className="text-sm text-red-600 mt-1 font-medium">Escalated</div>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-800">
                    {statusCounts.resolved}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Resolved</div>
                </div>
              </Card>
            </div>

            {/* 5-Column Grid */}
            <div className="hidden lg:grid grid-cols-5 gap-4">
              {["new", "assigned", "in_progress", "escalated", "resolved"].map((status) => (
                <div key={status} className="space-y-3">
                  <h3 className="font-semibold text-slate-700 capitalize text-sm flex items-center justify-between">
                    <span>{status.replace(/_/g, " ")}</span>
                    <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full font-bold text-slate-700">
                      {getIssuesByStatus(status).length}
                    </span>
                  </h3>
                  {getIssuesByStatus(status).map((issue) => (
                    <Card key={issue.id} accentColor={status === "escalated" ? "#EF4444" : deptColor}>
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center flex-wrap">
                          <DepartmentBadge department={issue.department as any} />
                          <StatusBadge status={issue.status as any} />
                          {isSlaPassed(issue.sla_deadline, issue.status) && (
                            <Badge label="Overdue" color="#EF4444" />
                          )}
                        </div>
                        <p className="text-sm text-slate-800 font-medium line-clamp-2">
                          {issue.issue_text}
                        </p>
                        {issue.priority && (
                          <p className="text-xs text-slate-500">
                            Priority: {issue.priority}
                          </p>
                        )}
                        {issue.deadline && (
                          <p className="text-xs text-slate-500">
                            Due: {new Date(issue.deadline).toLocaleDateString()}
                          </p>
                        )}
                        {issue.status === "escalated" && (
                          <div className="mt-2 pt-2 border-t border-red-200 text-xs text-red-700 bg-red-50 p-2 rounded">
                            <p className="font-bold">⚠ Escalated to Supervisor</p>
                            <p className="mt-0.5 text-[11px] line-clamp-2">
                              {issue.escalation_reason || "Resolution deadline breached."}
                            </p>
                          </div>
                        )}
                      </div>

                      {status === "new" && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                          <Select
                            id={`officer-${issue.id}`}
                            value={assigningIssueId === issue.id ? selectedOfficer : ""}
                            onChange={(e) => setSelectedOfficer(e.target.value)}
                            disabled={assigningIssueId === issue.id}
                            className="text-xs"
                          >
                            <option value="">Select officer...</option>
                            {officers.map((officer) => (
                              <option key={officer.id} value={officer.id}>
                                {officer.name} ({officer.currentWorkload})
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="primary"
                            onClick={() => handleAssignOfficer(issue.id, selectedOfficer)}
                            disabled={assigningIssueId === issue.id || !selectedOfficer}
                            className="w-full text-xs"
                          >
                            {assigningIssueId === issue.id ? "Assigning..." : "Assign"}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ))}
            </div>

            {/* Mobile Tabbed View */}
            <div className="lg:hidden space-y-4">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {["new", "assigned", "in_progress", "escalated", "resolved"].map((status) => (
                  <Button
                    key={status}
                    variant={activeTab === status ? "primary" : "secondary"}
                    onClick={() => setActiveTab(status)}
                    className="text-xs whitespace-nowrap"
                  >
                    {status.replace(/_/g, " ")} ({getIssuesByStatus(status).length})
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                {getIssuesByStatus(activeTab).map((issue) => (
                  <Card key={issue.id} accentColor={issue.status === "escalated" ? "#EF4444" : deptColor}>
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center flex-wrap">
                        <DepartmentBadge department={issue.department as any} />
                        <StatusBadge status={issue.status as any} />
                        {isSlaPassed(issue.sla_deadline, issue.status) && (
                          <Badge label="Overdue" color="#EF4444" />
                        )}
                      </div>
                      <p className="text-sm text-slate-800 font-medium line-clamp-2">
                        {issue.issue_text}
                      </p>
                      {issue.status === "escalated" && (
                        <div className="text-xs text-red-700 bg-red-50 p-2 rounded">
                          <p className="font-bold">⚠ Escalated to Supervisor</p>
                          <p className="mt-0.5 text-[11px] line-clamp-2">
                            {issue.escalation_reason || "Resolution deadline breached."}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
