# AllalKalai (அல்லல் களை) — 5-Minute Judge Demo Walkthrough

> **Tagline**: *"Weed out the suffering"* — Thirukkural 555  
> *"அல்லற்பட்டு ஆற்றாது அழுதகண் ணீரன்றே செல்வத்தைத் தேய்க்கும் படை"*  
> *"His people's tears of sorrow past endurance, are not they / Sharp instruments to wear the monarch's wealth away"*

---

## ⚡ Quick Pre-Flight Check (30 seconds before judges arrive)

Run the one-step idempotent reset:
```bash
npm run seed:demo --prefix backend
```
*Expected Output*: `✅ DEMO SEED COMPLETE IN < 6s`  
*Demo Accounts* (all passwords: `demo123456`):
- **Citizen**: `citizen@demo.com`
- **Field Officers**: `officer-roads@demo.com` (Roads), `officer-water@demo.com` (Water), `officer-electricity@demo.com` (Electricity)
- **Department Heads**: `depthead-roads@demo.com` (Roads), `depthead-water@demo.com` (Water)
- **Commissioner (Official)**: `official@demo.com`
- **Public Dashboard**: `http://localhost:5173/public` (no login needed)

---

## 🕒 5-Minute Live Walkthrough Script

### Step 1: Multilingual Intake & Autonomous Issue Splitting (0:00 - 1:00)
**Role**: Citizen (`citizen@demo.com`)  
**URL**: `http://localhost:5173/citizen/submit`

1. **Action**: Log in as `citizen@demo.com` / `demo123456`. Click **"Report Grievance"**.
2. **Input Complaint**: Paste the following vernacular Tamil complaint:
   ```text
   எங்கள் தெருவில் 5 நாட்களாக குடிநீர் விநியோகம் இல்லை, மேலும் பிரதான சாலையில் ஆபத்தான பெரிய பள்ளம் உள்ளது
   ```
   *(English meaning: "There is no drinking water supply in our street for 5 days, and there is a dangerous large pothole on the main road.")*
3. **Location**: Set to `12, Anna Nagar Main Road, Chennai` (or click "Use my current location").
4. **Submit**: Click **"Submit Complaint"**.
5. **Expected Outcome**:
   - The platform auto-detects **Tamil** and extracts two distinct civic issues:
     - **Water Department**: *"No drinking water supply in street for 5 days"* (Priority: High, SLA: 24h)
     - **Roads Department**: *"Dangerous large pothole on main road"* (Priority: High, SLA: 24h)
   - Live AI provider badge is displayed honestly (`Live AI: Nebius/Groq` or `Demo AI: Deterministic Engine`).
   - Citizen sees a status stepper for both issues.
6. **Fallback Plan**: If internet drops or AI provider is rate-limited, the system automatically uses the zero-latency deterministic classifier (`classifyWithRules`), returning the exact same split in < 5ms with `Demo AI` badge.

---

### Step 2: Spatial Duplicate Clustering & Crowd Consolidation (1:00 - 1:45)
**Role**: Citizen B (or open an incognito window)  
**URL**: `http://localhost:5173/citizen/submit`

1. **Action**: File a second complaint within 35 meters on Anna Nagar Main Road:
   ```text
   பிரதான சாலையில் மிக ஆழமான பள்ளம் உள்ளது, வாகனங்கள் விபத்துக்குள்ளாகின்றன
   ```
   Location: `14, Anna Nagar Main Road, Chennai`
2. **Submit**: Click **"Submit Complaint"**.
3. **Expected Outcome**:
   - The spatial clustering engine evaluates Haversine distance ($\le 35\text{ m}$) and token trigram similarity ($\ge 75\%$).
   - Groups it into the existing `duplicate_groups` cluster.
   - Citizen receives an instant crowd-consolidation notification banner:
     > *"1 other citizen has also reported this problem in your immediate vicinity. Consolidated for priority response."*
   - Avoids creating redundant field tasks for the Roads officer.
4. **Fallback Plan**: If geolocation is disabled on browser, the bounding-box address match (`Anna Nagar Main Road`) clusters the reports.

---

### Step 3: Officer Resolution with Live AI Vision Verification (1:45 - 2:45)
**Role**: Roads Officer (`officer-roads@demo.com`)  
**URL**: `http://localhost:5173/officer/dashboard`

1. **Action**: Log in as `officer-roads@demo.com` / `demo123456`.
2. Open the assigned pothole ticket.
3. Click **"Upload Resolution Evidence"**:
   - Attach sample genuine repair photo from `demo-assets/pothole-after-genuine.jpg`.
   - Resolution Notes: `"Fresh bitumen asphalt laid, rolled and compacted. Traffic restored safely."`
4. Click **"Submit Resolution"**.
5. **Expected Outcome**:
   - Response returns immediately (< 50ms) with `AI pending` status.
   - Background vision inspection evaluates before/after proof:
     - SHA-256 hash ensures photo is not identical to the complaint or reused.
     - Multimodal analysis scores match: **Score: 94% (Verified)**.
   - Status chip live-polls and updates to **`AI Verified`** (emerald chip).
6. **Fallback Plan**: If vision model is toggled off (`DISABLE_VISION_MODEL=true`), status degrades to `AI Needs Review` with note *"automated check unavailable — flagged for supervisor review"*, never crashing.

---

### Step 4: Tamper & Unrelated Photo Detection (2:45 - 3:30)
**Role**: Roads Officer (`officer-roads@demo.com`)  
**URL**: `http://localhost:5173/officer/dashboard`

1. **Action**: Open another assigned issue.
2. Attempt to resolve by uploading an unrelated indoor photo:
   - Select `demo-assets/pothole-after-unrelated.jpg` (or any photo of a desk/office).
   - Resolution Notes: `"Fixed."`
3. Click **"Submit Resolution"**.
4. **Expected Outcome**:
   - Vision engine inspects the image and detects scene mismatch.
   - Status chip updates to **`AI Flagged`** (red chip).
   - Reason displayed: *"Visual verification mismatch: The uploaded image depicts an unrelated indoor scene. No evidence of physical asphalt restoration."*
   - Issue is flagged for investigation and forwarded to the Department Head review queue.
5. **Fallback Plan**: If identical image is uploaded, SHA-256 instant tamper detection triggers in 0ms with reason *"Tamper detected: resolution photo is identical to complaint photo"*.

---

### Step 5: Autonomous SLA Escalation Agent & Dept Head Audit (3:30 - 4:15)
**Role**: Water Dept Head (`depthead-water@demo.com`)  
**URL**: `http://localhost:5173/depthead/dashboard`

1. **Action**: Log in as `depthead-water@demo.com` / `demo123456`.
2. Switch to the **"Escalation Audit"** tab.
3. Observe the pre-seeded overdue Water issue (SLA deadline exceeded).
4. Click the demo button: **"⚡ Fast-Forward Demo (Shift SLA -3h)"**.
5. **Expected Outcome**:
   - Autonomous Escalation Agent executes live across 6 pure typed tools:
     1. `get_overdue_issues()`
     2. `check_officer_workloads("Water")`
     3. `find_escalation_supervisor(issue)`
     4. `reassign_issue()` (checks caseload balance)
     5. `draft_escalation_notice(issue, context)`
     6. `escalate_issue()`
   - Emits visual step-by-step reasoning trace with inputs, outputs, and latencies.
   - Generates bilingual formal notice in English and Tamil:
     > **அவசரக் குறிப்பு / OFFICIAL NOTICE OF SLA BREACH**  
     > *To: Dr. Ramanathan (Water Dept Head)*  
     > *Issue ID: [...] | Priority: HIGH | Breach Duration: 3 hours overdue*
   - Audit trail recorded in `audit_logs`.
6. **Fallback Plan**: If Tier 2 reasoning model is unavailable, deterministic rule-based tool execution generates the bilingual notice in < 100ms.

---

### Step 6: Public Transparency Portal (4:15 - 5:00)
**Role**: Any citizen / Public Judge (No Login Required)  
**URL**: `http://localhost:5173/public`

1. **Action**: Open `http://localhost:5173/public` in a fresh or incognito window.
2. **Observe**:
   - **Hero Banner**: Thirukkural 555 in Tamil with English meaning:
     > *"அல்லற்பட்டு ஆற்றாது அழுதகண் ணீரன்றே செல்வத்தைத் தேய்க்கும் படை"*  
     > *"His people's tears of sorrow past endurance, are not they / Sharp instruments to wear the monarch's wealth away"*
   - **KPI Cards**: Live aggregate count of Total Filed, In Progress, Resolved, and SLA Adherence (92%).
   - **Department Benchmarks**: Bar charts showing SLA adherence % and average resolution hours across all 7 departments.
   - **Verified Resolutions Showcase**: Before/after comparison cards with AI verification badges and match scores ($\ge 85\%$).
   - **Zero Citizen PII**: No citizen names, phone numbers, or exact addresses exposed; coordinates rounded to 2 decimal places ($\approx 1.1\text{ km}$ locality grid).
   - **Speed**: Page loads in $< 1.2\text{ s}$ cold, and under $5\text{ ms}$ on warm cached hits (`X-Cache: HIT`).
   - **Bilingual Switch**: Click **"தமிழ்"** toggle in the top bar to instantly switch all headers, metrics, and cards into Tamil.

---

## 🛡️ Failure Drills & Judge Questions Cheatsheet

| Scenario | System Reaction | How to Demonstrate |
|---|---|---|
| **No Internet / APIs Down** | Deterministic rule-based engine handles intake, clustering, and escalation with zero crashes. | Run `npm run test:drills` |
| **API Rate Limits (429)** | In-memory Circuit Breaker skips failed provider for 60s and auto-fails over to fallback. | Shown in `task-1517` logs |
| **Tampered / Reused Proof Photos** | SHA-256 hash collision checks detect reused or identical images in 0ms. | Step 4 above |
| **Privacy / Citizen Safety** | Public endpoints query strictly sanitized views with geocoordinate rounding. | Step 6 above |
