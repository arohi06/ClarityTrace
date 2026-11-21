# ClarityTrace

**ClarityTrace** is an AI-assisted website privacy monitoring, consent-state verification, and baseline regression testing platform built by Team NextGen for the Google Startup Buildathon (Mumbai City Round).

It observes actual browser behaviour across isolated Playwright Chromium sessions rather than relying solely on privacy policy text or static guesses.

## Architecture & Core Capabilities

1. **Isolated Multi-State Playwright Scanner (`server/scanner.ts`, `server/consent.ts`)**
   - Launches a clean, isolated headless Chromium browser context per scenario (`no_consent`, `accept_all`, `reject_all`).
   - Captures HTTP/HTTPS network requests, cookies (`HttpOnly`, `Secure`, `SameSite`, expiry), `localStorage`, `sessionStorage`, and SHA-256-indexed HAR archives.
   - Detects consent banners across main documents and child iframes, records reload persistence, and marks ambiguous/unverifiable controls as `inconclusive`.
2. **Deterministic Classification & Allowlist Rules (`server/rules.ts`)**
   - Classifies analytics, advertising, fingerprinting, functional, CDN, and payment endpoints.
   - Explicitly separates legitimate payment infrastructure (e.g. Stripe checkout/JS) from tracking beacons to avoid false positives.
3. **Consent Behaviour Fingerprint & Regression Timeline (`server/comparison.ts`)**
   - Computes a versioned SHA-256 **Consent Behaviour Fingerprint** per scan.
   - Compares releases against pinned or prior baselines to surface `Newly Detected`, `Removed`, and `Changed` metrics and consent-state regressions.
4. **SSRF & Security Guardrails (`server/security.ts`)**
   - DNS-resolving SSRF guard blocks loopback, RFC 1918 private networks, link-local, and cloud metadata endpoints (`169.254.169.254`), plus Playwright subresource interception.
   - JWT + bcrypt authentication and sanitized prompt-injection boundaries.
5. **Policy vs Reality Analysis (`server/gemini.ts`)**
   - Uses `@google/genai` server-side with structured JSON schemas to extract privacy policy disclosures and compare them strictly against captured browser telemetry (never inventing telemetry or legal verdicts).
6. **Controlled Evaluation Lab (`server/testLab.ts`, `tests/evaluate.ts`)**
   - Ships 6 deterministic browser test scenarios (Zero Tracking, Pre-Consent Cookie, Post-Reject Tracker, Compliant Opt-In, Release Regression, and Payment Gateway) for automated precision/recall verification.

## Local Setup & Commands

### Prerequisites
- Node.js 22+
- Playwright Chromium browser binaries installed (`npx playwright install chromium`)

### Environment Variables (`.env.example`)
- `JWT_SECRET`: Persistent secret key for signing API session tokens (**required in production**, minimum 16 characters; in local dev only, defaults to an untracked secret persisted in `data/.jwt_dev_secret`).
- `CLARITYTRACE_DB_PATH`: Path to SQLite database file (defaults to `./data/claritytrace.db`; parent directory and `evidence/` folder are created automatically).
- `SCAN_TIMEOUT_MS`: Per-consent-state Playwright timeout in milliseconds (defaults to `60000`).
- `GEMINI_API_KEY`: Optional server-side API key for Policy vs Reality analysis and finding explanations. Core browser scanning, deterministic rules, and regression comparisons operate fully without it.
- `APP_URL`: Optional public deployment URL.

### Running Locally (Development)
```bash
npm install
npm run dev
```
The Express + Vite server listens on `http://localhost:3000`.

### Production Build & Start
```bash
npm run build
JWT_SECRET="replace-with-strong-32-char-secret" npm start
```
`npm run build` compiles the React frontend (`dist/`) via Vite and bundles the Express backend (`dist-server/server.js`) via esbuild. `npm start` executes `NODE_ENV=production node dist-server/server.js` and serves the built SPA from `dist/`.

### Automated Evaluation Suite
```bash
npm test
```
Runs `tests/evaluate.ts` against live Playwright Chromium contexts across Evaluation Lab Scenarios A–F, missing-banner inconclusive detection, SHA-256 fingerprint determinism, and SSRF validation checks.

## Deployment Artifacts
- `/Dockerfile` & `/deploy/Dockerfile`: Multi-stage production container image building `dist/` + `dist-server/server.js` and installing Playwright Chromium dependencies (`CMD ["node", "dist-server/server.js"]`).
- `/deploy/cloudrun.yaml`: Google Cloud Run service manifest.
- `/deploy/postgres_schema.sql`: PostgreSQL production relational schema mirror of `server/db.ts`.
