import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { Ticket, Issue } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import {
  Card,
  Button,
  LoadingState,
  Badge,
  Textarea,
} from "../components/ui";
import StatusBadge from "../components/ui/StatusBadge";
import DepartmentBadge from "../components/ui/DepartmentBadge";
import StatusStepper from "../components/StatusStepper";
import { DEPT_COLORS, formatRelativeTime } from "../lib/utils";

export default function CitizenTrack() {
  usePageTitle("Complaint Details");
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingIssueId, setUpdatingIssueId] = useState<string | null>(null);
  const [ticketPhotos, setTicketPhotos] = useState<Array<{ id: string; photo_url: string }>>([]);
  const [resolutionPhotosByIssue, setResolutionPhotosByIssue] = useState<
    Record<string, Array<{ id: string; photo_url: string }>>
  >({});
  const [feedbackPanelIssueId, setFeedbackPanelIssueId] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

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

        if (!ticketId) throw new Error("Ticket ID is required");

        const { data: ticketData, error: ticketError } = await supabase
          .from("tickets")
          .select("*")
          .eq("id", ticketId)
          .eq("citizen_id", user.id)
          .single();

        if (ticketError) throw ticketError;
        setTicket(ticketData);

        const { data: issuesData, error: issuesError } = await supabase
          .from("issues")
          .select("*")
          .eq("parent_ticket_id", ticketId)
          .order("created_at", { ascending: false });

        if (issuesError) throw issuesError;
        setIssues(issuesData || []);

        if (ticketId) {
          const { data: photoData } = await supabase
            .from("ticket_photos")
            .select("id, photo_url")
            .eq("ticket_id", ticketId);
          setTicketPhotos(photoData || []);

          const issueIds = issuesData?.map((i) => i.id) || [];
          if (issueIds.length > 0) {
            const { data: resPhotoData } = await supabase
              .from("resolution_photos")
              .select("id, issue_id, photo_url")
              .in("issue_id", issueIds);

            const photosByIssue: Record<string, Array<{ id: string; photo_url: string }>> = {};
            resPhotoData?.forEach((photo: any) => {
              if (!photosByIssue[photo.issue_id]) {
                photosByIssue[photo.issue_id] = [];
              }
              photosByIssue[photo.issue_id].push({
                id: photo.id,
                photo_url: photo.photo_url,
              });
            });
            setResolutionPhotosByIssue(photosByIssue);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ticketId, navigate]);

  const handleOpenFeedbackPanel = (issueId: string) => {
    setFeedbackPanelIssueId(issueId);
    setRating(null);
    setFeedback("");
  };

  const handleConfirmResolved = async (issueId: string, withFeedback = true) => {
    try {
      setUpdatingIssueId(issueId);

      const updateData: any = {
        citizen_confirmed: true,
        citizen_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (withFeedback) {
        updateData.citizen_rating = rating;
        updateData.citizen_feedback = feedback.trim() || null;
      }

      const { error: updateError } = await supabase
        .from("issues")
        .update(updateData)
        .eq("id", issueId);

      if (updateError) throw updateError;

      const updatedAt = new Date().toISOString();
      setIssues(
        issues.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                citizen_confirmed: true,
                citizen_confirmed_at: updatedAt,
                citizen_rating: withFeedback ? rating : issue.citizen_rating,
                citizen_feedback: withFeedback ? (feedback.trim() || null) : issue.citizen_feedback,
              }
            : issue
        )
      );

      setFeedbackPanelIssueId(null);
      setRating(null);
      setFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setUpdatingIssueId(null);
    }
  };

  const handleReopen = async (issueId: string) => {
    try {
      setUpdatingIssueId(issueId);

      const { error: updateError } = await supabase
        .from("issues")
        .update({
          status: "in_progress",
          resolution_note: null,
          resolution_photo_url: null,
          citizen_confirmed: false,
          citizen_confirmed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", issueId);

      if (updateError) throw updateError;

      setIssues(
        issues.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                status: "in_progress",
                resolution_note: null,
                resolution_photo_url: null,
                citizen_confirmed: false,
                citizen_confirmed_at: null,
              }
            : issue
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setUpdatingIssueId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <main className="max-w-2xl mx-auto px-6 py-8">
          <LoadingState message="Loading ticket details..." />
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <main className="max-w-2xl mx-auto px-6 py-8">
          <Card>
            <p className="text-center text-slate-500">Ticket not found</p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <main className="max-w-2xl mx-auto px-6 py-8">
        <Link to="/citizen/tickets" className="text-blue-600 hover:underline font-medium text-sm mb-6 inline-block">
          ← Back to Complaints
        </Link>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {(sessionStorage.getItem(`duplicate_notice_${ticketId}`) || issues.some((i) => i.duplicate_group_id)) && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl mb-6 flex items-start gap-3 shadow-xs">
            <span className="text-xl">👥</span>
            <div>
              <p className="font-semibold text-sm">Similar Complaints Clustered in Your Area</p>
              <p className="text-xs text-amber-800 mt-0.5">
                {sessionStorage.getItem(`duplicate_notice_${ticketId}`) ||
                  "Multiple citizens in your immediate vicinity have reported this same civic infrastructure issue. Linked to cluster for prioritized response."}
              </p>
            </div>
          </div>
        )}

        <Card className="mb-8">
          <h1 className="text-xl font-semibold text-slate-800 mb-6">
            Complaint Details
          </h1>
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium text-slate-800">ID:</span>
              <code className="font-mono text-slate-500 ml-2 text-xs">{ticket.id}</code>
            </p>
            <p>
              <span className="font-medium text-slate-800">Filed:</span>
              <span className="ml-2 text-slate-500">
                {formatRelativeTime(ticket.created_at)} (
                {new Date(ticket.created_at).toLocaleDateString()})
              </span>
            </p>
            {ticket.location && (
              <p>
                <span className="font-medium text-slate-800">Location:</span>
                <span className="ml-2 text-slate-500">{ticket.location}</span>
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-slate-300">
              <p className="font-medium text-slate-800 mb-2">Your Complaint:</p>
              <p className="text-slate-500 whitespace-pre-wrap leading-relaxed">
                {ticket.raw_text}
              </p>
            </div>
            {ticketPhotos.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-300">
                <p className="font-medium text-slate-800 mb-3">Photos:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ticketPhotos.map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.photo_url}
                      alt="Complaint"
                      className="w-full aspect-square object-cover rounded-lg border border-slate-300"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <h2 className="text-2xl font-semibold text-slate-800 mb-6">
          Routed Issues ({issues.length})
        </h2>

        {issues.length === 0 ? (
          <Card>
            <p className="text-center text-slate-500">
              No issues routed from this complaint.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {issues.map((issue) => {
              const deptColor =
                DEPT_COLORS[issue.department as keyof typeof DEPT_COLORS] ||
                "#718096";
              return (
                <Card key={issue.id} accentColor={deptColor}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center flex-wrap">
                        <DepartmentBadge department={issue.department as any} />
                        <StatusBadge status={issue.status as any} />
                        {issue.priority && (
                          <Badge label={issue.priority} color={deptColor} />
                        )}
                      </div>
                      <p className="text-slate-800 font-medium">{issue.issue_text}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-6 pb-4 border-b border-slate-300">
                    <p>
                      <span className="font-medium text-slate-500">Deadline:</span>
                      <span className="ml-1 text-slate-800">
                        {issue.deadline
                          ? new Date(issue.deadline).toLocaleDateString()
                          : "Not specified"}
                      </span>
                    </p>
                  </div>

                  <StatusStepper issue={issue} departmentColor={deptColor} />

                  {issue.status === "resolved" && (
                    <div className="mt-4 pt-4 border-t border-slate-300 space-y-4">
                      {(issue.resolution_note || resolutionPhotosByIssue[issue.id]?.length > 0) && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                          <p className="font-medium text-slate-700">Officer's update:</p>
                          {issue.resolution_note && (
                            <p className="text-slate-700 text-sm whitespace-pre-wrap">
                              {issue.resolution_note}
                            </p>
                          )}
                          {resolutionPhotosByIssue[issue.id]?.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {resolutionPhotosByIssue[issue.id].map((photo) => (
                                <img
                                  key={photo.id}
                                  src={photo.photo_url}
                                  alt="Resolution"
                                  className="w-full aspect-square object-cover rounded-lg border border-slate-300"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {!issue.citizen_confirmed ? (
                        feedbackPanelIssueId === issue.id ? (
                          <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm font-medium text-slate-700">How satisfied are you with the resolution?</p>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => setRating(rating === star ? null : star)}
                                  className="text-2xl transition-colors"
                                >
                                  {rating && rating >= star ? "★" : "☆"}
                                </button>
                              ))}
                            </div>
                            <Textarea
                              id="feedback"
                              value={feedback}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFeedback(e.target.value)}
                              placeholder="Anything else you'd like to share? (optional)"
                              className="h-20 resize-none"
                            />
                            <div className="flex gap-2 items-center">
                              <Button
                                variant="primary"
                                onClick={() => handleConfirmResolved(issue.id, true)}
                                disabled={updatingIssueId === issue.id}
                                className="text-sm"
                              >
                                {updatingIssueId === issue.id ? "Submitting..." : "Submit"}
                              </Button>
                              <button
                                onClick={() => handleConfirmResolved(issue.id, false)}
                                disabled={updatingIssueId === issue.id}
                                className="text-sm text-blue-600 hover:underline disabled:text-slate-400"
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-slate-600">
                              Has this resolved your issue?
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                onClick={() => handleOpenFeedbackPanel(issue.id)}
                                disabled={updatingIssueId === issue.id}
                                className="text-sm"
                              >
                                {updatingIssueId === issue.id ? "Confirming..." : "Confirm resolved"}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => handleReopen(issue.id)}
                                disabled={updatingIssueId === issue.id}
                                className="text-sm"
                              >
                                {updatingIssueId === issue.id ? "Reopening..." : "Not resolved, reopen"}
                              </Button>
                            </div>
                          </div>
                        )
                      ) : (
                        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                          ✓ Confirmed on{" "}
                          {new Date(issue.citizen_confirmed_at!).toLocaleDateString()}
                          {issue.citizen_rating && ` — Rated ${issue.citizen_rating}★`}
                        </p>
                      )}
                    </div>
                  )}

                  {issue.status !== "resolved" && (
                    <div className="mt-4 pt-4 border-t border-slate-300">
                      <Button
                        variant="primary"
                        onClick={() => handleConfirmResolved(issue.id)}
                        disabled={updatingIssueId === issue.id}
                        className="text-sm"
                      >
                        {updatingIssueId === issue.id
                          ? "Updating..."
                          : "Confirm resolved"}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
