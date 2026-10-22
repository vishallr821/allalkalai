# AllalKalai (அல்லல் களை) — Autonomous Civic Grievance & Accountability Platform

> *"அல்லற்பட்டு ஆற்றாது அழுதகண் ணீரன்றே செல்வத்தைத் தேய்க்கும் படை"* — **திருக்குறள் 555**  
> *"His people's tears of sorrow past endurance, are not they / Sharp instruments to wear the monarch's wealth away"*  
> **Core Tagline**: *"Weed out the suffering"*

AllalKalai is a production-grade, closed-loop civic intelligence platform transforming public grievance redressal into an autonomous, transparent, and accountable pipeline: **Multilingual Intake → AI Triage & Extraction → Spatial Duplicate Clustering → Autonomous Escalation → Multimodal Vision Verification → Open Public Accountability**.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph INTAKE["1. Multilingual Intake (Tamil / Hindi / English)"]
        Citizen["👤 Citizen Voice/Text Input"] --> SpeechAPI["Web Speech API"]
        Citizen --> Compress["Client-Side Canvas Compression (<1280px)"]
        Compress --> TriageReq["POST /api/analyze"]
    end

    subgraph ENGINE["2. Tiered AI Engine & Circuit Breaker"]
        TriageReq --> Router{"AI Router"}
        Router -->|Primary| Nebius["Nebius / NVIDIA Token Factory\n(Nemotron Nano/Super)"]
        Router -->|Fallback 1| Groq["Groq Cloud\n(Llama / GPT-OSS)"]
        Router -->|Fallback 2 / DEMO_MODE| RuleEngine["Deterministic Multilingual Classifier\n(Tamil/Hindi Regex & Keywords)"]
        Nebius -.->|Failure / 429| CB["Circuit Breaker (60s Trip)"]
        CB -.-> Groq
    end

    subgraph CLUSTERING["3. Spatial Duplicate Clustering"]
        Router --> ClusterCheck["POST /api/create-issue"]
        ClusterCheck --> BBox["Bounding Box Pre-Filter (~120m)"]
        BBox --> Haversine["Exact Haversine Distance (<= 100m)"]
        Haversine --> Semantic["Token Jaccard & Trigram Overlap"]
        Semantic -->|Match >= 0.70| Clustered["duplicate_groups (+1 citizen count)\nBypass duplicate officer task"]
        Semantic -->|Ambiguous 0.4-0.7| Disambiguate["AI Disambiguation"]
        Semantic -->|Distinct| SingleIssue["Create Individual Task"]
    end

    subgraph EXECUTION["4. Field Execution & Verification"]
        SingleIssue --> OfficerTask["👷 Field Officer Assigned"]
        OfficerTask --> ProofUpload["POST /api/mark-resolved\n(Before & After Photo Proof)"]
        ProofUpload --> VisionCheck["Vision Inspection Engine"]
        VisionCheck --> SHA256["SHA-256 Tamper & Reuse Check"]
        VisionCheck --> Multimodal["Vision Model / Demo Verifier"]
        Multimodal -->|Match >= 75%| Verified["AI Verified Badge (score >= 0.75)"]
        Multimodal -->|Tamper / Mismatch| Flagged["AI Flagged (Dept Head Review Queue)"]
    end

    subgraph AGENT["5. Autonomous SLA Escalation Agent"]
        SLARunner["⏱️ SLA Runner (Periodic / Fast-Forward)"] --> AgentLoop["Tier 2 Escalation Agent"]
        AgentLoop --> Tool1["get_overdue_issues()"]
        AgentLoop --> Tool2["check_officer_workloads()"]
        AgentLoop --> Tool3["find_escalation_supervisor()"]
        AgentLoop --> Tool4["reassign_issue()"]
        AgentLoop --> Tool5["draft_escalation_notice()"]
        AgentLoop --> Tool6["escalate_issue()"]
        AgentLoop --> AuditTrail["audit_logs (INSERT-Only Immutable Trail)"]
    end

    subgraph PUBLIC["6. Public Transparency Dashboard (/public)"]
        AuditTrail --> AggView["public_stats_view & Aggregate Views"]
        Verified --> Showcase["Verified Resolutions Showcase (Before/After)"]
        AggView --> MemoryCache["Server-Side TTL Cache (45-60s)"]
        Showcase --> Anonymize["Coordinate Rounding (2 decimals ~1.1km)\nZero Citizen PII Exposed"]
        Anonymize --> PublicPortal["🌐 Public Open Portal\n(Sub-2s Cold Load / 3ms Warm Hit)"]
    end
```

---

## ⚡ Quick Setup in 6 Steps

Follow these 6 steps to start the entire stack locally:

### Step 1: Clone and Enter Repository
```bash
git clone https://github.com/visha-21/AllalKalai.git
cd AllalKalai/Query-manager
```

### Step 2: Install Backend & Frontend Dependencies
```bash
npm install --prefix backend
npm install --prefix frontend
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `backend/.env`:
```bash
cp .env.example backend/.env
```
*(Supabase URL, Anon Key, Service Role Key, and optional AI Keys are configured here. `DEMO_MODE=true` can be enabled for offline judge presentations).*

### Step 4: Seed Demo Data in 6 Seconds
```bash
npm run seed:demo --prefix backend
```
*Creates 10 demo profiles, baseline duplicate groups, overdue escalation issues, and verified showcases.*

### Step 5: Start the Development Servers
In two separate terminals:
```bash
# Terminal 1: Backend API (port 4000)
npm run dev --prefix backend

# Terminal 2: Frontend Web App (port 5173)
npm run dev --prefix frontend
```

### Step 6: Open the Application
- **Public Transparency Dashboard**: [http://localhost:5173/public](http://localhost:5173/public) (no login required)
- **Role Portal Sign In**: [http://localhost:5173/login](http://localhost:5173/login)

---

## 🔑 Pre-Configured Demo Accounts

All demo accounts share the password: `demo123456`

| Role | Email | Purpose |
|---|---|---|
| **Citizen** | `citizen@demo.com` | Multilingual text/speech intake & cluster tracking |
| **Water Officer** | `officer-water@demo.com` | Assigned tasks & genuine resolution photo upload |
| **Roads Officer** | `officer-roads@demo.com` | Field work & tamper/mismatch photo testing |
| **Water Dept Head** | `depthead-water@demo.com` | Escalation audit panel & fast-forward demo trigger |
| **Roads Dept Head** | `depthead-roads@demo.com` | Review & approval queue for flagged photo evidence |
| **Commissioner** | `official@demo.com` | Cross-department performance benchmarks & orders |

---

## 🧪 Automated Test & Verification Suites

```bash
# 1. End-to-End Smoke Test (exercises steps a-f via API)
npm run smoke --prefix backend

# 2. Concurrency & Latency Benchmark (20 concurrent users: p95 < 1.5s)
npm run test:load --prefix backend

# 3. Resilience & Failure Drills (Zero-keys, invalid keys, disabled vision, offline network)
npm run test:drills --prefix backend

# 4. Phase-Specific Verification Suites
npm run test:ai --prefix backend     # Phase 2 AI Triage & Fallback
npm run test:p3 --prefix backend     # Phase 3 Duplicates & Vision
npm run test:p4 --prefix backend     # Phase 4 Escalation Agent
npm run test:p5 --prefix backend     # Phase 5 Public UI & Zero-PII
```

---

## 📋 Technology Stack Summary

- **Frontend**: React 19, Vite 8, TypeScript, Tailwind CSS v4, Lucide Icons, Vite PWA
- **Backend**: Node.js, Express, TypeScript, Zod Schema Validation
- **Database & Storage**: Supabase (PostgreSQL with RLS policies, Storage buckets)
- **AI Models & Inference**:
  - **Tier 1 (Triage & Language)**: NVIDIA Nemotron-3 Nano / Groq Cloud
  - **Tier 2 (Escalation Reasoning)**: NVIDIA Nemotron-3 Super / Ultra
  - **Vision (Photo Verification)**: NVIDIA Nemotron-3.5 Super-VL
  - **Zero-AI Fallback**: Deterministic regex & keyword classifier (`classifyWithRules`)
