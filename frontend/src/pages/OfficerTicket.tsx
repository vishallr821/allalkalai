import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { Issue } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import { API_BASE_URL } from "../config";
import { DashboardLayout } from "../components/layout";
import {
  Card,
  Button,
  LoadingState,
  Textarea,
} from "../components/ui";
import StatusBadge from "../components/ui/StatusBadge";
import DepartmentBadge from "../components/ui/DepartmentBadge";
import PhotoCapture from "../components/PhotoCapture";
import { DEPT_COLORS, getRemainingTime, getSLAProgressColor, isOverdue } from "../lib/utils";
import { compressImage } from "../lib/imageCompression";
import { verifyResolutionPhotoClient } from "../services/photoVerification";

export default function OfficerTicket() {
  usePageTitle("Issue Details");
  const { issueId } = useParams<{ issueId: string }>();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [resolutionPhotos, setResolutionPhotos] = useState<File[]>([]);
  const [resolutionNote, setResolutionNote] = useState("");

  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<{
    status: "pending" | "verified" | "flagged" | "needs_review" | "not_required";
    score?: number;
    reason?: string;
  } | null>(null);

  const fetchVerificationStatus = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/issue-verification/${id}`);
      if (res.ok) {
        const v = await res.json();
        setVerificationData({
          status: v.verification_status,
          score: v.verification_score,
          reason: v.verification_flag_reason,
        });
        if (v.before_photo_url) {
          setBeforePhotoUrl(v.before_photo_url);
        }
        return v.verification_status;
      }
    } catch {
      // Ignored if offline
    }
    return null;
  };

  useEffect(() => {
    const fetchIssue = async () => {
      try {
        setError("");
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        if (!issueId) throw new Error("Issue ID is required");

        const { data, error: fetchError } = await supabase
          .from("issues")
          .select("*")
          .eq("id", issueId)
          .eq("assigned_officer_id", user.id)
          .single();

        if (fetchError) throw fetchError;
        setIssue(data);

        // Fetch citizen before photo
        let beforeUrl = data.before_photo_url;
        if (!beforeUrl && data.parent_ticket_id) {
          const { data: ticketPhoto } = await supabase
            .from("ticket_photos")
            .select("photo_url")
            .eq("ticket_id", data.parent_ticket_id)
            .limit(1)
            .maybeSingle();
          if (ticketPhoto?.photo_url) {
            beforeUrl = ticketPhoto.photo_url;
          } else {
            const { data: parentTicket } = await supabase
              .from("tickets")
              .select("photo_url")
              .eq("id", data.parent_ticket_id)
              .maybeSingle();
            beforeUrl = parentTicket?.photo_url;
          }
        }
        setBeforePhotoUrl(beforeUrl || null);

        // Fetch verification state
        if (data.verification_status) {
          setVerificationData({
            status: data.verification_status,
            score: data.verification_score,
            reason: data.verification_flag_reason,
          });
        }
        await fetchVerificationStatus(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchIssue();
  }, [issueId, navigate]);

  // Real-time subscription for live ticket updates (SLA deadline fast forward, escalation)
  useEffect(() => {
    if (!issueId) return;

    const channel = supabase
      .channel(`ticket-live-${issueId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "issues",
          filter: `id=eq.${issueId}`,
        },
        (payload) => {
          if (payload.new) {
            setIssue((prev) => (prev ? { ...prev, ...(payload.new as Issue) } : (payload.new as Issue)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [issueId]);

  // Polling for background photo verification completion
  useEffect(() => {
    if (!issueId || verificationData?.status !== "pending") return;

    const interval = setInterval(async () => {
      const status = await fetchVerificationStatus(issueId);
      if (status && status !== "pending") {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [issueId, verificationData?.status]);

  const handleStartWork = async () => {
    if (!issue) return;

    try {
      setError("");
      setActionLoading(true);

      const { error: updateError } = await supabase
        .from("issues")
        .update({
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", issue.id);

      if (updateError) throw updateError;

      setIssue({ ...issue, status: "in_progress" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!issue) return;
    if (!resolutionNote.trim() && resolutionPhotos.length === 0) {
      setError("Please add a note or a photo to confirm completion");
      return;
    }

    try {
      setError("");
      setActionLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let uploadedPhotoUrl: string | null = null;

      // 1. If photo attached, compress client-side then upload to storage
      if (resolutionPhotos.length > 0) {
        const rawPhotoFile = resolutionPhotos[0];
        try {
          const { file: photoFile } = await compressImage(rawPhotoFile, { maxDimension: 1280, quality: 0.8 });
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(photoFile);
          });
          const base64Data = await base64Promise;

          // Attempt backend upload with service role first
          try {
            const upRes = await fetch(`${API_BASE_URL}/api/upload-photo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bucket: "resolution-photos",
                base64: base64Data,
                contentType: photoFile.type || "image/jpeg",
              }),
            });
            if (upRes.ok) {
              const upData = await upRes.json();
              uploadedPhotoUrl = upData.publicUrl;
            }
          } catch (backendUpErr) {
            console.warn("Backend upload failed, attempting direct Supabase or data URI:", backendUpErr);
          }

          if (!uploadedPhotoUrl) {
            // Direct Supabase storage attempt
            const fileExt = photoFile.name.split(".").pop() || "jpg";
            const fileName = `resolution/${issue.id}/${crypto.randomUUID()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
              .from("resolution-photos")
              .upload(fileName, photoFile);

            if (!uploadError) {
              const { data } = supabase.storage
                .from("resolution-photos")
                .getPublicUrl(fileName);
              uploadedPhotoUrl = data.publicUrl;
            } else {
              uploadedPhotoUrl = base64Data;
            }
          }

          if (uploadedPhotoUrl) {
            try {
              await supabase.from("resolution_photos").insert({
                issue_id: issue.id,
                photo_url: uploadedPhotoUrl,
                uploaded_by: user.id,
              });
            } catch {}
          }
        } catch (photoErr) {
          console.error("Error uploading resolution photo:", photoErr);
        }
      }

      // 2. Call backend mark-resolved (returns instantly < 50ms)
      let resolvedByApi = false;
      try {
        const response = await fetch(`${API_BASE_URL}/api/mark-resolved`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issueId: issue.id,
            resolutionNote: resolutionNote.trim() || null,
            photoUrl: uploadedPhotoUrl,
          }),
        });
        if (response.ok) {
          resolvedByApi = true;
          await response.json();
        }
      } catch (apiErr) {
        console.warn("Backend mark-resolved unreachable, updating directly in Supabase:", apiErr);
      }

      if (!resolvedByApi) {
        const nowIso = new Date().toISOString();
        const { error: directErr } = await supabase
          .from("issues")
          .update({
            status: "resolved",
            resolution_note: resolutionNote.trim() || null,
            resolution_photo_url: uploadedPhotoUrl,
            after_photo_url: uploadedPhotoUrl,
            before_photo_url: beforePhotoUrl,
            verification_status: uploadedPhotoUrl ? "pending" : "not_required",
            updated_at: nowIso,
          })
          .eq("id", issue.id);

        if (directErr) {
          throw new Error(directErr.message || "Failed to mark issue as resolved in database");
        }
      }

      setIssue({
        ...issue,
        status: "resolved",
        resolution_note: resolutionNote.trim() || null,
        resolution_photo_url: uploadedPhotoUrl,
        after_photo_url: uploadedPhotoUrl,
      });

      if (uploadedPhotoUrl) {
        setVerificationData({
          status: "pending",
          score: undefined,
          reason: "AI vision verification evaluating submitted proof...",
        });

        // Trigger immediate AI multimodal inspection
        try {
          const vResult = await verifyResolutionPhotoClient({
            issueId: issue.id,
            beforePhotoUrl: beforePhotoUrl || issue.before_photo_url,
            afterPhotoUrl: uploadedPhotoUrl,
            department: issue.department,
            issueText: issue.issue_text,
          });

          setVerificationData({
            status: vResult.status,
            score: vResult.score,
            reason: vResult.reason,
          });

          setIssue((prev) =>
            prev
              ? {
                  ...prev,
                  verification_status: vResult.status,
                  verification_score: vResult.score,
                  verification_flag_reason: vResult.reason,
                }
              : prev
          );
        } catch (verifyErr) {
          console.warn("[OFFICER_TICKET] Auto-verification error:", verifyErr);
        }
      }

      setResolutionPhotos([]);
      setResolutionNote("");

    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="officer">
        <LoadingState message="Loading issue..." />
      </DashboardLayout>
    );
  }

  if (!issue) {
    return (
      <DashboardLayout role="officer">
        <Card>
          <p className="text-center text-slate-600">Issue not found</p>
        </Card>
      </DashboardLayout>
    );
  }

  const deptColor =
    DEPT_COLORS[issue.department as keyof typeof DEPT_COLORS] || "#718096";

  return (
    <DashboardLayout role="officer">
      <Link
        to="/officer/dashboard"
        className="text-blue-600 hover:underline font-medium text-sm mb-6 inline-block"
      >
        ← Back to My Issues
      </Link>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <Card accentColor={deptColor} className="mb-6">
          <div className="mb-4">
            <div className="flex gap-2 items-center flex-wrap mb-2">
              <DepartmentBadge department={issue.department as any} />
              <StatusBadge status={issue.status as any} />
            </div>
            <h1 className="text-2xl font-semibold text-slate-800">
              {issue.issue_text}
            </h1>
            <code className="font-mono text-xs text-slate-600 mt-2 inline-block">
              {issue.id}
            </code>
          </div>

          <div className="space-y-4 text-sm pt-4 border-t border-slate-200">
            <div>
              <p className="font-medium text-slate-600">Priority</p>
              <p className="text-slate-800 capitalize font-medium">{issue.priority}</p>
            </div>

            {issue.deadline && (
              <div>
                <p className="font-medium text-slate-600">Deadline</p>
                <p className="text-slate-800">
                  {new Date(issue.deadline).toLocaleDateString()}
                </p>
              </div>
            )}

            {issue.sla_deadline && (
              <div>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-600">SLA Deadline</p>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      color: getSLAProgressColor(issue.sla_deadline),
                      backgroundColor: isOverdue(issue.sla_deadline) ? "#FEE2E2" : "#E0F2FE",
                    }}
                  >
                    {getRemainingTime(issue.sla_deadline)}
                  </span>
                </div>
                <p className="text-slate-800">
                  {new Date(issue.sla_deadline).toLocaleString()}
                </p>
              </div>
            )}

            {/* Before / After Photo Verification Section */}
            {(beforePhotoUrl || issue.resolution_photo_url || issue.after_photo_url) && (
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <p className="font-semibold text-slate-800">
                    Before / After Photo Verification
                  </p>
                  {verificationData && (
                    <div>
                      {verificationData.status === "verified" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
                          ✓ Verified ({Math.round((verificationData.score ?? 0.9) * 100)}% match) — Work Completed
                        </span>
                      )}
                      {verificationData.status === "needs_review" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          ⚠ Needs Review ({Math.round((verificationData.score ?? 0.5) * 100)}%)
                        </span>
                      )}
                      {verificationData.status === "flagged" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                          ✕ Flagged ({Math.round((verificationData.score ?? 0.1) * 100)}%)
                        </span>
                      )}
                      {verificationData.status === "pending" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">
                          ⚡ AI Vision Verification In Progress...
                        </span>
                      )}
                      {verificationData.status === "not_required" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                          Not Required
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {verificationData?.reason && verificationData.status !== "verified" && (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 mb-3">
                    <span className="font-medium">Verification Note:</span> {verificationData.reason}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Before Photo */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                      Before (Citizen Complaint)
                    </p>
                    {beforePhotoUrl ? (
                      <img
                        src={beforePhotoUrl}
                        alt="Before repair"
                        className="w-full h-48 object-cover rounded-md border border-slate-200"
                      />
                    ) : (
                      <div className="w-full h-48 flex items-center justify-center bg-slate-100 rounded-md text-xs text-slate-400">
                        No initial citizen photo provided
                      </div>
                    )}
                  </div>

                  {/* After Photo */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                      After (Officer Resolution)
                    </p>
                    {(issue.resolution_photo_url || issue.after_photo_url) ? (
                      <img
                        src={issue.resolution_photo_url || issue.after_photo_url || ""}
                        alt="After repair"
                        className="w-full h-48 object-cover rounded-md border border-slate-200"
                      />
                    ) : (
                      <div className="w-full h-48 flex items-center justify-center bg-slate-100 rounded-md text-xs text-slate-400">
                        Resolution photo pending upload
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Next Steps
          </h2>

          {issue.status === "assigned" && (
            <Button
              variant="primary"
              onClick={handleStartWork}
              disabled={actionLoading}
              className="w-full"
            >
              {actionLoading ? "Starting work..." : "Start Work"}
            </Button>
          )}

          {issue.status === "escalated" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-red-800 font-bold text-base">
                    ⚠ Escalated Issue Notice
                  </p>
                  <span className="text-xs bg-red-200 text-red-900 font-semibold px-2 py-0.5 rounded">
                    {isOverdue(issue.sla_deadline) ? "SLA Breached" : "Escalated"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-red-700">
                This ticket has been escalated to your department head due to SLA deadline expiration. You can complete field resolution below to resolve and close this ticket.
              </p>
              {issue.escalation_reason && (
                <div className="text-xs text-red-900 bg-red-100/70 p-2.5 rounded border border-red-200">
                  <span className="font-bold">Breach Reason:</span> {issue.escalation_reason}
                </div>
              )}
            </div>
          )}

          {issue.status === "in_progress" && issue.verification_status === "flagged" && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-2 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xl">❌</span>
                <p className="text-red-900 font-bold text-base">
                  Resolution Rejected by Department Head — Re-work Required
                </p>
              </div>
              <p className="text-sm text-red-800">
                The supervisor reviewed the submitted proof and marked this ticket for on-site re-work. Please inspect the site, complete the physical repairs, and upload fresh photo evidence.
              </p>
              {issue.verification_flag_reason && (
                <div className="text-xs text-red-950 bg-white/90 p-3 rounded-lg border border-red-200 shadow-xs">
                  <span className="font-bold">Supervisor Note:</span> {issue.verification_flag_reason}
                </div>
              )}
            </div>
          )}

          {(issue.status === "in_progress" || issue.status === "escalated") && (
            <div className="space-y-4">
              <Textarea
                label={issue.status === "escalated" ? "Resolution note / Delay explanation" : "Resolution note (optional if you attach a photo)"}
                id="resolution-note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                disabled={actionLoading}
                placeholder={issue.status === "escalated" ? "Describe how this issue was resolved and the reason for the SLA delay..." : "Describe what was done to resolve this issue..."}
                className="h-32 resize-none"
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Photos (optional if you write a note)
                </label>
                <PhotoCapture
                  maxPhotos={4}
                  onChange={setResolutionPhotos}
                />
              </div>

              {!resolutionNote.trim() && resolutionPhotos.length === 0 && (
                <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  Add a note or a photo to confirm completion
                </p>
              )}

              <Button
                variant="primary"
                onClick={handleMarkResolved}
                disabled={actionLoading || (!resolutionNote.trim() && resolutionPhotos.length === 0)}
                className={`w-full font-semibold ${issue.status === "escalated" ? "bg-amber-600 hover:bg-amber-700 text-white shadow-md" : ""}`}
              >
                {actionLoading
                  ? "Marking resolved..."
                  : issue.status === "escalated"
                  ? "✓ Resolve & Close Escalated Ticket"
                  : "Mark Resolved"}
              </Button>
            </div>
          )}

          {issue.status === "resolved" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium">
                ✓ This issue has been resolved.
              </p>
              <p className="text-sm text-green-700 mt-1">
                Resolved on {new Date(issue.updated_at).toLocaleString()}
              </p>
            </div>
          )}

          {issue.status === "new" && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-slate-800 font-medium">
                This issue has not been started yet.
              </p>
            </div>
          )}
        </Card>
    </DashboardLayout>
  );
}
