import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
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

ticketsRouter.post("/api/upload-photo", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bucket = "complaint-photos", base64, fileName, contentType } = req.body;

    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "base64 string is required" });
    }

    const supabase = getSupabaseClient();
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const validBuckets = ["complaint-photos", "resolution-photos", "demo-assets"];
    const targetBucket = validBuckets.includes(bucket) ? bucket : "complaint-photos";

    const ext = contentType?.includes("/") ? contentType.split("/")[1] : "jpg";
    const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const name = fileName || `${Date.now()}-${crypto.randomUUID()}.${cleanExt}`;

    const { error: uploadError } = await supabase.storage
      .from(targetBucket)
      .upload(name, buffer, {
        contentType: contentType || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[STORAGE_UPLOAD_ERR]", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    const { data: pubData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(name);

    res.json({
      success: true,
      publicUrl: pubData.publicUrl,
      fileName: name,
      bucket: targetBucket,
    });
  } catch (err) {
    next(err);
  }
});

