import { jsPDF } from 'jspdf';
import type { ConsentStateRow, Finding, Scan } from '../types.ts';

export function exportScanPdfReport(params: {
  scan: Scan;
  consentStates: ConsentStateRow[];
  findings: Finding[];
}): void {
  const { scan, consentStates, findings } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 44;
  let y = 52;

  const ensureSpace = (needed: number) => {
    if (y + needed > 780) {
      doc.addPage();
      y = 52;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('ClarityTrace Privacy & Consent Audit Report', margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Website: ${scan.website_name || scan.domain} (${scan.target_url})`, margin, y);
  y += 14;
  doc.text(`Scan ID: #${scan.id}  |  Status: ${scan.status}  |  Started: ${scan.started_at}`, margin, y);
  y += 14;
  doc.text(`Generated: ${new Date().toISOString()}`, margin, y);
  y += 24;

  // Consent state table summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Consent State Verification Summary', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const cs of consentStates) {
    ensureSpace(44);
    const line = `${cs.state_key.toUpperCase()} — Status: ${cs.status} | Banner: ${cs.banner_detected ? 'Detected' : 'Not detected'} | Reload verified: ${cs.reload_verified ? 'Yes' : 'No'} | Requests: ${cs.requests_count} | Cookies: ${cs.cookies_count}`;
    doc.text(line, margin, y);
    y += 14;
    if (cs.inconclusive_reason) {
      const wrapped = doc.splitTextToSize(`Inconclusive detail: ${cs.inconclusive_reason}`, 500);
      doc.text(wrapped, margin + 10, y);
      y += wrapped.length * 12 + 4;
    }
  }
  y += 14;

  // Findings section
  ensureSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`2. Evidence-Backed Findings (${findings.length})`, margin, y);
  y += 18;

  if (findings.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('No tracking regressions or pre-consent violations were observed in this scan.', margin, y);
  } else {
    for (const f of findings) {
      ensureSpace(95);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      const titleLines = doc.splitTextToSize(`[${f.severity.toUpperCase()}] ${f.title}`, 505);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 13;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Consent State: ${f.consent_state_key}  |  Confidence: ${f.confidence}  |  Evidence Type: ${f.evidence_type}`,
        margin,
        y
      );
      y += 13;

      const explLines = doc.splitTextToSize(`Explanation: ${f.technical_explanation}`, 505);
      doc.text(explLines, margin, y);
      y += explLines.length * 11.5;

      const evLines = doc.splitTextToSize(`Evidence Ref: ${f.evidence_ref}`, 505);
      doc.text(evLines, margin, y);
      y += evLines.length * 11.5;

      const actLines = doc.splitTextToSize(`Developer Action: ${f.suggested_action}`, 505);
      doc.text(actLines, margin, y);
      y += actLines.length * 11.5 + 12;
    }
  }

  doc.save(`claritytrace-scan-${scan.id}-report.pdf`);
}
