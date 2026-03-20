<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0699709b-9d0a-455c-b51f-10b9d13b4903

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` in `.env.local` or `.env`
3. Run the app:
   `npm run dev`

## Current Behavior

- Job descriptions can be ingested from a URL, uploaded file, or pasted text.
- Reference resumes for the tailoring flow must be `.docx`.
- The app parses the resume into a canonical in-memory structure, builds a tailoring plan, rewrites only from verified facts, and blocks DOCX generation if validation fails.
- The generated DOCX attempts to preserve the reference resume's style and layout where feasible.

## Testing

- `npm run lint`: Type-check the app and tests.
- `npm run test`: Run unit and API integration tests with mocked AI fixtures.
- `npm run test:e2e`: Run Chromium browser tests against a mocked-AI local server.
- `npm run test:all`: Run lint, unit/API tests, and browser tests.

Browser tests use Playwright and may require system browser libraries to be available on the host.
