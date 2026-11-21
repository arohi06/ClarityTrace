# ClarityTrace — Known Limitations & Scope Boundaries

ClarityTrace is designed as an **evidence-backed technical observation platform**, not a legal compliance certification tool. Engineers and privacy reviewers should account for the following technical boundaries when interpreting scan results:

1. **Not Legal Advice or Compliance Certification**
   - ClarityTrace reports observed HTTP/HTTPS requests, cookies, Web Storage entries, and banner interaction outcomes. Findings are framed as technical observations (*"Potential consent issue — further verification recommended"*) rather than GDPR/CCPA/DPDP legal rulings.

2. **Consent Management Platform (CMP) & Shadow DOM Variance**
   - Websites implement custom banners, multi-step preference modals, geolocation-conditional CMPs, and closed Shadow DOM widgets. When ClarityTrace cannot locate an unambiguous *Accept All* or *Reject All* control—or when clicking does not produce a verifiable state change—it explicitly records `inconclusive` instead of guessing.

3. **Unauthenticated Public Surface Only**
   - Scans run strictly against public URLs without bypassing login walls, MFA prompts, CAPTCHAs, or bot-mitigation interstitials. Tracking scripts that fire only behind authenticated checkout or account flows require running ClarityTrace in staging environments or against authorized test fixtures.

4. **Short-Lived Headless Observation Windows**
   - Each consent context settles for a configurable observation window (1,200 ms default or 2,500 ms extended) plus a reload verification pass. Lazy-loaded analytics triggered only after deep scroll, long idle timers, or complex multi-page user journeys may not fire during a single-page load.

5. **Deterministic Rule Coverage vs. First-Party Proxies**
   - First-party CNAME cloaking or reverse-proxied analytics endpoints (e.g., `/collect` hosted on the website's own domain) are flagged when matching known payload/path heuristics, but obfuscated proprietary endpoints may be classified as `first_party` or `unknown` until added to `server/rules.ts`.

6. **Optional Gemini Policy vs Reality Grounding**
   - If `GEMINI_API_KEY` is not configured in the environment, Policy vs Reality extraction is disabled cleanly while deterministic Playwright scanning, Consent Behaviour Fingerprints, regression diffs, and JSON/PDF exports continue working without degradation.
