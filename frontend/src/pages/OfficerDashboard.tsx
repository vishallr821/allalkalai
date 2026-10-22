import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import type { Issue } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import { DashboardLayout } from "../components/layout";
import {
  Card,
  LoadingState,
  EmptyState,
} from "../components/ui";
import StatusBadge from "../components/ui/StatusBadge";
import DepartmentBadge from "../components/ui/DepartmentBadge";
import {
  getRemainingTime,
  getSLAProgressPercent,
  getSLAProgressColor,
  DEPT_COLORS,
} from "../lib/utils";

export default function OfficerDashboard() {
  usePageTitle("My Issues");
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        setError("");
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        setUserId(user.id);

        console.log(`[PIPELINE_STEP_6b] Officer current user.id: "${user.id}" (type: ${typeof user.id}, length: ${user.id.length})`);
        console.log(`[PIPELINE_STEP_6c] Querying issues with assigned_officer_id = "${user.id}"`);

        const { data, error: fetchError } = await supabase
          .from("issues")
          .select("*")
          .eq("assigned_officer_id", user.id)
          .order("status", { ascending: true })
          .order("sla_deadline", { ascending: true });

        console.log(`[PIPELINE_STEP_6d] Supabase returned ${data?.length || 0} issues for officer`, data?.map((i: any) => ({ id: i.id, assigned_officer_id: i.assigned_officer_id, status: i.status })) || []);

        if (fetchError) throw fetchError;

        const sortedIssues = (data || []).sort((a, b) => {
          const aResolved = a.status === "resolved" ? 1 : 0;
          const bResolved = b.status === "resolved" ? 1 : 0;
          if (aResolved !== bResolved) return aResolved - bResolved;

          const aDeadline = a.sla_deadline
            ? new Date(a.sla_deadline).getTime()
            : Infinity;
          const bDeadline = b.sla_deadline
            ? new Date(b.sla_deadline).getTime()
            : Infinity;
          return aDeadline - bDeadline;
        });

        setIssues(sortedIssues);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [navigate]);

  // Real-time subscription for live updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`officer-issues-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
        },
        async () => {
          // Refetch issues for this officer
          try {
            const { data, error: fetchError } = await supabase
              .from("issues")
              .select("*")
              .eq("assigned_officer_id", userId)
              .order("status", { ascending: true })
              .order("sla_deadline", { ascending: true });

            if (!fetchError) {
              const sortedIssues = (data || []).sort((a, b) => {
                const aResolved = a.status === "resolved" ? 1 : 0;
                const bResolved = b.status === "resolved" ? 1 : 0;
                if (aResolved !== bResolved) return aResolved - bResolved;

                const aDeadline = a.sla_deadline
                  ? new Date(a.sla_deadline).getTime()
                  : Infinity;
                const bDeadline = b.sla_deadline
                  ? new Date(b.sla_deadline).getTime()
                  : Infinity;
                return aDeadline - bDeadline;
              });
              setIssues(sortedIssues);
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
  }, [userId]);

  if (loading) {
    return (
      <DashboardLayout role="officer">
        <LoadingState message="Loading your issues..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="officer">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">
            My Issues
          </h1>
          <p className="text-slate-500 text-sm mt-1">Assigned to you</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {issues.length === 0 ? (
          <EmptyState message="No issues assigned to you yet." />
        ) : (
          <div className="space-y-4">
            {issues.map((issue) => {
              const deptColor =
                DEPT_COLORS[issue.department as keyof typeof DEPT_COLORS] ||
                "#718096";
              const progressPercent = getSLAProgressPercent(issue.sla_deadline);
              const progressColor = getSLAProgressColor(issue.sla_deadline);

              return (
                <Link
                  key={issue.id}
                  to={`/officer/ticket/${issue.id}`}
                  className="block hover:shadow-lg transition-all duration-150 rounded-lg"
                >
                  <Card accentColor={deptColor}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex gap-2 items-center flex-wrap mb-2">
                          <DepartmentBadge department={issue.department as any} />
                          <StatusBadge status={issue.status as any} />
                          {issue.status === "resolved" ? (
                            issue.verification_status && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                  issue.verification_status === "verified"
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                    : issue.verification_status === "flagged"
                                    ? "bg-red-100 text-red-800 border border-red-300"
                                    : issue.verification_status === "pending"
                                    ? "bg-blue-100 text-blue-800 border border-blue-300 animate-pulse"
                                    : "bg-amber-100 text-amber-800 border border-amber-300"
                                }`}
                              >
                                AI {issue.verification_status.replace(/_/g, " ")}
                              </span>
                            )
                          ) : (
                            (issue.before_photo_url || issue.photo_url) && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                                📷 Photo Evidence
                              </span>
                            )
                          )}
                          {issue.duplicate_group_id && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                              👥 Clustered Issue
                            </span>
                          )}
                        </div>
                        <p className="text-slate-800 font-medium">{issue.issue_text}</p>
                      </div>
                      {issue.before_photo_url && (
                        <img
                          src={issue.before_photo_url}
                          alt="Citizen evidence"
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-2xs shrink-0"
                        />
                      )}
                    </div>

                    {issue.sla_deadline && (
                      <div className="space-y-2 pt-3 border-t border-slate-200">
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="text-slate-600">SLA Progress</span>
                          <span
                            className="font-medium"
                            style={{ color: progressColor }}
                          >
                            {getRemainingTime(issue.sla_deadline)}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${Math.min(progressPercent, 100)}%`,
                              backgroundColor: progressColor,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t border-slate-200">
                      <span className="text-slate-600 capitalize">
                        {issue.priority} priority
                      </span>
                      {issue.deadline && (
                        <span className="text-slate-600">
                          Due: {new Date(issue.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
    </DashboardLayout>
  );
}
