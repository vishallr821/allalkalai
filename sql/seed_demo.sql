-- ==============================================================================
-- AllalKalai (அல்லல் களை) — Realistic Demo Seed Data
-- 7 Departments, 4 Roles, ~30 Issues, Duplicates, Multi-language (Tamil/English),
-- Chennai Coordinates, Multimodal Verification & Audit Trail
-- ==============================================================================

-- 1. Profiles (Demo Users across Roles)
INSERT INTO profiles (id, name, role, department, created_at)
VALUES
  -- Citizen
  ('c0000000-0000-0000-0000-000000000001', 'Kavitha Murugan (கவிதா)', 'citizen', NULL, now() - interval '14 days'),
  ('c0000000-0000-0000-0000-000000000002', 'Saravanan S. (சரவணன்)', 'citizen', NULL, now() - interval '10 days'),
  
  -- Department Heads
  ('d0000000-0000-0000-0000-000000000001', 'Sundaram Ramanathan', 'dept_head', 'Water', now() - interval '30 days'),
  ('d0000000-0000-0000-0000-000000000002', 'Meena Swaminathan', 'dept_head', 'Electricity', now() - interval '30 days'),
  ('d0000000-0000-0000-0000-000000000003', 'Anand Natarajan', 'dept_head', 'Sanitation', now() - interval '30 days'),
  ('d0000000-0000-0000-0000-000000000004', 'K. Vijayaraghavan', 'dept_head', 'Roads', now() - interval '30 days'),
  
  -- Field Officers
  ('f0000000-0000-0000-0000-000000000001', 'Karthik Selvam (AE Water)', 'officer', 'Water', now() - interval '30 days'),
  ('f0000000-0000-0000-0000-000000000002', 'Anitha Rajendran (AE TNEB)', 'officer', 'Electricity', now() - interval '30 days'),
  ('f0000000-0000-0000-0000-000000000003', 'Vignesh Kumar (Sanitary Inspector)', 'officer', 'Sanitation', now() - interval '30 days'),
  ('f0000000-0000-0000-0000-000000000004', 'Praveen Chandran (AE Highways)', 'officer', 'Roads', now() - interval '30 days'),
  
  -- Official / Administrator
  ('o0000000-0000-0000-0000-000000000001', 'Dr. J. Radhakrishnan IAS', 'official', NULL, now() - interval '45 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  department = EXCLUDED.department;

-- 2. Parent Tickets (Multilingual, Chennai Localities)
INSERT INTO tickets (id, citizen_id, raw_text, photo_url, location, created_at)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'உஸ்மான் சாலையில் குடிநீர் குழாய் உடைந்து தண்ணீர் ஆறாக ஓடுகிறது. மேலும் தெருவிளக்குகள் எரியாமல் இரவு முழுவதும் இருட்டாக உள்ளது. (Water pipe burst on Usman Road and streetlights not working).',
    'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
    'North Usman Road, T. Nagar, Chennai - 600017',
    now() - interval '7 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000001',
    'மயிலாப்பூர் குளம் அருகே கழிவுநீர் தேங்கி துர்நாற்றம் வீசுகிறது. குப்பைகள் அகற்றப்படவில்லை. சுகாதார சீர்கேடு ஏற்பட்டுள்ளது.',
    'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    'South Mada Street, Mylapore, Chennai - 600004',
    now() - interval '5 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000002',
    'Severe road crater and illegal night parking blocking ambulance path near Guindy railway station bus stop.',
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    'Station Road, Guindy, Chennai - 600032',
    now() - interval '4 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000002',
    'Transformer sparking near Shanthi Colony 4th Avenue. Low voltage and water supply motor burnt.',
    'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=800&q=80',
    '4th Avenue, Anna Nagar, Chennai - 600040',
    now() - interval '3 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000001',
    'Primary Health Centre premises waterlogged; medicine stock delayed for fever cases. கொசு மருந்து அடிக்க வேண்டும்.',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
    'L.B. Road, Adyar, Chennai - 600020',
    now() - interval '2 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000006',
    'o0000000-0000-0000-0000-000000000001',
    'GOVT ORDER #TN-REV-2026-89: Monsoon storm drain desilting, patta dispute resolution, and traffic diversions across Tambaram Sanatorium.',
    NULL,
    'GST Road, Tambaram Sanatorium, Chennai - 600047',
    now() - interval '1 day'
  )
ON CONFLICT (id) DO NOTHING;

-- 3. Duplicate Groups (Aggregating Repeat Grievances)
INSERT INTO duplicate_groups (id, department, category, lat, lng, affected_citizens_count, created_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Water', 'Pipeline Burst', 13.0418, 80.2341, 4, now() - interval '6 days'),
  ('b0000000-0000-0000-0000-000000000002', 'Electricity', 'Streetlight Outage', 13.0418, 80.2341, 3, now() - interval '5 days'),
  ('b0000000-0000-0000-0000-000000000003', 'Sanitation', 'Garbage Overflow', 13.0339, 80.2676, 5, now() - interval '4 days'),
  ('b0000000-0000-0000-0000-000000000004', 'Roads', 'Pothole Deep Crater', 13.0067, 80.2025, 6, now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

-- 4. 30 Realistic Issues Across all 7 Departments
INSERT INTO issues (
  id, parent_ticket_id, department, issue_text, deadline, priority, assigned_officer_id,
  status, sla_deadline, resolution_photo_url, resolution_note, before_photo_url, after_photo_url,
  verification_status, verification_score, verification_flag_reason, duplicate_group_id,
  lat, lng, root_cause, escalation_notice, escalation_reason, escalated_to,
  citizen_confirmed, citizen_confirmed_at, citizen_rating, citizen_feedback, created_at, updated_at
)
VALUES
  -- 1. WATER (Resolved & AI Verified)
  (
    '10000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Water',
    'Drinking water pipeline burst near Usman Road flyover pillar 14.',
    CURRENT_DATE - 3,
    'high',
    'f0000000-0000-0000-0000-000000000001',
    'resolved',
    now() - interval '5 days',
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    'Excavated damaged 150mm cast iron pipe, replaced section with high-grade ductile iron sleeve, welded and pressure tested.',
    'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    'verified',
    0.95,
    'Multimodal verification confirmed: replacement sleeve visible, dry road surface, matching surrounding pavement geometry.',
    'b0000000-0000-0000-0000-000000000001',
    13.0418, 80.2341,
    'Corrosion on aged 40-year underground cast iron distribution line exacerbated by heavy bus wheel loads.',
    NULL, NULL, NULL,
    true, now() - interval '4 days', 5, 'Quick response! Water supply restored within 24 hours.',
    now() - interval '7 days', now() - interval '5 days'
  ),

  -- 2. WATER (Escalated — Missed SLA)
  (
    '10000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000004',
    'Water',
    'Contaminated brackish water supply mixed with sewage line in residential taps.',
    CURRENT_DATE - 1,
    'high',
    'f0000000-0000-0000-0000-000000000001',
    'escalated',
    now() - interval '18 hours',
    NULL, NULL, NULL, NULL,
    'pending', NULL, NULL,
    'b0000000-0000-0000-0000-000000000001',
    13.0878, 80.2155,
    'Cross-connection between domestic supply header and defunct stormwater drain.',
    'ESCALATION NOTICE: High priority sewage ingress unresolved after 48h SLA expiry. Reassigned to Executive Engineer.',
    'SLA deadline elapsed with zero on-site notes recorded. Public health severity score 9.2.',
    'd0000000-0000-0000-0000-000000000001',
    false, NULL, NULL, NULL,
    now() - interval '3 days', now() - interval '2 hours'
  ),

  -- 3. WATER (In Progress)
  (
    '10000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000002',
    'Water',
    'Low water pressure across 12 residential buildings on Tank Street.',
    CURRENT_DATE + 2,
    'medium',
    'f0000000-0000-0000-0000-000000000001',
    'in_progress',
    now() + interval '36 hours',
    NULL, 'Booster pump valve calibration underway at pumping substation 3.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0339, 80.2676,
    'Clogged inlet strainer on feeder main.',
    NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '2 days', now() - interval '6 hours'
  ),

  -- 4. WATER (Assigned)
  (
    '10000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005',
    'Water',
    'Public drinking water booth tap vandalised and leaking clean potable water continuously.',
    CURRENT_DATE + 3,
    'low',
    'f0000000-0000-0000-0000-000000000001',
    'assigned',
    now() + interval '42 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0012, 80.2565,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '1 day'
  ),

  -- 5. WATER (New)
  (
    '10000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000006',
    'Water',
    'Desilt and inspect storm water culvert crossing near Sanatorium GST junction.',
    CURRENT_DATE + 5,
    'medium',
    NULL,
    'new',
    now() + interval '48 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '6 hours', now() - interval '6 hours'
  ),

  -- 6. ELECTRICITY (Resolved & AI Verified)
  (
    '20000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Electricity',
    'Non-functioning streetlights on North Usman Road causing nighttime safety hazards.',
    CURRENT_DATE - 2,
    'medium',
    'f0000000-0000-0000-0000-000000000002',
    'resolved',
    now() - interval '3 days',
    'https://images.unsplash.com/photo-1508873696983-2df570302b4a?auto=format&fit=crop&w=800&q=80',
    'Replaced 4 blown 120W LED fixtures and repaired severed phase neutral conductor inside junction box.',
    NULL,
    'https://images.unsplash.com/photo-1508873696983-2df570302b4a?auto=format&fit=crop&w=800&q=80',
    'verified',
    0.92,
    'Multimodal verification confirmed: illuminated LED luminaires on pole, night street visibility improved.',
    'b0000000-0000-0000-0000-000000000002',
    13.0418, 80.2341,
    'Short circuit caused by cable insulation gnawed by rodents inside utility trench.',
    NULL, NULL, NULL,
    true, now() - interval '2 days', 4, 'Lights are bright now, thank you.',
    now() - interval '5 days', now() - interval '3 days'
  ),

  -- 7. ELECTRICITY (SLA-Breached / Escalated)
  (
    '20000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000004',
    'Electricity',
    'Distribution transformer sparking heavily during peak hours with dangerous arcing.',
    CURRENT_DATE - 1,
    'high',
    'f0000000-0000-0000-0000-000000000002',
    'escalated',
    now() - interval '12 hours',
    NULL, 'Safety cordon placed. Need heavy crane crew for transformer core swap.',
    NULL, NULL,
    'pending', NULL, NULL,
    NULL,
    13.0878, 80.2155,
    'Transformer oil degradation and internal winding coil failure.',
    'URGENT ESCALATION: Hazardous 11kV sparking unresolved past SLA. Dispatched Emergency Breakdown Squad.',
    'Critical safety hazard adjacent to dense shopping street.',
    'd0000000-0000-0000-0000-000000000002',
    false, NULL, NULL, NULL,
    now() - interval '2 days', now() - interval '3 hours'
  ),

  -- 8. ELECTRICITY (In Progress)
  (
    '20000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'Electricity',
    'Low voltage fluctuating between 160V and 190V destroying home appliances.',
    CURRENT_DATE + 1,
    'medium',
    'f0000000-0000-0000-0000-000000000002',
    'in_progress',
    now() + interval '20 hours',
    NULL, 'Phase balancing work ongoing across consumer poles.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0878, 80.2155,
    'Unbalanced single phase loading on residential feeder circuit.',
    NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '4 hours'
  ),

  -- 9. ELECTRICITY (Assigned)
  (
    '20000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000003',
    'Electricity',
    'Hanging service wire dangling dangerously close to pedestrian foot overbridge.',
    CURRENT_DATE + 2,
    'high',
    'f0000000-0000-0000-0000-000000000002',
    'assigned',
    now() + interval '30 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0067, 80.2025,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '18 hours', now() - interval '18 hours'
  ),

  -- 10. ELECTRICITY (New)
  (
    '20000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000006',
    'Electricity',
    'Streetlight timer clock broken; lamps remain turned ON during bright daylight hours.',
    CURRENT_DATE + 4,
    'low',
    NULL,
    'new',
    now() + interval '48 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '8 hours', now() - interval '8 hours'
  ),

  -- 11. SANITATION (Resolved with Flagged Photo / Needs Review)
  (
    '30000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'Sanitation',
    'Overflowing garbage compactor bins left uncleared attracting stray cattle.',
    CURRENT_DATE - 1,
    'high',
    'f0000000-0000-0000-0000-000000000003',
    'resolved',
    now() - interval '1 day',
    'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80',
    'Sanitation team cleared waste and sprayed disinfectant powder.',
    'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80',
    'needs_review',
    0.48,
    'FLAGGED FOR HUMAN AUDIT: Resolution photo appears to show an indoor industrial dumpster instead of the outdoor temple street location.',
    'b0000000-0000-0000-0000-000000000003',
    13.0339, 80.2676,
    'Commercial vegetable sellers dumping unsold organic refuse outside designated bin hours.',
    NULL, NULL, NULL,
    false, NULL, NULL, 'Trash is still half full on the side!',
    now() - interval '4 days', now() - interval '1 day'
  ),

  -- 12. SANITATION (In Progress)
  (
    '30000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'Sanitation',
    'Blocked underground sewage manhole spilling raw wastewater onto public walkway.',
    CURRENT_DATE + 1,
    'high',
    'f0000000-0000-0000-0000-000000000003',
    'in_progress',
    now() + interval '16 hours',
    NULL, 'Super sucker suction tanker machine deployed at site.',
    NULL, NULL,
    'not_required', NULL, NULL,
    'b0000000-0000-0000-0000-000000000003',
    13.0339, 80.2676,
    'Solid silt accumulation and plastic entrapment inside manhole chamber.',
    NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '2 days', now() - interval '5 hours'
  ),

  -- 13. SANITATION (Assigned)
  (
    '30000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000005',
    'Sanitation',
    'Dead tree branches and fallen foliage dumped blocking hospital wheelchair ramp.',
    CURRENT_DATE + 2,
    'medium',
    'f0000000-0000-0000-0000-000000000003',
    'assigned',
    now() + interval '36 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0012, 80.2565,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '1 day'
  ),

  -- 14. SANITATION (New)
  (
    '30000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000006',
    'Sanitation',
    'Absence of door-to-door solid waste collection vehicle in West Tambaram sector 4.',
    CURRENT_DATE + 3,
    'medium',
    NULL,
    'new',
    now() + interval '48 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '4 hours', now() - interval '4 hours'
  ),

  -- 15. ROADS (Resolved & AI Verified)
  (
    '40000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003',
    'Roads',
    'Dangerous 2-foot pothole on Guindy station approach lane causing two-wheeler skids.',
    CURRENT_DATE - 2,
    'high',
    'f0000000-0000-0000-0000-000000000004',
    'resolved',
    now() - interval '2 days',
    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    'Filled sub-base with crushed aggregate and laid cold mix bituminous macadam. Steam rolled flat.',
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    'verified',
    0.96,
    'Multimodal verification confirmed: pothole filled flush with asphalt, smooth ride surface, railway barrier landmark visible.',
    'b0000000-0000-0000-0000-000000000004',
    13.0067, 80.2025,
    'Heavy bus braking deceleration compounded by water ponding during rains.',
    NULL, NULL, NULL,
    true, now() - interval '1 day', 5, 'Super fast road fix!',
    now() - interval '4 days', now() - interval '2 days'
  ),

  -- 16. ROADS (Escalated)
  (
    '40000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Roads',
    'Open trench excavated by utility contractor left without safety barricades or red warning flashers.',
    CURRENT_DATE - 1,
    'high',
    'f0000000-0000-0000-0000-000000000004',
    'escalated',
    now() - interval '14 hours',
    NULL, NULL, NULL, NULL,
    'pending', NULL, NULL,
    NULL,
    13.0418, 80.2341,
    'Private telecom vendor dig without corporation permit.',
    'SAFETY ESCALATION: Unbarricaded pit adjacent to bus stop. Fine notice drafted to contractor.',
    'Immediate pedestrian hazard, zero contractor response.',
    'd0000000-0000-0000-0000-000000000004',
    false, NULL, NULL, NULL,
    now() - interval '2 days', now() - interval '5 hours'
  ),

  -- 17. ROADS (In Progress)
  (
    '40000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    'Roads',
    'Broken pedestrian pavement slabs and exposed rebar on foot overbridge ramp.',
    CURRENT_DATE + 2,
    'medium',
    'f0000000-0000-0000-0000-000000000004',
    'in_progress',
    now() + interval '28 hours',
    NULL, 'Fresh concrete paver blocks being unloaded.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0067, 80.2025,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '3 hours'
  ),

  -- 18. ROADS (New)
  (
    '40000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000006',
    'Roads',
    'Speed breaker paint worn off near school zone on Sanatorium main road.',
    CURRENT_DATE + 4,
    'low',
    NULL,
    'new',
    now() + interval '48 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '10 hours', now() - interval '10 hours'
  ),

  -- 19. HEALTH (Resolved)
  (
    '50000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000005',
    'Health',
    'High dengue mosquito breeding in stagnant rainwater pools around Adyar PHC.',
    CURRENT_DATE - 1,
    'high',
    NULL,
    'resolved',
    now() - interval '1 day',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
    'Completed intensive thermal fogging and larvicide spraying. Stagnant puddles drained with motor.',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
    'verified',
    0.91,
    'Verified: fogging log documented, puddles cleared.',
    NULL,
    13.0012, 80.2565,
    'Clogged courtyard drain causing rainwater pooling.',
    NULL, NULL, NULL,
    true, now() - interval '12 hours', 4, 'Fogging was done properly.',
    now() - interval '2 days', now() - interval '1 day'
  ),

  -- 20. HEALTH (In Progress)
  (
    '50000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000005',
    'Health',
    'Shortage of essential paracetamol and ORS packets at urban welfare clinic.',
    CURRENT_DATE + 1,
    'high',
    NULL,
    'in_progress',
    now() + interval '22 hours',
    NULL, 'Emergency stock requisition sent to Central Medical Stores Depot.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0012, 80.2565,
    'Seasonal fever surge increased dispensary consumption by 300%.',
    NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '2 hours'
  ),

  -- 21. HEALTH (Assigned)
  (
    '50000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000002',
    'Health',
    'Food hygiene inspection needed at unhygienic roadside fried eatery dumping used oil.',
    CURRENT_DATE + 3,
    'medium',
    NULL,
    'assigned',
    now() + interval '38 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0339, 80.2676,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '18 hours', now() - interval '18 hours'
  ),

  -- 22. HEALTH (New)
  (
    '50000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000006',
    'Health',
    'Stray dog pack aggressiveness near government school campus in Tambaram.',
    CURRENT_DATE + 4,
    'medium',
    NULL,
    'new',
    now() + interval '48 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '5 hours', now() - interval '5 hours'
  ),

  -- 23. REVENUE (Escalated)
  (
    '60000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    'Revenue',
    'Online Patta name transfer mutation delayed past statutory deadline of 30 days without reason.',
    CURRENT_DATE - 4,
    'high',
    NULL,
    'escalated',
    now() - interval '2 days',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    'Sub-division field inspection pending due to surveyor vacancy.',
    'STATUTORY BREACH ESCALATION: Citizen Citizen Charter SLA violated by Taluk office.',
    'Delay exceeds 30-day Citizen Services guarantee.',
    'o0000000-0000-0000-0000-000000000001',
    false, NULL, NULL, NULL,
    now() - interval '10 days', now() - interval '2 days'
  ),

  -- 24. REVENUE (In Progress)
  (
    '60000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000006',
    'Revenue',
    'Encroachment verification on temple pond poramboke survey number 241/2.',
    CURRENT_DATE + 1,
    'high',
    NULL,
    'in_progress',
    now() + interval '24 hours',
    NULL, 'Revenue Inspector measuring boundary coordinates with DGPS.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '4 hours'
  ),

  -- 25. REVENUE (Assigned)
  (
    '60000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000002',
    'Revenue',
    'Old age pension scheme verification application pending doorstep biometric confirmation.',
    CURRENT_DATE + 3,
    'medium',
    NULL,
    'assigned',
    now() + interval '40 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0339, 80.2676,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '12 hours', now() - interval '12 hours'
  ),

  -- 26. REVENUE (Resolved)
  (
    '60000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'Revenue',
    'Issue of income certificate for student higher education scholarship assistance.',
    CURRENT_DATE - 3,
    'medium',
    NULL,
    'resolved',
    now() - interval '4 days',
    NULL, 'Certificate verified and digitally signed by Zonal Tahsildar.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0418, 80.2341,
    NULL, NULL, NULL, NULL,
    true, now() - interval '3 days', 5, 'Received digital certificate via SMS link.',
    now() - interval '6 days', now() - interval '4 days'
  ),

  -- 27. POLICE (Resolved)
  (
    '70000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003',
    'Police',
    'Illegal truck parking on narrow junction causing complete morning gridlock.',
    CURRENT_DATE - 1,
    'high',
    NULL,
    'resolved',
    now() - interval '1 day',
    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    'Traffic sub-inspector deployed towing cranes. 4 heavy vehicles impounded and junction cleared.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0067, 80.2025,
    'Lack of heavy vehicle no-entry signage during 7am-11am window.',
    NULL, NULL, NULL,
    true, now() - interval '18 hours', 5, 'Traffic moving smoothly today.',
    now() - interval '3 days', now() - interval '1 day'
  ),

  -- 28. POLICE (In Progress)
  (
    '70000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Police',
    'Nighttime chain snatching deterrent needed: request for police patrol booth near park.',
    CURRENT_DATE + 2,
    'medium',
    NULL,
    'in_progress',
    now() + interval '30 hours',
    NULL, 'Patrol motorcycle beats scheduled between 9:00 PM and 5:00 AM.',
    NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    13.0418, 80.2341,
    'Inadequate street illumination and low foot traffic after 9 PM.',
    NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '1 day', now() - interval '6 hours'
  ),

  -- 29. POLICE (Escalated)
  (
    '70000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    'Police',
    'Encroaching pavement tea shops placing burning gas stoves directly on footpath.',
    CURRENT_DATE - 1,
    'high',
    NULL,
    'escalated',
    now() - interval '10 hours',
    NULL, NULL, NULL, NULL,
    'pending', NULL, NULL,
    NULL,
    13.0067, 80.2025,
    NULL,
    'ESCALATION: Severe fire hazard on pedestrian path. Joint eviction ordered with Revenue & Corporation.',
    'Failure to clear commercial cylinders after repeated informal warnings.',
    'o0000000-0000-0000-0000-000000000001',
    false, NULL, NULL, NULL,
    now() - interval '2 days', now() - interval '3 hours'
  ),

  -- 30. POLICE (New)
  (
    '70000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000006',
    'Police',
    'Traffic light controller malfunction causing all 4 signals to flash amber simultaneously.',
    CURRENT_DATE + 4,
    'high',
    NULL,
    'new',
    now() + interval '48 hours',
    NULL, NULL, NULL, NULL,
    'not_required', NULL, NULL,
    NULL,
    12.9249, 80.1000,
    NULL, NULL, NULL, NULL,
    false, NULL, NULL, NULL,
    now() - interval '3 hours', now() - interval '3 hours'
  )
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  verification_status = EXCLUDED.verification_status,
  verification_score = EXCLUDED.verification_score,
  verification_flag_reason = EXCLUDED.verification_flag_reason,
  sla_deadline = EXCLUDED.sla_deadline,
  updated_at = EXCLUDED.updated_at;

-- Link canonical issues back to duplicate groups
UPDATE duplicate_groups SET canonical_issue_id = '10000000-0000-0000-0000-000000000001' WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE duplicate_groups SET canonical_issue_id = '20000000-0000-0000-0000-000000000001' WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE duplicate_groups SET canonical_issue_id = '30000000-0000-0000-0000-000000000001' WHERE id = 'b0000000-0000-0000-0000-000000000003';
UPDATE duplicate_groups SET canonical_issue_id = '40000000-0000-0000-0000-000000000001' WHERE id = 'b0000000-0000-0000-0000-000000000004';

-- 5. Audit Logs (AI Decisions, Escalation Reasoning, Multimodal Verification)
INSERT INTO audit_logs (id, actor_id, actor_type, action, entity_type, entity_id, reasoning, model_used, created_at)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    NULL,
    'ai',
    'COMPLAINT_ANALYSIS_AND_ROUTING',
    'ticket',
    'a0000000-0000-0000-0000-000000000001',
    '{
      "input_language": "ta",
      "detected_issues_count": 2,
      "routing_decision": [
        {"department": "Water", "priority": "high", "rationale": "Pipe burst wasting drinking water on high-traffic road"},
        {"department": "Electricity", "priority": "medium", "rationale": "Streetlight failure causing safety concern"}
      ]
    }'::jsonb,
    'nvidia/nemotron-nano-9b-instruct',
    now() - interval '7 days'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    NULL,
    'ai',
    'DUPLICATE_GROUPING',
    'issue',
    '10000000-0000-0000-0000-000000000001',
    '{
      "cluster_id": "b0000000-0000-0000-0000-000000000001",
      "spatial_distance_meters": 28.4,
      "semantic_similarity": 0.94,
      "action": "Grouped with existing pipeline leak ticket. Affected count incremented to 4."
    }'::jsonb,
    'nvidia/nemotron-nano-9b-instruct',
    now() - interval '6 days'
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'f0000000-0000-0000-0000-000000000001',
    'ai',
    'MULTIMODAL_PHOTO_VERIFICATION',
    'issue',
    '10000000-0000-0000-0000-000000000001',
    '{
      "confidence": 0.95,
      "verdict": "verified",
      "visual_evidence": "Ground excavated, cast iron pipe replaced with fresh ductile iron sleeve, welded clamp visible, water pool drained.",
      "reused_photo_detected": false
    }'::jsonb,
    'nvidia/nemotron-vision-preview',
    now() - interval '5 days'
  ),
  (
    'e0000000-0000-0000-0000-000000000004',
    'f0000000-0000-0000-0000-000000000003',
    'ai',
    'MULTIMODAL_PHOTO_VERIFICATION',
    'issue',
    '30000000-0000-0000-0000-000000000001',
    '{
      "confidence": 0.48,
      "verdict": "flagged",
      "visual_evidence": "Uploaded resolution photo depicts indoor industrial wheeled cart, which fails to match outdoor stone masonry and temple tree landmark in complaint photo.",
      "reused_photo_detected": true
    }'::jsonb,
    'nvidia/nemotron-vision-preview',
    now() - interval '1 day'
  ),
  (
    'e0000000-0000-0000-0000-000000000005',
    NULL,
    'ai',
    'AUTONOMOUS_SLA_ESCALATION',
    'issue',
    '10000000-0000-0000-0000-000000000002',
    '{
      "sla_deadline": "expired",
      "elapsed_hours_past_sla": 18,
      "officer_workload": "Karthik Selvam has 4 active high-priority issues",
      "escalation_path": "Department Head Sundaram Ramanathan notified",
      "generated_notice": "High priority sewage ingress unresolved after 48h SLA expiry. Reassigned to Executive Engineer."
    }'::jsonb,
    'nvidia/nemotron-ultra-70b-instruct',
    now() - interval '2 hours'
  )
ON CONFLICT (id) DO NOTHING;
