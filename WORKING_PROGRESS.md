# Universal One-Click Apply Agent — Working Progress

This document is the execution tracker for building a near-universal one-click apply system in this repo. The target is straightforward: automate repetitive job-application work as far as possible, pause only at hard gates that require a human, and learn from every run so coverage improves over time. Current working branch: `claude/repo-summary-FWbQZ`.

## Production Readiness

- Current branch state: `production_ready_for_deploy_validation`
- Meaning:
  - the planned core architecture is implemented on this branch
  - local validation for app, extension-hybrid flow, local-agent flow, ledger APIs, and apply-agent evals is green
  - the next validation step is deployment to Vercel plus real-portal production testing
- Required before deploy:
  - apply the current schema in `scripts/create-tables.sql`
  - deploy both the web app and the rebuilt extension/local-agent artifacts from this branch state
- Remaining work after deploy, if needed, should be treated as production hardening based on live traces, not as missing core implementation

## Locked Decisions

- Runtime: hybrid local agent
- Web app role: user-facing control plane for search, tailor, apply, history, takeover, and review
- Backend role: orchestration, persistence, answer memory, search/tailor logic, metrics, and session state
- Extension role: app/browser bridge, handoff broker, manual-takeover helper, page detection
- Local agent role: Playwright execution runtime with a persistent managed browser profile
- LLM role: bounded planner and ambiguity resolver, not the primary executor
- Human takeover: required for login, MFA, CAPTCHA/bot protection, legal/self-ID, assessments, and genuinely unknown personal answers
- Market focus: India + global mix
- Search requirement: verified source + full JD before tailoring/apply
- Success framing: automate repetitive candidate work and supported apply flows; do not treat CAPTCHA bypass as in scope

## Current Repo State

### Already done

- Search flow exists with persisted latest-search recovery and Perplexity-primary search
- Tailoring exists with deterministic server merge, saved default resume support, and provider fallback
- Applicant/application profile persistence exists for recurring form answers
- Apply-session backend and Stage 5 hybrid orchestration exist
- Extension runtime exists with portal taxonomy, widget classification, pause reasons, and checkpointing
- Applications/jobs persistence and dashboard shell exist
- Job/application ledger now persists lifecycle, retry/replay references, ranked search-result visibility, application trace metadata, portal/executor state, and persisted apply metrics
- Local agent runtime, managed-browser takeover flow, answer-bank learning, and recovery/resume flow are implemented
- Local validation is green across:
  - `npm run lint`
  - `npm run build`
  - `npm run build:ext`
  - `npx vitest run tests/api/app.test.ts tests/api/job-ledger.test.ts tests/unit/job-ledger.test.ts tests/unit/portal-drivers.test.ts`
  - `npx playwright test tests/e2e/local-agent-hybrid.spec.ts --project=local-agent-hybrid`
  - `npx playwright test tests/e2e/hybrid-extension.spec.ts --project=extension-hybrid`
  - `npx playwright test tests/e2e/app.spec.ts --project=chrome`
  - `npm run eval:apply-agent`

### Known gaps

- The remaining unknowns are live-portal production hardening items, not missing core architecture:
  - real-portal reliability measurement across production ATS mixes
  - richer freshness verification for stored jobs and JDs
  - broader trace-driven improvement after live production feedback
  - richer dashboard surfaces for replay and trace inspection

## Target System

### Web app

- Owns search, tailor, apply initiation, history, takeover prompts, and replay/evidence views
- Does not own long-running browser execution
- Talks to backend and extension; never directly controls hard portal flows

### Backend

- Owns job ledger, applicant memory, answer bank, tailoring, apply sessions, telemetry, and eval artifacts
- Does not own a long-running browser
- Returns structured plans and stores structured execution results

### Extension

- Owns browser/app bridging, local-agent detection, and takeover helper UX
- Can detect when the user is on an application page and broker handoff
- Does not remain the main hard-portal execution engine

### Local agent

- Owns Playwright execution, long-running sessions, retries, recovery, and hard-form navigation
- Runs with a persistent managed browser profile dedicated to Resume Tailor
- Streams structured progress and artifacts back to backend/app

## Phase Tracker

### Phase 0 — Stabilize current branch foundation

- Status: `done`
- Goal: make the current branch safe to build on
- Implemented:
  - partial applications/jobs persistence
  - dashboard shell
  - apply-session persistence hooks
  - dashboard `/api/applications` response contract fixed in the app
  - application status updates scoped to the current user
  - `manual_required` preserved as a first-class application status
  - apply-session creation now persists richer job metadata when available
- Still missing:
  - backfill/improve job metadata when apply sessions start without a selected search result
  - richer dashboard rendering for lifecycle/retry chain details
- Exit criteria:
  - dashboard loads correct data
  - status updates are user-safe
  - application rows show meaningful title/company/source data

### Phase 1 — Local agent runtime

- Status: `done`
- Goal: add a real Playwright-capable execution runtime on the user's machine
- Implemented:
  - `local-agent/` service with loopback health and session endpoints
  - persistent managed browser profile bootstrapping
  - extension background health check for the local agent
  - web app and popup visibility into local-agent readiness
  - app/backend session selection for `local_agent`
  - extension → local-agent session start and resume handoff
  - extension/app → local-agent focus handoff for human takeover
  - local-agent idempotent start plus restart-from-latest-page fallback when a resume is requested after agent loss
- Still missing:
  - richer onboarding and replay UI can still be improved after production traces
- Exit criteria:
  - local agent can launch, report healthy, and start a controlled browser session
  - extension can detect and talk to the local agent

### Phase 2 — Universal browser apply loop

- Status: `done`
- Goal: build the general-purpose inspect → plan → act → verify loop
- Implemented:
  - partial apply-session planning in the backend
  - current portal/widget classification in the extension
  - local-agent native-field inspect → plan → act → progress loop
  - local-agent hard-gate detection for bot protection and login-required pages
  - explicit local-agent submit path with browser proof
  - repeated work-history section expansion driven by session resume context
- Still missing:
  - further production hardening can deepen multi-view reasoning and verification strategies
- Exit criteria:
  - local agent can complete deterministic multi-step native forms with verification after every action

### Phase 3 — Widget driver system

- Status: `done`
- Goal: support the control types that actually block form automation
- Implemented:
  - widget-kind taxonomy in current shared types/capability logic
  - local-agent detection of custom combobox, multiselect, numeric, and date-like widgets
  - hidden file upload support through native file inputs in the local-agent loop
  - local-agent planning support for `custom_combobox`, `custom_number`, and `custom_date`
  - local-agent execution bindings for custom widgets instead of treating them as inspect-only fields
  - executor-aware capability gating so custom widgets remain review-only for the extension path
  - first local-agent browser proof for supported custom widgets, including submit readiness and confirmed submit
  - repeated work-history, education, project, and certification row expansion and indexed-row filling from structured session context
- Still missing:
  - production traces may justify broader widget-driver variants
- Exit criteria:
  - widget drivers can be reused across portals without portal-specific hacks

### Phase 4 — Portal drivers

- Status: `done`
- Goal: add portal-aware acceleration on top of the universal agent
- Implemented:
  - portal taxonomy/detection for major ATS families
  - local-agent portal-driver layer
  - LinkedIn driver with Easy Apply-style field hints and review-only rules
  - Naukri driver with India-specific compensation/notice-period hints and review-only profile-marketing rules
  - first driver overrides for Greenhouse, Lever, and Workday control classification / step detection
  - Greenhouse-oriented local-agent submit path with portal-specific success detection
  - Greenhouse, Lever, and Workday semantic-hint / review-only field heuristics
  - Phenom driver with step-name-aware detection, field hints, and work-history review rules
  - Ashby, iCIMS, SmartRecruiters, Taleo, and SuccessFactors driver heuristics for step detection, field hints, and compliance review
  - browser-fixture coverage for LinkedIn, Naukri, Greenhouse, Lever, Phenom, and Workday hosted apply flows in the current hybrid proof harness
  - browser-fixture coverage for Ashby, iCIMS, SmartRecruiters, Taleo, and SuccessFactors hosted apply flows in the current hybrid proof harness
- Still missing:
  - future production traces may justify deeper per-portal heuristics
- Exit criteria:
  - top target ATS families have reliable portal drivers on top of the generic engine

### Phase 5 — Applicant memory + answer bank

- Status: `done`
- Goal: remove repeated user input from future applications
- Implemented:
  - default resume persistence
  - application profile persistence for core candidate fields
  - shared answer-bank type and storage path alongside the application profile
  - Stage 5 editor for recurring screening question/answer pairs
  - planner fallback that uses saved answers before pausing on unknown or missing-question values
  - review-item promotion into the saved-answer editor from Stage 5
  - managed-browser correction capture back into saved profile/answer-bank memory on resume
- Still missing:
  - future normalization refinements can improve reuse quality further
- Exit criteria:
  - previously answered recurring questions no longer trigger manual input on later applications

### Phase 6 — Job/application ledger

- Status: `done`
- Goal: persist the real lifecycle of search → queue → apply → outcome
- Implemented:
  - latest search persistence
  - partial jobs/applications tables and APIs
  - jobs/applications schema added to repo bootstrap SQL
  - queued lifecycle state and richer source metadata in server-side persistence
  - event-driven application status syncing from apply-session progress
  - durable application trace metadata fields in the schema and query layer
  - persisted executor/portal/last-step/trace-count state on application records
  - durable job lifecycle fields for discovered/shown/saved/queued/applying/applied/failed/manual_required/dismissed
  - ranked search-result persistence into the job ledger on `/api/search-jobs`
  - replay/retry linkage between application attempts plus `/api/applications/:id/replays`
  - `/api/jobs/:id` lifecycle patching and deterministic job ordering for history views
  - persisted application metrics from stored application runs via `/api/apply/metrics` when Supabase-backed auth is active
- Still missing:
  - more advanced freshness analytics and replay UI can be added after live usage
- Exit criteria:
  - users can leave and return without losing true search/application state

### Phase 7 — Human takeover + resume

- Status: `done`
- Goal: make hard gates survivable without breaking automation
- Implemented:
  - pause-reason taxonomy
  - Stage 5 review/confirm patterns
  - explicit “Take Over in Managed Browser” control for local-agent sessions
  - local-agent browser focus handoff via extension bridge
  - resume path that learns corrected answers before restarting the agent
  - screenshot-backed pause states for local-agent review/manual/protected/ready-to-submit moments
- Still missing:
  - finer copy polish can happen after production feedback
- Exit criteria:
  - login/CAPTCHA/legal/assessment gates pause cleanly and resume cleanly

### Phase 8 — Evals, telemetry, learning loop

- Status: `done`
- Goal: turn execution traces into coverage growth and measurable reliability
- Implemented:
  - limited E2E/browser proof for current hybrid extension flow
  - apply-session trace storage and retrieval
  - aggregate apply automation metrics by status, portal, pause reason, and executor mode
  - persisted metric aggregation from stored application runs for authenticated Supabase-backed flows
  - fixture-based local-agent eval entrypoint via `npm run eval:apply-agent`
  - browser proof for advanced custom widgets and repeated work-history, education, project, and certification expansion in the local-agent path
  - replay-chain API and durable ledger metadata for retry analysis
  - green isolated local-agent eval artifact run with 11/11 passing specs in `evals/apply-agent/last-summary.json`
  - full local browser validation across app UI, extension-hybrid, and local-agent suites
- Still missing:
  - live production telemetry will refine success-rate claims after deployment
- Exit criteria:
  - the system can quantify success by portal, widget, and gate type

## Immediate Next Work

1. Deploy this branch state to Vercel and apply the schema changes in `scripts/create-tables.sql`
2. Rebuild/reload the extension and local agent from this branch state
3. Run production validation against real portals and capture traces from any failures
4. Use live traces to decide post-deploy hardening, not pre-deploy core implementation work

## Open Risks

### Managed browser profile adoption

- Why it matters: the local agent needs stable sessions to be effective
- Mitigation direction: make first-run onboarding explicitly log the user into key portals inside the managed profile and persist those sessions locally

### Bot protection and CAPTCHA

- Why it matters: these are true hard boundaries for unattended automation
- Mitigation direction: first-class takeover path; never fake success; never attempt blind bypass

### Legal/self-ID policy

- Why it matters: these answers can be sensitive or jurisdiction-specific
- Mitigation direction: policy-enforced pause unless the user has explicitly saved approved defaults

### Widget generalization

- Why it matters: custom widgets block generic automation more often than simple field mapping
- Mitigation direction: build widget drivers as a reusable layer before overinvesting in more portal scripts

### Eval gap vs real world

- Why it matters: fixture success can hide production failure modes
- Mitigation direction: deterministic fixtures and local evals are complete; production validation and live traces are the next reliability input

## Acceptance Metrics

- Unattended completion rate on supported portals
- Repeated-input automation rate
- Takeover rate by reason
- Field-correction rate after agent fill
- False-fill rate
- Submit success rate
- Success rate by ATS family
- Success rate by widget kind
- Average number of manual interventions per application
- Average time-to-complete per application

## Decision Log

| Date | Decision | Why | Supersedes |
|---|---|---|---|
| 2026-03-25 | Use a hybrid local agent runtime | Extension-only execution will plateau below the required automation ceiling | Extension-first hard-portal strategy |
| 2026-03-25 | Human takeover is mandatory at hard gates | Login/CAPTCHA/legal/assessment flows should pause cleanly, not break trust | Blind fallback/manual failure handling |
| 2026-03-25 | Use India + global mix as the initial market focus | Matches target portal mix and user base assumptions | US-only adapter prioritization |
| 2026-03-25 | Keep LLM as planner, not primary executor | Reliability comes from deterministic execution with bounded reasoning | Screenshot-first or LLM-first control |

## Non-goals For Now

- CAPTCHA solving
- MFA bypass
- Account creation automation
- Blind auto-answering of unknown personal or legal questions
- Cloud-browser execution as phase 1
- Treating ATS-specific scripts alone as the main architecture
