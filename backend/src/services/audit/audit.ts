import { createClient } from "@supabase/supabase-js";
import { config } from "../../config/env";
import crypto from "crypto";

export interface AuditLogEntry {
  actorId?: string | null;
  actorType: "user" | "ai" | "system";
  action: string;
  entityType: string;
  entityId?: string | null;
  reasoning?: Record<string, unknown>;
  modelUsed?: string | null;
}

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdminClient && config.supabase.url && config.supabase.serviceRoleKey) {
    supabaseAdminClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
  }
  return supabaseAdminClient;
}

/**
 * Inserts an immutable audit log row into audit_logs.
 * Fail-safe: will log warning to console if DB write fails, never throwing to caller.
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.warn("[AUDIT] Supabase credentials not set; skipped writing audit_log to DB:", entry.action);
      return;
    }

    const entityId = entry.entityId || crypto.randomUUID();

    // Justified: Supabase JS client infers untyped table schema as never without pre-generated Database interface
    const { error } = await (supabase.from("audit_logs") as any).insert({
      actor_id: entry.actorId || null,
      actor_type: entry.actorType,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entityId,
      reasoning: entry.reasoning || {},
      model_used: entry.modelUsed || null,
    });

    if (error) {
      console.warn("[AUDIT] Failed to insert audit log:", error.message);
    } else {
      console.log(`[AUDIT] Logged: ${entry.action} | Actor: ${entry.actorType} | Model: ${entry.modelUsed || "n/a"}`);
    }
  } catch (err) {
    console.warn("[AUDIT] Error during audit logging:", err instanceof Error ? err.message : err);
  }
}
