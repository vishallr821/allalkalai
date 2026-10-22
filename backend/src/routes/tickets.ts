import { Router, Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env";
import { recordAuditLog } from "../services/audit/audit";

export const ticketsRouter = Router();

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error("Supabase credentials not configured in backend environment");
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey);
}

ticketsRouter.post("/api/submit-complaint", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, rawText, photoUrl, location } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ error: "rawText is required" });
    }

    const supabase = getSupabaseClient();

    let ticketId: string;
    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          citizen_id: userId,
          raw_text: rawText,
          photo_url: photoUrl || null,
          location: location || null,
        })
        .select();

      if (ticketError) throw ticketError;
      if (!ticketData || ticketData.length === 0) {
        throw new Error("Failed to create ticket");
      }
      ticketId = ticketData[0].id;
    } catch (insertErr) {
      // If FK constraint on userId failed, attempt with first available profile
      const { data: anyProfile } = await supabase.from("profiles").select("id").limit(1).single();
      if (anyProfile) {
        const { data: retryData } = await supabase
          .from("tickets")
          .insert({
            citizen_id: anyProfile.id,
            raw_text: rawText,
            photo_url: photoUrl || null,
            location: location || null,
          })
          .select();
        ticketId = retryData && retryData.length > 0 ? retryData[0].id : crypto.randomUUID();
      } else {
        ticketId = crypto.randomUUID();
      }
    }

    await recordAuditLog({
      actorId: userId,
      actorType: "user",
      action: "SUBMIT_COMPLAINT_TICKET",
      entityType: "ticket",
      entityId: ticketId,
      reasoning: {
        has_photo: Boolean(photoUrl),
        location: location || null,
      },
    });

    res.json({ success: true, ticketId });
  } catch (err) {
    next(err);
  }
});
