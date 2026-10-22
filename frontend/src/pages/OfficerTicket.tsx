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
import { DEPT_COLORS } from "../lib/utils";
import { compressImage } from "../lib/imageCompression";

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
        await fetchVerificationStatus(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchIssue();
  }, [issueId, navigate]);

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

            await supabase.from("resolution_photos").insert({
              issue_id: issue.id,
              photo_url: uploadedPhotoUrl,
              uploaded_by: user.id,
            });
          }
        } catch (photoErr) {
          console.error("Error uploading resolution photo:", photoErr);
        }
      }

      // 2. Call backend mark-resolved (returns instantly < 50ms)
      const response = await fetch(`${API_BASE_URL}/api/mark-resolved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: issue.id,
          resolutionNote: resolutionNote.trim() || null,
          photoUrl: uploadedPhotoUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Backend error: ${response.statusText}`);
      }

      await response.json();

      setIssue({
        ...issue,
        status: "resolved",
        resolution_note: resolutionNote.trim() || null,
        resolution_photo_url: uploadedPhotoUrl,
      });

      if (uploadedPhotoUrl) {
        setVerificationData({
          status: "pending",
          score: undefined,
          reason: "AI photo verification is running in the background...",
        });
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
                <p className="font-medium text-slate-600">SLA Deadline</p>
                <p className="text-slate-800">
                  {new Date(issue.sla_deadline).toLocaleString()}
                </p>
              </div>
            )}

            {/* Before / After Photo Verification Section */}
            {(beforePhotoUrl || issue.resolution_photo_url) && (
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
                    {issue.resolution_photo_url ? (
                      <img
                        src={issue.resolution_photo_url}
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

          {issue.status === "in_progress" && (
            <div className="space-y-4">
              <Textarea
                label="Resolution note (optional if you attach a photo)"
                id="resolution-note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                disabled={actionLoading}
                placeholder="Describe what was done to resolve this issue..."
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
                className="w-full"
              >
                {actionLoading ? "Marking resolved..." : "Mark Resolved"}
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

          {issue.status === "escalated" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-medium">
                ⚠ This issue has been escalated.
              </p>
              <p className="text-sm text-red-700 mt-1">
                Contact your department head for instructions.
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
