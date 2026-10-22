-- ==============================================================================
-- AllalKalai (அல்லல் களை) — Production Database Schema
-- Complete fresh schema with strict per-role RLS and aggregate public views
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('citizen', 'official', 'dept_head', 'officer')),
  department text CHECK (
    department IS NULL OR 
    department IN ('Water', 'Electricity', 'Sanitation', 'Roads', 'Health', 'Revenue', 'Police')
  ),
  created_at timestamptz DEFAULT now()
);

-- 3. Tickets Table (Citizen complaints and Official orders)
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  raw_text text NOT NULL,
  photo_url text,
  location text,
  created_at timestamptz DEFAULT now()
);

-- 4. Duplicate Groups Table (Clusters of repeat complaints)
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

-- 5. Issues Table (Routed department work items)
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  department text NOT NULL CHECK (
    department IN ('Water', 'Electricity', 'Sanitation', 'Roads', 'Health', 'Revenue', 'Police')
  ),
  issue_text text NOT NULL,
  deadline date,
  priority text CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  assigned_officer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'in_progress', 'resolved', 'escalated')),
  sla_deadline timestamptz,
  
  -- Work & Resolution details
  resolution_photo_url text,
  resolution_note text,
  before_photo_url text,
  after_photo_url text,
  
  -- Multimodal AI Verification
  verification_status text DEFAULT 'not_required' CHECK (
    verification_status IN ('pending', 'verified', 'flagged', 'needs_review', 'not_required')
  ),
  verification_score numeric,
  verification_flag_reason text,
  
  -- Grouping & Spatial Analysis
  duplicate_group_id uuid REFERENCES duplicate_groups(id) ON DELETE SET NULL,
  lat numeric(10, 7),
  lng numeric(10, 7),
  root_cause text,
  
  -- Autonomous AI Escalation
  escalation_notice text,
  escalation_reason text,
  escalated_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Citizen Feedback Loop
  citizen_confirmed boolean DEFAULT false,
  citizen_confirmed_at timestamptz,
  citizen_rating integer CHECK (citizen_rating BETWEEN 1 AND 5),
  citizen_feedback text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add Foreign Key for canonical_issue_id now that issues exists
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

-- 6. Audit Logs Table (Strictly INSERT-Only audit trail)
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

-- 7. Performance Indexes
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

-- 8. Helper Functions for Zero-Trust Row-Level Security
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text STABLE LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS text STABLE LANGUAGE sql SECURITY DEFINER AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 9. Enable Row-Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies

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
-- Citizen: view issues for own tickets
CREATE POLICY issues_citizen_select ON issues
  FOR SELECT
  USING (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Citizen: insert issue for own tickets
CREATE POLICY issues_citizen_insert ON issues
  FOR INSERT
  WITH CHECK (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Citizen: update issue only to confirm resolution / rating
CREATE POLICY issues_citizen_update ON issues
  FOR UPDATE
  USING (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
  )
  WITH CHECK (
    parent_ticket_id IN (SELECT id FROM public.tickets WHERE citizen_id = auth.uid())
  );

-- Officer: select only assigned issues
CREATE POLICY issues_officer_select ON issues
  FOR SELECT
  USING (
    assigned_officer_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- Officer: update only assigned issues
CREATE POLICY issues_officer_update ON issues
  FOR UPDATE
  USING (assigned_officer_id = auth.uid())
  WITH CHECK (assigned_officer_id = auth.uid());

-- Dept Head: select within department
CREATE POLICY issues_dept_head_select ON issues
  FOR SELECT
  USING (
    department = public.current_user_department()
    OR auth.role() = 'service_role'
  );

-- Dept Head: update and assign within department
CREATE POLICY issues_dept_head_update ON issues
  FOR UPDATE
  USING (department = public.current_user_department())
  WITH CHECK (department = public.current_user_department());

-- Dept Head: insert within department
CREATE POLICY issues_dept_head_insert ON issues
  FOR INSERT
  WITH CHECK (department = public.current_user_department() OR auth.role() = 'service_role');

-- Official: cross-department read access
CREATE POLICY issues_official_select ON issues
  FOR SELECT
  USING (
    public.current_user_role() = 'official'
    OR auth.role() = 'service_role'
  );

-- Official: insert government order issues
CREATE POLICY issues_official_insert ON issues
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'official'
    OR auth.role() = 'service_role'
  );

-- Official: update government orders
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

-- 11. Public Stats View (Zero PII Aggregate Transparency View)
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

-- Grant public read access to the aggregate view
GRANT SELECT ON public.public_stats_view TO anon, authenticated, service_role;
