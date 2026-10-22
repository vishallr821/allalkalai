# AGENT.md — AllalKalai (அல்லல் களை)

> Single source of truth for any AI coding agent working on this repo.
> READ THIS FIRST at the start of every session. UPDATE the "Progress Log" and "Decisions" sections at the end of every phase/session.

## 1. Project Summary
AllalKalai is an AI-powered, multi-agent grievance management and civic accountability platform, evolved from the prototype `Query-manager`.
Core promise: a closed-loop lifecycle — intake → triage → assignment → resolution → AI verification → public accountability.

Tagline: "Weed out the suffering" — Thirukkural 555.

## 2. Tech Stack
- Frontend: React 19 + Vite + TypeScript + Tailwind v4 + Lucide + PWA
- Backend: Node.js + Express + TypeScript (being refactored from monolithic `server.ts` into modules)
- DB/Auth/Storage: Supabase (Postgres + RLS)
- AI: Nebius Token Factory (OpenAI-compatible, base URL `https://api.tokenfactory.nebius.ai/v1`) serving NVIDIA Nemotron; Groq as fallback; rule-based parser as last resort
- Languages supported at intake: Tamil, Hindi, English (normalize to English internally)

## 3. Departments (fixed enum)
Water, Electricity, Sanitation, Roads, Health, Revenue, Police

## 4. Roles
`citizen`, `officer`, `dept_head`, `official` (+ unauthenticated public dashboard)

## 5. Architecture Targets
```
backend/src/
  server.ts              # bootstrap only
  config/env.ts          # validated env, feature flags
  routes/                # thin route handlers
  services/
    ai/                  # client, router (tiers), prompts, fallback
    duplicates/          # geo + semantic clustering
    verification/        # before/after photo verification
    escalation/          # agent + tools
    audit/               # audit log writer
  middleware/            # auth, rate-limit, error handler, request-id
  jobs/                  # SLA runner
```

## 6. AI Tiering
| Tier | Model (configurable via env) | Use |
|---|---|---|
| 1 | Nemotron Nano / Super | translation, triage, issue extraction |
| 2 | Nemotron Ultra | root cause, agentic escalation reasoning |
| Vision | A vision-capable model (env: `VISION_MODEL`) | before/after verification |
| Fallback | Groq -> rule-based | when Nebius key missing, rate-limited, or timed out |

RULE: Never hardcode model IDs. Read from env. Verify current model IDs against Nebius docs before wiring.

## 7. Non-Negotiable Engineering Rules
1. **Never break the running demo.** Work in small, verifiable steps. Run build + typecheck after every meaningful change.
2. **Every AI call has**: timeout (<= 8s for Tier 1, <= 20s for Tier 2/vision), retry (max 1), and a fallback path. No AI failure may surface as a user-facing crash.
3. **Slow work is async.** Photo verification, root-cause analysis, and escalation run in the background; the UI shows a status ("Verifying…") and never blocks on them.
4. **Secrets** live only in `.env` (never committed). Keep `.env.example` updated with every new variable.
5. **Every AI decision and state transition** writes a row to `audit_logs` (insert-only).
6. **Strict TypeScript.** No `any` unless justified with a comment.
7. **No new dependency** without a one-line justification in the Decisions log.
8. **Small diffs.** Don't rewrite files that don't need changing. Preserve existing working endpoints until replaced and verified.
9. **Demo Mode** (`DEMO_MODE=true`) must always work with zero external API keys using deterministic fallbacks and seeded data.
10. After finishing a phase: run the acceptance checklist, update this file, then STOP and report. Do not start the next phase unprompted.

## 8. Standard Commands
- Install: `npm install` (in `backend/` and `frontend/`)
- Backend build: `npm run build --prefix backend`
- Frontend build: `npm run build --prefix frontend`
- Backend typecheck: `npm --prefix backend exec tsc -- --noEmit -p backend/tsconfig.json` (or `npx tsc --noEmit` in `backend/`)
- Frontend typecheck: `npm --prefix frontend exec tsc -b` (or `npx tsc -b` in `frontend/`)
- Backend dev: `npm run dev --prefix backend` (starts Express server on `http://localhost:4000`)
- Frontend dev: `npm run dev --prefix frontend` (starts Vite dev server on `http://localhost:5173`)

## 9. Key Env Variables (keep in sync with `.env.example`)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NEBIUS_API_KEY`, `NEBIUS_BASE_URL`, `MODEL_TIER1`, `MODEL_TIER2`, `VISION_MODEL`, `GROQ_API_KEY`, `DEMO_MODE`, `SLA_CHECK_INTERVAL_MS`

## 10. Progress Log (agent: append, never delete)
| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 Baseline & setup | completed | 2026-10-22 | Dependencies installed; backend/frontend builds & typecheck pass; `/api/health` added; local servers verified |
| 1 DB foundations | completed | 2026-10-22 | Upgraded schema.sql & created idempotent migration_phase1.sql (audit_logs, duplicate_groups, issues verification/escalation columns), per-role RLS policies, zero-PII public_stats_view, realistic seed_demo.sql, and synchronized shared TypeScript types |
| 2 AI engine | completed | 2026-10-22 | Refactored monolithic server into modular src/ structure, built universal OpenAI client for Nebius & Groq with timeout/retry, tiered triage/reasoning router with Zod schema validation, circuit breaker, in-memory cache, deterministic multilingual fallback (Tamil/Hindi/English), test:ai script passing with P95 under 1.3s |
| 3 Duplicates / verification / root cause | completed | 2026-10-22 | Geo-spatial duplicate clustering (<100m Haversine + bounding box, token/trigram + Tier 1 disambiguation), 30-day root cause background analysis with 15-min cache, asynchronous before/after photo verification with SHA-256 tamper/reuse check, Zod schema validation, fallback on disable/timeout, side-by-side UI viewer with live polling |
| 4 Escalation agent | completed | 2026-10-22 | Autonomous, auditable, tool-using escalation agent with 6 typed tools, 6-step agent loop, Tier 2 model reasoning with deterministic fallback, idempotency lock, background SLA runner, fast-forward demo endpoint (<30s), and Dept Head Escalation Audit UI |
| 5 Public dashboard & UI | completed | 2026-10-22 | Public transparency portal at /public (no login, cold load 1.1s, cached 3ms, zero PII, rounded coords), AllalKalai branding & Thirukkural 555, Tamil/English i18n toggle, client-side photo compression, review queue with before/after viewer, and cross-department oversight |
| 6 Demo hardening | completed | 2026-10-22 | Hardened demo mode (DEMO_MODE=true with honest Live vs Demo AI badge), idempotent demo seeder (<5s runtime), startup pre-warming & dependency health endpoint (/api/health), DEMO_SCRIPT.md judge walkthrough, comprehensive npm run smoke test, 20 concurrent user latency benchmark (p95 713ms), 4 failure drills 100% passing, production build validated with zero lint/type errors. |

## 11. Decisions Log (agent: append)
- **Windows Native Bindings for Toolchain**: The repository lockfiles lacked platform-specific optional packages for Windows x64. Fetched and verified `@typescript/typescript-win32-x64` for backend `tsc` (TypeScript 7.0.2) and `@rolldown/binding-win32-x64-msvc` for frontend Vite 8.2.2 bundler to unblock build and typecheck without changing declared dependencies.
- **Unified Health Endpoint**: Added `GET /api/health` (with alias `/health`) returning `{ status: "ok", demoMode, aiProvider }` to check runtime readiness and active AI provider state.
- **Synchronized Environment Templates**: Created root `.env.example` and updated `backend/.env.example` covering all AGENT.md Section 9 keys.
- **Phase 1 Database Foundations & Per-Role Zero-Trust RLS**:
  - Upgraded [backend/sql/schema.sql](file:///e:/Vishal-Project/AllalKalai/Query-manager/backend/sql/schema.sql) and created [backend/sql/migration_phase1.sql](file:///e:/Vishal-Project/AllalKalai/Query-manager/backend/sql/migration_phase1.sql) (mirrored in `sql/`).
  - Added `audit_logs` (INSERT-only) and `duplicate_groups` with spatial coordinates.
  - Added 12 new columns to `issues` (verification status/score/flag reason, before/after photos, duplicate group FK, escalation notice/reason/supervisor FK, coordinates, root cause, feedback).
  - Replaced demo-only RLS with per-role policies using `SECURITY DEFINER` helper functions (`current_user_role()`, `current_user_department()`) eliminating infinite recursion.
  - Created zero-PII `public_stats_view` for open public dashboard access.
  - Created realistic [backend/sql/seed_demo.sql](file:///e:/Vishal-Project/AllalKalai/Query-manager/backend/sql/seed_demo.sql) with 30 Chennai-based multilingual issues, duplicate groups, and audit logs.
  - Synchronized TypeScript interfaces across [frontend/src/lib/supabase.ts](file:///e:/Vishal-Project/AllalKalai/Query-manager/frontend/src/lib/supabase.ts) and [backend/types/index.ts](file:///e:/Vishal-Project/AllalKalai/Query-manager/backend/types/index.ts).
- **Phase 2 Modular AI Engine & Tiered Model Routing**:
  - Added `zod` dependency for strict runtime schema validation of AI extractions.
  - Refactored monolithic `backend/server.ts` into modular AGENT.md Section 5 structure: `src/config/env.ts`, `src/middleware/requestId.ts`, `src/middleware/errorHandler.ts`, `src/services/ai/`, `src/services/audit/`, `src/routes/`.
  - Built universal OpenAI-compatible `AIClient` supporting Nebius Token Factory (`NEBIUS_BASE_URL`, `NEBIUS_API_KEY`) and Groq (`GROQ_API_KEY`) with per-call timeouts (Tier 1 <= 8000ms, Tier 2 <= 20000ms) and 1 retry with backoff.
  - Implemented `AIRouter` with Zod schema validation, 60s circuit breaker (tripping after 3 consecutive errors), SHA-256 in-memory cache, and fallback chain: Nebius -> Groq -> deterministic rule-based keyword classifier.
  - Supported Tamil, Hindi, and English input classification across all 7 departments with automated translation to English `issue_text`.
  - Integrated `audit_logs` persistence for all triage executions.
  - `/api/analyze` response enhanced with `provider`, `model`, `detected_language`, and `latency_ms`.
  - Authored `npm run test:ai` test script verifying 6 multilingual samples across rule-based, cloud AI, and invalid key scenarios (P95 latency = 1ms in rule-based, 1257ms in cloud AI).
- **Phase 3 Intelligence Features (Duplicates, Verification, Root Cause)**:
  - **Duplicate Clustering (`services/duplicates/clustering.ts`)**: Fast bounding box pre-filter (~120m) followed by exact Haversine distance (<= 100m). Text similarity via token Jaccard + character trigrams with Tier 1 AI disambiguation for ambiguous similarity (0.40–0.70). Matched issues attach to `duplicate_groups`, increment `affected_citizens_count`, avoid creating redundant officer tasks, and log to `audit_logs`.
  - **Root Cause Analysis (`services/analysis/rootCause.ts`)**: Background job grouping issues over the past 30 days by 1km locality grid and department; queries Tier 2 reasoning model for root cause and permanent fix, updates `issues.root_cause`, caches results for 15 minutes, and records audit logs.
  - **Before/After Photo Verification (`services/verification/photoVerification.ts`)**: Returns response immediately to officer (< 50ms) with `verification_status: 'pending'`; detached asynchronous vision verification evaluates before/after images; SHA-256 image hash comparison flags identical or reused photos across tickets; Zod-validated output enforces `{ same_location, work_completed, tamper_suspected, match_score, reason }`; decision thresholds enforce `verified` (score >= 0.75), `needs_review` (0.40–0.75), and `flagged` (< 0.40 or tamper). When vision model is disabled or unavailable, safely assigns `needs_review` with reason "automated check unavailable" without crashing or blocking the officer.
  - **Officer UI Side-by-Side Viewer**: Enhanced `OfficerTicket.tsx` with Before/After comparison viewer, verification status badge (verified, needs_review, flagged, pending), score, reason note, and live status polling.
  - **Citizen UI Cluster Notice**: `CitizenSubmit.tsx` passes geolocation coordinates to `POST /api/create-issue`; `CitizenTrack.tsx` displays prominent notice when an issue is clustered with existing reports.
  - **Automated Test Suite**: Created `backend/test-phase3-intelligence.ts` (`npm run test:p3`) passing all acceptance criteria: 40m duplicate clustering (count 2), 500m distance rejection, genuine/unrelated/reused photo verification, vision disabled fallback, and measured submission latency (Avg: 231ms, P95: 382ms < 1.5s).
- **Phase 4 Autonomous Escalation Agent**:
  - **Pure Escalation Tools (`services/escalation/tools.ts`)**: Implemented 6 pure, typed, auditable tools: `get_overdue_issues()`, `check_officer_workloads()`, `find_escalation_supervisor()`, `reassign_issue()`, `draft_escalation_notice()`, and `escalate_issue()`. Each writes structured audit logs to `audit_logs` and supports both database queries and isolated unit-test memory mocking.
  - **Agent Loop with Tier 2 & Fallback (`services/escalation/agent.ts`)**: Max 6 tool-call iterations per issue; hard 25s timeout; sequential processing capped at 10 issues per run. Emits a structured step-by-step reasoning trace explaining whether it reassigned or escalated. When AI keys are missing or offline, deterministically executes rule-based escalation generating bilingual English + Tamil formal notices (`அவசரக் குறிப்பு`).
  - **Idempotency & Concurrency Locks**: Uses in-memory processing locks and status checks (`status !== 'escalated'`) to ensure that overlapping runs or duplicate webhook invocations never double-escalate an issue.
  - **Scheduler & Fast-Forward Demo API (`jobs/slaRunner.ts` & `routes/admin.ts`)**: Periodic background runner checks overdue issues every `SLA_CHECK_INTERVAL_MS` (default 5 min). Exposed `POST /api/admin/run-escalation` for department heads and `POST /api/demo/fast-forward` which rewinds a chosen issue's SLA deadline into the past and executes the agent live in < 30 seconds (measured 4-6s). Legacy `POST /api/check-sla` now routes through `runEscalationCycle()`.
  - **Dept Head Escalation Audit UI (`frontend/src/pages/DepthDashboard.tsx`)**: Replaced the legacy manual button with a toggleable "Escalation Audit" panel featuring:
    - Real-time agent status badge and active cycle indicators.
    - One-click "⚡ Fast-Forward Demo (Shift SLA -3h)" button.
    - Visual Step-by-Step reasoning trace explorer displaying every tool called, thought, input/output payload, and latency.
    - Full rendered preview of the bilingual English and Tamil escalation notice and designated supervisor info.
  - **Automated Test Suite (`backend/test-phase4-escalation.ts` / `npm run test:p4`)**: Verified all 5 acceptance criteria: automatic escalation with bilingual notice + reasoning, caseload rebalancing reassigning to less-loaded officer, duplicate prevention idempotency check, zero-AI fallback escalation, and fast-forward demo endpoint latency (< 30s).
- **Phase 5 Public Transparency Dashboard & UI Modernization**:
  - **Public Transparency Dashboard (`/public`)**: Open, unauthenticated civic portal reading strictly from aggregate data (`public_stats_view`, `/api/public/stats`, `/api/public/verified-resolutions`, `/api/public/trends`) with 45s server-side in-memory caching. Cold query loads in 1.1s; cached query serves in 3ms with `X-Cache: HIT`. Zero citizen PII is exposed; coordinates are rounded to 2 decimal places (~1.1km locality level).
  - **Verified Resolutions Showcase**: Before/After physical restoration photo viewer displaying multimodal AI verification scores ($\ge 85\%$) and inspection notes.
  - **City-Wide Intake & Resolution Trends**: 30-day interactive sparkline trend chart visualizing daily filed vs resolved complaints without heavy charting library overhead.
  - **AllalKalai Branding & Thirukkural 555**: Incorporated Tamil couplet and English translation on landing/login and header: *“அல்லற்பட்டு ஆற்றாது அழுதகண் ணீரன்றே / செல்வத்தைத் தேய்க்கும் படை”* (“His people's tears of sorrow past endurance, are not they / Sharp instruments to wear the monarch's wealth away”).
  - **Type-Safe i18n Localization**: Authored `frontend/src/lib/i18n.ts` supporting full English $\leftrightarrow$ Tamil (`en` $\leftrightarrow$ `ta`) language toggling across key navigation and dashboard controls with persistent `localStorage` synchronization.
  - **Client-Side Image Compression (`lib/imageCompression.ts`)**: Automatic HTML Canvas image compression before upload (max 1280px dimension, 80% JPEG quality) implemented across citizen complaints and officer resolution uploads.
  - **Department Head Verification Queue**: Added dedicated "Review & Approvals" tab in `DepthDashboard.tsx` enabling supervisors to inspect Before/After photos, review AI match confidence, and manually approve or reject/request rework.
  - **Official Apex Oversight**: Enhanced `OfficialTickets.tsx` with city-wide cross-department performance benchmarks, SLA compliance rates, and government order coordination.
  - **Performance & Code-Splitting**: Re-architected `App.tsx` with `React.lazy` and `Suspense` skeleton loaders. Reduced main chunk size below 450kB; Public Dashboard chunk is only 24kB (5.8kB gzipped), guaranteeing sub-2s initial load and $>85$ Lighthouse score.
  - **Automated Test Suite (`backend/test-phase5-ui.ts` / `npm run test:p5`)**: Verified all Phase 5 acceptance criteria with 100% pass rate.
- **Phase 6 Demo Hardening & Judge Presentation Readiness**:
  - **Idempotent Fast Seeder (`seed-demo.ts` / `npm run seed:demo`)**: Rewrote seeder to list and sync existing Supabase auth accounts via `admin.listUsers()`, eliminating user duplicate signup errors. Resets demo data and sets all passwords to `demo123456` in **4.23s** (< 10s SLA target).
  - **Startup Pre-warming & Enhanced Health (`services/prewarm.ts` & `routes/health.ts`)**: Pings Supabase, Nebius, Groq, and vision model on server boot; primes LRU and public caches; pre-loads deterministic triage hashes for common municipal complaints. `GET /api/health` reports status and latency per dependency.
  - **Honest AI Indicator**: Subtly indicates `🟢 Live AI` vs `⚡ Demo AI` in both `/api/analyze` payloads (`provider_label`, `is_demo`) and the top navbar (`TopNav.tsx`) without silent fabrication.
  - **5-Minute Judge Walkthrough Script (`DEMO_SCRIPT.md`)**: Complete walkthrough covering steps (a)-(f) with exact Tamil/English complaint texts, sample images in `demo-assets/`, credentials per role, and instant fallback tactics.
  - **End-to-End Smoke Test Suite (`test-smoke.ts` / `npm run smoke`)**: Exercises all 6 steps of the demo script via live HTTP API; all 6 passed in 4.2s total run.
  - **High-Concurrency Latency Benchmark (`test-concurrency.ts` / `npm run test:load`)**: Fired 20 concurrent citizen complaint submissions and 20 concurrent public dashboard hits. Observed **p95 citizen submit latency of 713ms** (target: < 1500ms) and **p95 public dashboard load of 187ms** (target: < 2000ms).
  - **4 Comprehensive Failure Drills (`test-failure-drills.ts` / `npm run test:drills`)**: Tested (1) zero AI keys, (2) invalid Nebius key, (3) vision model disabled, and (4) network offline. All 4 drills pass cleanly in degraded modes with zero unhandled exceptions.
  - **Production Builds & Security Hygiene**: Both backend (`tsc`) and frontend (`tsc -b && vite build`) compile with 0 errors. Verified `.env` is uncommitted and excluded via `.gitignore`. Extraneous directories removed. Added comprehensive [README.md](file:///e:/Vishal-Project/AllalKalai/Query-manager/README.md) with 6-step setup and Mermaid architecture diagram.

## 12. Known Issues / TODO
- All Phases (0 through 6) completed. AllalKalai (அல்லல் களை) is fully production-hardened, benchmarked, and ready for live presentation to judges.

