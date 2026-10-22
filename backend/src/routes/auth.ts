import { Router, Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env";
import { recordAuditLog } from "../services/audit/audit";

export const authRouter = Router();

function getSupabaseAdmin() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * POST /api/auth/register
 * Admin-level account creation that auto-confirms email and completely bypasses Supabase SMTP email rate limits!
 */
authRouter.post("/api/auth/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, role, department } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (!name) {
      return res.status(400).json({ error: "Name is required." });
    }
    if (!role) {
      return res.status(400).json({ error: "Role is required." });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(500).json({ error: "Supabase service credentials not configured on backend." });
    }

    // 1. Create or update user via admin API with email_confirm: true (NEVER hits SMTP rate limit!)
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        role,
        department: role === "dept_head" || role === "officer" ? department : null,
      },
    });

    if (createError) {
      // If user already exists in auth, return helpful message
      if (createError.message?.toLowerCase().includes("already registered") || createError.message?.toLowerCase().includes("already exists")) {
        return res.status(400).json({ error: "An account with this email already exists. Please log in instead." });
      }
      return res.status(400).json({ error: createError.message });
    }

    const userId = userData.user.id;

    // 2. Insert/Upsert profile record
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        name,
        role,
        department: role === "dept_head" || role === "officer" ? department : null,
      });

    if (profileError) {
      console.warn("[AUTH] Profile upsert warning:", profileError);
    }

    await recordAuditLog({
      actorType: "user",
      actorId: userId,
      action: "USER_REGISTERED",
      entityType: "profile",
      entityId: userId,
      reasoning: { note: `New user ${email} registered with role ${role} via admin bypass pipeline.` },
    });

    return res.json({
      success: true,
      message: "Account created and verified successfully.",
      user: {
        id: userId,
        email,
        name,
        role,
        department,
      },
    });
  } catch (err) {
    next(err);
  }
});
