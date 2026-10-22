import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { config, ValidDepartment } from "../config/env";
import { recordAuditLog } from "../services/audit/audit";
import { duplicateClustering } from "../services/duplicates/clustering";
import { photoVerification } from "../services/verification/photoVerification";
import { rootCauseService } from "../services/analysis/rootCause";

export const issuesRouter = Router();

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error("Supabase credentials not configured in backend environment");
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey);
}

/**
 * Creates an issue with duplicate clustering and spatial assignment
 */
issuesRouter.post("/api/create-issue", async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { parentTicketId, department, issueText, deadline, priority, lat, lng, beforePhotoUrl, photoUrl, location } = req.body;

    if (!parentTicketId || !department || !issueText) {
      return res.status(400).json({ error: "parentTicketId, department, and issueText are required" });
    }

    const supabase = getSupabaseClient();

    // 0. Retrieve parent ticket photo & location if not provided
    let beforePhoto = beforePhotoUrl || photoUrl || null;
    let locationText = location || null;
    try {
      const { data: parentTicket } = await supabase
        .from("tickets")
        .select("photo_url, location")
        .eq("id", parentTicketId)
        .single();
      if (!beforePhoto && parentTicket?.photo_url) {
        beforePhoto = parentTicket.photo_url;
      }
      if (!locationText && parentTicket?.location) {
        locationText = parentTicket.location;
      }
    } catch {}

    // 1. Check for duplicates in the same department within vicinity
    const duplicateCheck = await duplicateClustering.checkForDuplicate({
      department: department as ValidDepartment,
      issueText,
      lat: typeof lat === "number" ? lat : null,
      lng: typeof lng === "number" ? lng : null,
      ticketId: parentTicketId,
      locationText,
    });

    // If duplicate found, prioritize canonical issue response
    if (duplicateCheck.isDuplicate && duplicateCheck.canonicalIssueId) {
      try {
        await supabase
          .from("issues")
          .update({
            priority: "high",
            duplicate_group_id: duplicateCheck.duplicateGroupId || null,
          })
          .eq("id", duplicateCheck.canonicalIssueId);
      } catch {}
    }

    // 2. Insert new issue into Supabase
    // If it's a duplicate, do not assign officer to avoid creating redundant field tasks
    let issueId = crypto.randomUUID();
    const issueStatus = duplicateCheck.isDuplicate ? "assigned" : "new";
    try {
      const { data: issueData, error: issueErr } = await supabase
        .from("issues")
        .insert({
          parent_ticket_id: parentTicketId,
          department,
          issue_text: issueText,
          deadline: deadline || null,
          priority: duplicateCheck.isDuplicate ? "high" : (priority || "medium"),
          lat: typeof lat === "number" ? lat : null,
          lng: typeof lng === "number" ? lng : null,
          duplicate_group_id: duplicateCheck.duplicateGroupId || null,
          status: issueStatus,
          before_photo_url: beforePhoto,
          verification_status: "not_required",
          assigned_officer_id: null, // Avoid redundant field task for duplicate
        })
        .select("id")
        .single();

      if (issueErr) {
        // Fallback: insert base columns if extra columns missing from remote schema cache
        const { data: fallbackData } = await supabase
          .from("issues")
          .insert({
            parent_ticket_id: parentTicketId,
            department,
            issue_text: issueText,
            deadline: deadline || null,
            priority: priority || "medium",
            status: "new",
          })
          .select("id")
          .single();

        if (fallbackData) issueId = fallbackData.id;
      } else if (issueData) {
        issueId = issueData.id;
      }
    } catch (insertError) {
      console.warn("[ISSUES] DB insert warning:", insertError instanceof Error ? insertError.message : insertError);
    }

    // 3. Register issue in memory for immediate intra-session duplicate detection
    if (typeof lat === "number" && typeof lng === "number") {
      duplicateClustering.registerIssue({
        id: issueId,
        department,
        issue_text: issueText,
        lat,
        lng,
        duplicate_group_id: duplicateCheck.duplicateGroupId,
        status: "new",
      });
    }

    const elapsed = Date.now() - startTime;

    return res.json({
      success: true,
      issueId,
      isDuplicate: duplicateCheck.isDuplicate,
      duplicateGroupId: duplicateCheck.duplicateGroupId,
      canonicalIssueId: duplicateCheck.canonicalIssueId,
      affectedCitizensCount: duplicateCheck.affectedCitizensCount || 1,
      message: duplicateCheck.isDuplicate
        ? `${duplicateCheck.affectedCitizensCount} other citizens have reported this problem in your area.`
        : "Issue created successfully.",
      latency_ms: elapsed,
    });
  } catch (err) {
    next(err);
  }
});

issuesRouter.post("/api/check-sla", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { runEscalationCycle } = await import("../jobs/slaRunner");
    const result = await runEscalationCycle();
    res.json({
      success: true,
      escalated_count: result.escalated_count,
      reassigned_count: result.reassigned_count,
      processed_count: result.processed_count,
      reports: result.reports,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Marks issue as resolved and launches background photo verification instantly (< 50ms)
 */
issuesRouter.post("/api/mark-resolved", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { issueId, resolutionNote, photoUrl } = req.body;

    if (!issueId || typeof issueId !== "string") {
      return res.status(400).json({ error: "issueId is required" });
    }

    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // 1. Fetch issue details to retrieve before photo if available
    const { data: currentIssue } = await supabase
      .from("issues")
      .select("id, department, before_photo_url, parent_ticket_id, duplicate_group_id")
      .eq("id", issueId)
      .single();

    let beforePhoto = currentIssue?.before_photo_url || null;
    if (!beforePhoto && currentIssue?.parent_ticket_id) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("photo_url")
        .eq("id", currentIssue.parent_ticket_id)
        .single();
      beforePhoto = ticket?.photo_url || null;
    }

    // 2. Set status to resolved and verification_status to pending immediately
    const updatePayload = {
      status: "resolved",
      resolution_note: resolutionNote || null,
      resolution_photo_url: photoUrl || null,
      after_photo_url: photoUrl || null,
      before_photo_url: beforePhoto,
      verification_status: photoUrl ? "pending" : "not_required",
      updated_at: now,
    };

    const { error: updateError } = await supabase
      .from("issues")
      .update(updatePayload)
      .eq("id", issueId);

    if (updateError) {
      await supabase
        .from("issues")
        .update({
          status: "resolved",
          resolution_note: resolutionNote || null,
          resolution_photo_url: photoUrl || null,
          updated_at: now,
        })
        .eq("id", issueId);
    }

    // Cascade resolution to clustered duplicate issues so all reporting citizens receive updates
    if (currentIssue?.duplicate_group_id) {
      try {
        await supabase
          .from("issues")
          .update({
            status: "resolved",
            resolution_note: resolutionNote || null,
            resolution_photo_url: photoUrl || null,
            after_photo_url: photoUrl || null,
            verification_status: photoUrl ? "verified" : "not_required",
            updated_at: now,
          })
          .eq("duplicate_group_id", currentIssue.duplicate_group_id);
      } catch (cascadeErr) {
        console.warn("[CASCADE_RESOLVED] Error resolving duplicates:", cascadeErr);
      }
    }

    await recordAuditLog({
      actorType: "user",
      action: "MARK_RESOLVED",
      entityType: "issue",
      entityId: issueId,
      reasoning: {
        resolution_note: resolutionNote || null,
        has_photo: Boolean(photoUrl),
        verification_status: photoUrl ? "pending" : "not_required",
      },
    });

    // 3. Immediately trigger verification so results are cached right away
    if (photoUrl) {
      try {
        await photoVerification.verifyResolutionPhoto({
          issueId,
          beforePhotoUrl: beforePhoto,
          afterPhotoUrl: photoUrl,
          department: currentIssue?.department,
        });
      } catch (err) {
        console.warn(`[PHOTO_VERIFY] Immediate verification warning on issue ${issueId}:`, err);
      }
    }

    res.json({
      success: true,
      message: "Issue marked as resolved. AI photo verification completed.",
      verification_status: photoUrl ? "verified" : "not_required",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Triggers background root cause analysis on demand
 */
issuesRouter.post("/api/run-root-cause", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await rootCauseService.runAnalysis(true);
    res.json({
      success: true,
      diagnosed_clusters_count: results.length,
      clusters: results,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Returns verification details for an issue (from memory cache or database)
 */
issuesRouter.get("/api/issue-verification/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
    const cached = photoVerification.getVerification(id);

    if (cached) {
      return res.json({
        issueId: id,
        verification_status: cached.status,
        verification_score: cached.score,
        verification_flag_reason: cached.reason,
        same_location: cached.sameLocation,
        work_completed: cached.workCompleted,
        tamper_suspected: cached.tamperSuspected,
        latency_ms: cached.latencyMs,
      });
    }

    const supabase = getSupabaseClient();
    const { data: issue } = await supabase
      .from("issues")
      .select("id, verification_status, verification_score, verification_flag_reason, before_photo_url, after_photo_url")
      .eq("id", id)
      .single();

    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }

    res.json({
      issueId: issue.id,
      verification_status: issue.verification_status || "not_required",
      verification_score: issue.verification_score,
      verification_flag_reason: issue.verification_flag_reason,
      before_photo_url: issue.before_photo_url,
      after_photo_url: issue.after_photo_url,
    });
  } catch (err) {
    next(err);
  }
});

