import type { Express, Request, Response } from 'express';

function renderTestPage(opts: {
  title: string;
  scenarioCode: string;
  description: string;
  scriptBody: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${opts.title} — ClarityTrace Evaluation Lab</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #0f172a; }
    .banner { position: fixed; bottom: 20px; right: 20px; left: 20px; max-width: 520px; background: #fff; border: 1px solid #cbd5e1; padding: 18px; border-radius: 8px; box-shadow: 0 10px 25px rgba(15,23,42,0.12); }
    .actions { display: flex; gap: 10px; margin-top: 12px; }
    button { padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer; font-weight: 600; }
    button.accept { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    button.reject { background: #f8fafc; color: #0f172a; }
  </style>
</head>
<body>
  <h1>ClarityTrace Evaluation Scenario ${opts.scenarioCode}: ${opts.title}</h1>
  <p>${opts.description}</p>
  <p id="status">Consent state: pending</p>
  <a href="/test-lab/privacy-policy">Privacy Policy</a>

  <div data-ct-banner="true" role="dialog" aria-label="Cookie consent preferences" class="banner" id="ct-banner">
    <strong>Cookie &amp; Telemetry Preferences</strong>
    <p style="margin:6px 0 0;font-size:14px;color:#475569;">We use strictly necessary storage and optional analytics/advertising tools depending on your consent choice.</p>
    <div class="actions">
      <button type="button" class="reject" data-ct-consent="reject" id="btn-reject">Reject All</button>
      <button type="button" class="accept" data-ct-consent="accept" id="btn-accept">Accept All</button>
    </div>
  </div>

  <script>
    ${opts.scriptBody}
  </script>
</body>
</html>`;
}

export function registerTestLabRoutes(app: Express): void {
  // Collector endpoints for real HTTP request & Set-Cookie observations
  app.get('/test-lab/collect/analytics', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'ct_analytics_id=an_992104; Path=/; SameSite=Lax');
    res.json({ ok: true, collector: 'analytics' });
  });

  app.get('/test-lab/collect/ads', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'ct_ad_uid=ad_448120; Path=/; SameSite=Lax');
    res.json({ ok: true, collector: 'ads' });
  });

  app.get('/test-lab/collect/v2-tracker', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', '_ga=GA1.2.12345678.9999; Path=/; SameSite=Lax');
    res.json({ ok: true, collector: 'v2-tracker' });
  });

  app.get('/test-lab/payment/stripe-checkout.js', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Set-Cookie', 'payment_intent_session=pi_ok_101; Path=/; SameSite=Lax');
    res.send('window.__ctStripeReady = true;');
  });

  app.get('/test-lab/privacy-policy', (_req: Request, res: Response) => {
    res.send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Test Lab Privacy Policy</title></head>
<body>
  <h1>Privacy Policy</h1>
  <p>We respect your privacy choices. We do not place analytics cookies or transmit behavioral telemetry before you explicitly click Accept All.</p>
  <p>If you click Reject All, all optional analytics and advertising scripts remain disabled across page reloads.</p>
  <p>When you accept analytics cookies, we collect aggregated page performance metrics via first-party or named analytics processors.</p>
  <p>We use a payment gateway solely during checkout to process transactions securely; payment gateway requests are strictly necessary for billing.</p>
  <p>We do not sell personal data or deploy third-party advertising retargeting pixels without explicit opt-in consent.</p>
</body>
</html>`);
  });

  // Scenario A: No tracking before consent (clean across all states)
  app.get('/test-lab/scenario-a', (_req: Request, res: Response) => {
    res.send(
      renderTestPage({
        scenarioCode: 'A',
        title: 'Clean Zero-Tracking Site',
        description: 'No tracking scripts, analytics cookies, or third-party requests fire before or after consent.',
        scriptBody: `
          function setState(val) {
            document.cookie = "ct_consent=" + val + "; path=/; SameSite=Lax";
            localStorage.setItem("ct_consent", val);
            document.getElementById("status").textContent = "Consent state: " + val;
            document.getElementById("ct-banner").style.display = "none";
          }
          document.getElementById("btn-accept").onclick = () => setState("accepted");
          document.getElementById("btn-reject").onclick = () => setState("rejected");
        `,
      })
    );
  });

  // Scenario B: Analytics cookie & request BEFORE consent
  app.get('/test-lab/scenario-b', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', '_ga=GA1.2.445566.778899; Path=/; SameSite=Lax');
    res.send(
      renderTestPage({
        scenarioCode: 'B',
        title: 'Pre-Consent Analytics Violation',
        description: 'Sets _ga analytics cookie and fires telemetry immediately on page load before user consent.',
        scriptBody: `
          fetch('/test-lab/collect/analytics?ev=pageview&preconsent=1');
          localStorage.setItem('analytics_uid', 'usr_pre_991');
          document.getElementById("btn-accept").onclick = () => {
            document.cookie = "ct_consent=accepted; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
          document.getElementById("btn-reject").onclick = () => {
            document.cookie = "ct_consent=rejected; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
        `,
      })
    );
  });

  // Scenario C: Tracking fires AFTER clicking Reject All
  app.get('/test-lab/scenario-c', (_req: Request, res: Response) => {
    res.send(
      renderTestPage({
        scenarioCode: 'C',
        title: 'Post-Reject Advertising Violation',
        description: 'Clean before interaction, but fires an advertising retargeting pixel and sets _fbp even when Reject All is clicked.',
        scriptBody: `
          const saved = localStorage.getItem('ct_consent');
          if (saved === 'rejected') {
            fetch('/test-lab/collect/ads?ev=retarget_reload');
          }
          document.getElementById("btn-accept").onclick = () => {
            localStorage.setItem('ct_consent', 'accepted');
            document.cookie = "ct_consent=accepted; path=/";
            fetch('/test-lab/collect/analytics?ev=accepted');
            document.getElementById("ct-banner").style.display = "none";
          };
          document.getElementById("btn-reject").onclick = () => {
            localStorage.setItem('ct_consent', 'rejected');
            document.cookie = "_fbp=fb.1.1700000000.998877; path=/";
            fetch('/test-lab/collect/ads?ev=rejected_still_tracked');
            document.getElementById("ct-banner").style.display = "none";
          };
        `,
      })
    );
  });

  // Scenario D: Compliant Opt-In (Tracking ONLY after Accept All)
  app.get('/test-lab/scenario-d', (_req: Request, res: Response) => {
    res.send(
      renderTestPage({
        scenarioCode: 'D',
        title: 'Compliant Opt-In Consent',
        description: 'Fires analytics strictly after Accept All; stays clean on No Consent and Reject All across reloads.',
        scriptBody: `
          const saved = localStorage.getItem('ct_consent');
          if (saved === 'accepted') {
            fetch('/test-lab/collect/analytics?ev=reload_accepted');
          }
          document.getElementById("btn-accept").onclick = () => {
            localStorage.setItem('ct_consent', 'accepted');
            document.cookie = "ct_consent=accepted; path=/";
            fetch('/test-lab/collect/analytics?ev=opt_in');
            document.getElementById("ct-banner").style.display = "none";
          };
          document.getElementById("btn-reject").onclick = () => {
            localStorage.setItem('ct_consent', 'rejected');
            document.cookie = "ct_consent=rejected; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
        `,
      })
    );
  });

  // Scenario E: New tracker introduced in later release (?release=v2)
  app.get('/test-lab/scenario-e', (req: Request, res: Response) => {
    const release = req.query.release === 'v2' ? 'v2' : 'v1';
    res.send(
      renderTestPage({
        scenarioCode: 'E',
        title: `Release Regression (${release})`,
        description: 'v1 is clean; v2 introduces an unapproved v2-tracker telemetry beacon even without consent.',
        scriptBody: `
          const isV2 = ${release === 'v2' ? 'true' : 'false'};
          if (isV2) {
            fetch('/test-lab/collect/v2-tracker?release=v2');
          }
          document.getElementById("btn-accept").onclick = () => {
            document.cookie = "ct_consent=accepted; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
          document.getElementById("btn-reject").onclick = () => {
            document.cookie = "ct_consent=rejected; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
        `,
      })
    );
  });

  // Scenario F: Legitimate new payment gateway request in later release (?release=v2)
  app.get('/test-lab/scenario-f', (req: Request, res: Response) => {
    const release = req.query.release === 'v2' ? 'v2' : 'v1';
    res.send(
      renderTestPage({
        scenarioCode: 'F',
        title: `Legitimate Payment Gateway (${release})`,
        description: 'v2 loads a payment checkout integration without introducing any advertising or analytics trackers.',
        scriptBody: `
          const isV2 = ${release === 'v2' ? 'true' : 'false'};
          if (isV2) {
            const s = document.createElement('script');
            s.src = '/test-lab/payment/stripe-checkout.js';
            document.head.appendChild(s);
          }
          document.getElementById("btn-accept").onclick = () => {
            document.cookie = "ct_consent=accepted; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
          document.getElementById("btn-reject").onclick = () => {
            document.cookie = "ct_consent=rejected; path=/";
            document.getElementById("ct-banner").style.display = "none";
          };
        `,
      })
    );
  });
}
