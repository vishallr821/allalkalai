// Shared Database & Domain Types for AllalKalai Backend

export type Department =
  | "Water"
  | "Electricity"
  | "Sanitation"
  | "Roads"
  | "Health"
  | "Revenue"
  | "Police";

export type Role = "citizen" | "official" | "dept_head" | "officer";

export type Priority = "low" | "medium" | "high";

export type IssueStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "escalated";

export type VerificationStatus =
  | "pending"
  | "verified"
  | "flagged"
  | "needs_review"
  | "not_required";

export interface Profile {
  id: string;
  name: string;
  role: Role;
  department: Department | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  citizen_id: string | null;
  raw_text: string;
  photo_url: string | null;
  location: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  parent_ticket_id: string;
  department: Department;
  issue_text: string;
  deadline: string | null;
  priority: Priority;
  assigned_officer_id: string | null;
  status: IssueStatus;
  sla_deadline: string | null;
  resolution_photo_url: string | null;
  resolution_note: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  verification_status?: VerificationStatus;
  verification_score?: number | null;
  verification_flag_reason?: string | null;
  duplicate_group_id?: string | null;
  escalation_notice?: string | null;
  escalation_reason?: string | null;
  escalated_to?: string | null;
  lat?: number | null;
  lng?: number | null;
  root_cause?: string | null;
  citizen_confirmed?: boolean;
  citizen_confirmed_at?: string | null;
  citizen_rating?: number | null;
  citizen_feedback?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateGroup {
  id: string;
  department: Department;
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
  department: Department;
  total_complaints: number;
  resolved_count: number;
  in_progress_count: number;
  escalated_count: number;
  new_count: number;
  avg_resolution_hours: number;
  sla_compliance_rate: number;
  sla_breached_count: number;
}
