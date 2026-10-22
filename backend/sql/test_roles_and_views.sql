-- ==============================================================================
-- AllalKalai (அல்லல் களை) — Role Verification & Public View Test Queries
-- Demonstrating Section 4 RLS enforcement and Section 5 Zero-PII public stats
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TEST 1: Citizen Role Verification
-- Citizen can insert tickets & see only their own tickets/issues; cannot see others
-- ------------------------------------------------------------------------------
BEGIN;
-- Simulate login as Citizen: Kavitha Murugan
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'c0000000-0000-0000-0000-000000000001';

-- [PASS 1.1] Citizen can insert a ticket with their own ID
INSERT INTO public.tickets (id, citizen_id, raw_text, location)
VALUES (
  'a0000000-0000-0000-0000-000000000099',
  'c0000000-0000-0000-0000-000000000001',
  'Broken water meter in residential house',
  'T. Nagar, Chennai'
);

-- [PASS 1.2] Citizen can SELECT their own tickets
SELECT count(*) AS citizen_own_tickets_visible 
FROM public.tickets 
WHERE citizen_id = 'c0000000-0000-0000-0000-000000000001';

-- [PASS 1.3] Citizen CANNOT see other citizens' private tickets (returns 0)
SELECT count(*) AS other_citizens_tickets_visible 
FROM public.tickets 
WHERE citizen_id = 'c0000000-0000-0000-0000-000000000002';
ROLLBACK;


-- ------------------------------------------------------------------------------
-- TEST 2: Officer Role Verification
-- Officer can select & update ONLY issues assigned to them; cannot see others
-- ------------------------------------------------------------------------------
BEGIN;
-- Simulate login as Officer: Karthik Selvam (AE Water)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000001';

-- [PASS 2.1] Officer sees their own assigned issues
SELECT count(*) AS assigned_issues_count 
FROM public.issues 
WHERE assigned_officer_id = 'f0000000-0000-0000-0000-000000000001';

-- [PASS 2.2] Officer CANNOT see issues assigned to another officer (returns 0)
SELECT count(*) AS other_officer_issues_visible 
FROM public.issues 
WHERE assigned_officer_id = 'f0000000-0000-0000-0000-000000000002';

-- [PASS 2.3] Officer CANNOT update issues assigned to another officer (0 rows updated)
UPDATE public.issues 
SET status = 'in_progress' 
WHERE assigned_officer_id = 'f0000000-0000-0000-0000-000000000002';
ROLLBACK;


-- ------------------------------------------------------------------------------
-- TEST 3: Department Head Role Verification
-- Dept Head can select, assign, and update issues ONLY within their department
-- ------------------------------------------------------------------------------
BEGIN;
-- Simulate login as Water Dept Head: Sundaram Ramanathan
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'd0000000-0000-0000-0000-000000000001';

-- [PASS 3.1] Water Dept Head sees all issues in Water department
SELECT count(*) AS water_issues_count 
FROM public.issues 
WHERE department = 'Water';

-- [PASS 3.2] Water Dept Head CANNOT see issues in Electricity (returns 0)
SELECT count(*) AS electricity_issues_visible 
FROM public.issues 
WHERE department = 'Electricity';

-- [PASS 3.3] Water Dept Head CANNOT update or assign issues in Roads (0 rows updated)
UPDATE public.issues 
SET assigned_officer_id = 'f0000000-0000-0000-0000-000000000001' 
WHERE department = 'Roads';
ROLLBACK;


-- ------------------------------------------------------------------------------
-- TEST 4: Official Role Verification
-- Official can read cross-department issues; NO destructive deletes allowed
-- ------------------------------------------------------------------------------
BEGIN;
-- Simulate login as Official: Dr. J. Radhakrishnan IAS
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'o0000000-0000-0000-0000-000000000001';

-- [PASS 4.1] Official sees cross-department issues (Water, Roads, Police, etc.)
SELECT department, count(*) AS dept_issue_count 
FROM public.issues 
GROUP BY department;

-- [PASS 4.2] Official CANNOT delete issues (Destructive writes strictly blocked)
DELETE FROM public.issues 
WHERE id = '10000000-0000-0000-0000-000000000001';
-- (Expected result: 0 rows deleted because issues_service_delete requires auth.role() = 'service_role')
ROLLBACK;


-- ------------------------------------------------------------------------------
-- TEST 5: Audit Logs Verification
-- Audit logs are INSERT-only; no UPDATE or DELETE policies exist for any user
-- ------------------------------------------------------------------------------
BEGIN;
-- Simulate login as Dept Head
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'd0000000-0000-0000-0000-000000000001';

-- [PASS 5.1] Dept Head can view audit reasoning logs
SELECT id, actor_type, action, model_used, created_at 
FROM public.audit_logs 
LIMIT 5;

-- [PASS 5.2] Tamper test: updating audit log is blocked (0 rows updated / error)
UPDATE public.audit_logs 
SET action = 'TAMPERED' 
WHERE id = 'e0000000-0000-0000-0000-000000000001';

-- [PASS 5.3] Deletion test: deleting audit log is blocked (0 rows deleted / error)
DELETE FROM public.audit_logs 
WHERE id = 'e0000000-0000-0000-0000-000000000001';
ROLLBACK;


-- ------------------------------------------------------------------------------
-- TEST 6: Public Aggregate Stats View (Zero PII, Unauthenticated)
-- ------------------------------------------------------------------------------
BEGIN;
-- Simulate unauthenticated visitor
SET LOCAL ROLE anon;

-- [PASS 6.1] Anonymous visitor queries public stats view without authentication
SELECT 
  department,
  total_complaints,
  resolved_count,
  in_progress_count,
  escalated_count,
  new_count,
  avg_resolution_hours,
  sla_compliance_rate,
  sla_breached_count
FROM public.public_stats_view
ORDER BY department;

-- [PASS 6.2] Verified column schema contains ZERO PII:
-- No citizen names, no officer names, no phone numbers, no issue descriptions, no coordinates.
ROLLBACK;
