# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server (Express + Vite HMR)

# Build
npm run build        # Vite frontend + esbuild Node.js ESM bundle
npm run start        # Run production build

# Linting
npm run lint         # TypeScript type check (tsc --noEmit)

# Testing
npm run test         # Unit + API tests (vitest, mocked AI)
npm run test:unit    # Unit tests only (tests/unit/)
npm run test:api     # API integration tests only (tests/api/)
npm run test:e2e     # Playwright E2E tests (headless)
npm run test:e2e:headed  # Playwright E2E with visible browser
npm run test:all     # lint + all tests

# Run a single test file
npx vitest run tests/unit/validation.test.ts
npx playwright test tests/e2e/app.spec.ts
```

## Architecture

Full-stack TypeScript app: Vite/React frontend + Express backend, bundled separately.

**Data flow:**
1. **JD Extraction** (`server/jd.ts`) — Normalizes job description from URL (cheerio scrape), file (PDF/DOCX/TXT), or paste. Extracts keywords, must-haves, seniority signals.
2. **Resume Parsing** (`server/resume.ts`) — Parses uploaded DOCX via mammoth. Extracts structured sections (experience, education, skills, etc.) with **source provenance** — every fact is tagged to its location in the original document.
3. **AI Tailoring** (`server/tailor.ts`) — Sends provenance-tagged source facts + tailoring plan to Google Gemini. AI rewrites bullet points to match JD keywords but is constrained to only use verified source facts. Falls back to template-based tailoring on failure.
4. **Validation Gate** (`server/validate.ts`) — Blocks output if the tailored resume contains companies, titles, or dates that differ from the source, or any claims not traceable to source provenance. This is the core integrity check.
5. **DOCX Generation** (`server/docx-render.ts`) — Rebuilds a DOCX from the validated tailored content, attempting to preserve reference resume styling.

**Key design constraint:** The AI is never allowed to fabricate facts. Provenance tracking + the validation gate enforce this — `validate.ts` will block the download if unsupported claims are detected.

**API endpoints** (`server/app.ts`):
- `POST /api/extract-jd-url` — Extract JD from a URL
- `POST /api/extract-jd-file` — Extract JD from uploaded file
- `POST /api/tailor-resume` — Full tailoring pipeline (parse → analyze → tailor → validate)
- `POST /api/generate-docx` — Generate DOCX from a validated tailored resume

**Frontend** (`src/App.tsx`) — Single 615-line component implementing a 3-step wizard: (1) JD input, (2) resume upload + preferences, (3) results + download. Validation status controls whether download is enabled.

**Shared types** (`src/shared/types.ts`) — Single source of truth for all data structures passed between frontend and backend: `SourceResumeDocument`, `TailoredResumeDocument`, `NormalizedJobDescription`, `ValidationReport`, `TailoringPlan`, etc.

## Testing Strategy

- **Unit tests** (`tests/unit/`) — Test file-type detection, resume parsing, and validation logic in isolation.
- **API tests** (`tests/api/`) — Integration tests using `supertest` against an Express app with a mocked AI client (`tests/helpers/mock-ai.ts`). AI responses are driven by fixture files (`tests/fixtures/mock-ai-*.json`).
- **E2E tests** (`tests/e2e/`) — Playwright tests spin up a separate test server (`tests/e2e/server.ts`, port 3100) also using the mocked AI. Three scenarios: happy path (validated download), blocked path (validation failure), and warning path (extraction warnings + reset).

The mock AI fixture `mock-ai-blocked.json` is triggered when the JD contains `[blocked]` — this simulates a validation failure without real AI.

## Environment

Requires `GEMINI_API_KEY` in a `.env` file (see `.env.example`). The key is injected into the Vite build via `define` in `vite.config.ts` but is primarily used server-side in `server/tailor.ts`.
