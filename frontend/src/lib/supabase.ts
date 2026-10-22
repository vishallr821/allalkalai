import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Profile {
  id: string;
  name: string;
  role: "citizen" | "official" | "dept_head" | "officer";
  department: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  citizen_id: string;
  raw_text: string;
  photo_url: string | null;
  location: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  parent_ticket_id: string;
  department: string;
  issue_text: string;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  assigned_officer_id: string | null;
  status: "new" | "assigned" | "in_progress" | "resolved" | "escalated";
  sla_deadline: string | null;
  resolution_photo_url: string | null;
  resolution_note: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  verification_status?: "pending" | "verified" | "flagged" | "needs_review" | "not_required";
  verification_score?: number | null;
  verification_flag_reason?: string | null;
  duplicate_group_id?: string | null;
  escalation_notice?: string | null;
  escalation_reason?: string | null;
  escalated_to?: string | null;
  lat?: number | null;
  lng?: number | null;
  root_cause?: string | null;
  citizen_confirmed: boolean;
  citizen_confirmed_at: string | null;
  citizen_rating: number | null;
  citizen_feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateGroup {
  id: string;
  department: string;
  category: string | null;
  lat: number | null;
  lng: number | null;
  affected_citizens_count: number;
  canonical_issue_id: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_type: "user" | "ai" | "system";
  action: string;
  entity_type: string;
  entity_id: string;
  reasoning: Record<string, unknown>;
  model_used: string | null;
  created_at: string;
}

export interface PublicStats {
  department: string;
  total_complaints: number;
  resolved_count: number;
  in_progress_count: number;
  escalated_count: number;
  new_count: number;
  avg_resolution_hours: number;
  sla_compliance_rate: number;
  sla_breached_count: number;
}
