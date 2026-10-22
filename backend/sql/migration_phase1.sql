-- ==============================================================================
-- AllalKalai (அல்லல் களை) — Phase 1 Migration
-- Idempotent database migration script preserving all existing data
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create Duplicate Groups Table if not exists
CREATE TABLE IF NOT EXISTS duplicate_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL CHECK (
    department IN ('Water', 'Electricity', 'Sanitation', 'Roads', 'Health', 'Revenue', 'Police')
  ),
  category text,
  lat numeric(10, 7),
  lng numeric(10, 7),
  affected_citizens_count integer DEFAULT 1,
  canonical_issue_id uuid,
  created_at timestamptz DEFAULT now()
);

-- 3. Safely add new columns to issues table
ALTER TABLE issues 
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'not_required' 
    CHECK (verification_status IN ('pending', 'verified', 'flagged', 'needs_review', 'not_required')),
  ADD COLUMN IF NOT EXISTS verification_score numeric,
  ADD COLUMN IF NOT EXISTS verification_flag_reason text,
  ADD COLUMN IF NOT EXISTS before_photo_url text,
  ADD COLUMN IF NOT EXISTS after_photo_url text,
  ADD COLUMN IF NOT EXISTS duplicate_group_id uuid REFERENCES duplicate_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_notice text,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS escalated_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lat numeric(10, 7),
  ADD COLUMN IF NOT EXISTS lng numeric(10, 7),
  ADD COLUMN IF NOT EXISTS sla_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS citizen_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS citizen_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS citizen_rating integer CHECK (citizen_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS citizen_feedback text;

-- Add Foreign Key for canonical_issue_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_duplicate_groups_canonical_issue'
  ) THEN
    ALTER TABLE duplicate_groups
      ADD CONSTRAINT fk_duplicate_groups_canonical_issue
      FOREIGN KEY (canonical_issue_id) REFERENCES issues(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create Audit Logs Table if not exists (INSERT-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'ai', 'system')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reasoning jsonb DEFAULT '{}'::jsonb,
  model_used text,
  created_at timestamptz DEFAULT now()
);

-- 5. Add Performance Indexes
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_department ON issues(department);
CREATE INDEX IF NOT EXISTS idx_issues_sla_deadline ON issues(sla_deadline);
CREATE INDEX IF NOT EXISTS idx_issues_duplicate_group_id ON issues(duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_issues_lat_lng ON issues(lat, lng);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_officer ON issues(assigned_officer_id);
CREATE INDEX IF NOT EXISTS idx_issues_parent_ticket ON issues(parent_ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_groups_dept ON duplicate_groups(department);

-- 6. Helper Functions for Role Enforcement
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text STABLE LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS text STABLE LANGUAGE sql SECURITY DEFINER AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 7. Ensure RLS is enabled on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 8. Clean up old permissive demo policies
DROP POLICY IF EXISTS profiles_all ON profiles;
DROP POLICY IF EXISTS tickets_all ON tickets;
DROP POLICY IF EXISTS issues_all ON issues;

-- Drop prior per-role policies if re-running migration
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_self_update ON profiles;
DROP POLICY IF EXISTS profiles_self_insert ON profiles;

DROP POLICY IF EXISTS tickets_citizen_insert ON tickets;
DROP POLICY IF EXISTS tickets_citizen_select ON tickets;

DROP POLICY IF EXISTS issues_citizen_select ON issues;
DROP POLICY IF EXISTS issues_citizen_insert ON issues;
DROP POLICY IF EXISTS issues_citizen_update ON issues;
DROP POLICY IF EXISTS issues_officer_select ON issues;
DROP POLICY IF EXISTS issues_officer_update ON issues;
DROP POLICY IF EXISTS issues_dept_head_select ON issues;
DROP POLICY IF EXISTS issues_dept_head_update ON issues;
DROP POLICY IF EXISTS issues_dept_head_insert ON issues;
DROP POLICY IF EXISTS issues_official_select ON issues;
DROP POLICY IF EXISTS issues_official_insert ON issues;
DROP POLICY IF EXISTS issues_official_update ON issues;
DROP POLICY IF EXISTS issues_service_delete ON issues;

DROP POLICY IF EXISTS audit_logs_service_insert ON audit_logs;
DROP POLICY IF EXISTS audit_logs_staff_select ON audit_logs;

DROP POLICY IF EXISTS duplicate_groups_select ON duplicate_groups;
DROP POLICY IF EXISTS duplicate_groups_manage ON duplicate_groups;

-- 9. Install Production Per-Role Policies

-- --- PROFILES ---
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_self_insert ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

-- --- TICKETS ---
CREATE POLICY tickets_citizen_insert ON tickets
  FOR INSERT
  WITH CHECK (auth.uid() = citizen_id OR public.current_user_role() = 'official' OR auth.role() = 'service_role');

CREATE POLICY tickets_citizen_select ON tickets
  FOR SELECT
  USING (
    citizen_id = auth.uid() 
    OR public.current_user_role() IN ('official', 'dept_head', 'officer')
    OR auth.role() = 'service_role'
  );

-- --- ISSUES ---
CREATE POLICY issues_citizen_select ON issues
  FOR SELECT
  USING (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
    OR auth.role() = 'service_role'
  );

CREATE POLICY issues_citizen_insert ON issues
  FOR INSERT
  WITH CHECK (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
    OR auth.role() = 'service_role'
  );

CREATE POLICY issues_citizen_update ON issues
  FOR UPDATE
  USING (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
  )
  WITH CHECK (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
  );

CREATE POLICY issues_officer_select ON issues
  FOR SELECT
  USING (
    assigned_officer_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY issues_officer_update ON issues
  FOR UPDATE
  USING (assigned_officer_id = auth.uid())
  WITH CHECK (assigned_officer_id = auth.uid());

CREATE POLICY issues_dept_head_select ON issues
  FOR SELECT
  USING (
    department = public.current_user_department()
    OR auth.role() = 'service_role'
  );

CREATE POLICY issues_dept_head_update ON issues
  FOR UPDATE
  USING (department = public.current_user_department())
  WITH CHECK (department = public.current_user_department());

CREATE POLICY issues_dept_head_insert ON issues
  FOR INSERT
  WITH CHECK (department = public.current_user_department() OR auth.role() = 'service_role');

CREATE POLICY issues_official_select ON issues
  FOR SELECT
  USING (
    public.current_user_role() = 'official'
    OR auth.role() = 'service_role'
  );

CREATE POLICY issues_official_insert ON issues
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'official'
    OR auth.role() = 'service_role'
  );

CREATE POLICY issues_official_update ON issues
  FOR UPDATE
  USING (public.current_user_role() = 'official')
  WITH CHECK (public.current_user_role() = 'official');

-- No user role has DELETE permission on issues (Destructive writes prevented)
CREATE POLICY issues_service_delete ON issues
  FOR DELETE
  USING (auth.role() = 'service_role');

-- --- AUDIT LOGS (INSERT-Only, No Update, No Delete) ---
CREATE POLICY audit_logs_service_insert ON audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY audit_logs_staff_select ON audit_logs
  FOR SELECT
  USING (
    public.current_user_role() IN ('dept_head', 'official')
    OR auth.role() = 'service_role'
  );

-- --- DUPLICATE GROUPS ---
CREATE POLICY duplicate_groups_select ON duplicate_groups
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY duplicate_groups_manage ON duplicate_groups
  FOR ALL
  USING (
    public.current_user_role() IN ('dept_head', 'official')
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    public.current_user_role() IN ('dept_head', 'official')
    OR auth.role() = 'service_role'
  );

-- 10. Create or Replace Public Aggregate View
CREATE OR REPLACE VIEW public.public_stats_view AS
SELECT
  d.department,
  COUNT(i.id)::int AS total_complaints,
  COUNT(CASE WHEN i.status = 'resolved' THEN 1 END)::int AS resolved_count,
  COUNT(CASE WHEN i.status = 'in_progress' THEN 1 END)::int AS in_progress_count,
  COUNT(CASE WHEN i.status = 'escalated' THEN 1 END)::int AS escalated_count,
  COUNT(CASE WHEN i.status = 'new' THEN 1 END)::int AS new_count,
  ROUND(
    COALESCE(
      AVG(
        CASE 
          WHEN i.status = 'resolved' AND i.updated_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) / 3600.0 
        END
      ),
      0
    )::numeric,
    1
  ) AS avg_resolution_hours,
  ROUND(
    (
      COUNT(
        CASE 
          WHEN i.status = 'resolved' AND (i.sla_deadline IS NULL OR i.updated_at <= i.sla_deadline) THEN 1 
          WHEN i.status != 'resolved' AND (i.sla_deadline IS NULL OR i.sla_deadline >= now()) THEN 1 
        END
      )::numeric / NULLIF(COUNT(i.id), 0) * 100.0
    ),
    1
  ) AS sla_compliance_rate,
  COUNT(
    CASE 
      WHEN i.status != 'resolved' AND i.sla_deadline IS NOT NULL AND i.sla_deadline < now() THEN 1 
    END
  )::int AS sla_breached_count
FROM (
  VALUES 
    ('Water'), 
    ('Electricity'), 
    ('Sanitation'), 
    ('Roads'), 
    ('Health'), 
    ('Revenue'), 
    ('Police')
) AS d(department)
LEFT JOIN public.issues i ON i.department = d.department
GROUP BY d.department;

GRANT SELECT ON public.public_stats_view TO anon, authenticated, service_role;
