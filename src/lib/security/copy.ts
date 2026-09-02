import { explainFinding, plainFindingTitle, riskIfUnfixed } from './explain';
import { findingsByCategory, type SurfaceAnalysis, type SurfaceFinding } from './surface-audit';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function findingsToPlainList(findings: SurfaceFinding[]): string[] {
  return findings.map((item) => `${plainFindingTitle(item.code, item.title)}: ${item.detail}`);
}

function bulletForFinding(item: SurfaceFinding): string[] {
  const explained = explainFinding(item.code);
  const lines = [
    `• ${plainFindingTitle(item.code, item.title)}`,
    `  In pratica: ${explained.meaning}`,
  ];
  if (item.category === 'info') {
    lines.push(`  Nota: ${item.limit || explained.limit || 'Non è da sola un problema da sistemare.'}`);
  } else {
    lines.push(`  ${riskIfUnfixed(explained.risk)}`);
  }
  if (explained.remediation) lines.push(`  Come sistemarlo: ${explained.remediation}`);
  return lines;
}

function htmlRowForFinding(item: SurfaceFinding): string {
  const explained = explainFinding(item.code);
  const third =
    item.category === 'info'
      ? `<br/><span style="color:#78716c">Nota: ${escapeHtml(item.limit || explained.limit || 'Non è da sola un problema da sistemare.')}</span>`
      : `<br/><span style="color:#78716c">${escapeHtml(riskIfUnfixed(explained.risk))}</span>`;
  const remediation = explained.remediation
    ? `<br/><span style="color:#57534e"><strong>Come sistemarlo:</strong> ${escapeHtml(explained.remediation)}</span>`
    : '';
  return `<li style="margin:0 0 12px"><strong>${escapeHtml(plainFindingTitle(item.code, item.title))}</strong><br/><span style="color:#57534e">${escapeHtml(explained.meaning)}</span>${third}${remediation}</li>`;
}

export function shouldPrepareSecurityEmail(analysis: SurfaceAnalysis): boolean {
  if (analysis.findings.some((item) => item.category === 'problem')) return true;
  const protections = analysis.findings.filter((item) => item.category === 'protection');
  return protections.length >= 2 || analysis.score <= 90;
}

export function buildSecurityEmail(input: {
  businessName: string;
  domain: string;
  analysis: SurfaceAnalysis;
}): { subject: string; html: string; text: string } {
  const subject = `Cose visibili sul sito di ${input.businessName}`;
  const grouped = findingsByCategory(input.analysis.findings);
  const sections: string[] = [];
  const htmlSections: string[] = [];

  if (grouped.problems.length) {
    sections.push('Da sistemare:', ...grouped.problems.flatMap(bulletForFinding), '');
    htmlSections.push(
      `<p><strong>Da sistemare</strong></p><ul style="padding-left:18px">${grouped.problems.map(htmlRowForFinding).join('')}</ul>`,
    );
  }
  if (grouped.protections.length) {
    sections.push('Protezione consigliata:', ...grouped.protections.flatMap(bulletForFinding), '');
    htmlSections.push(
      `<p><strong>Protezione consigliata</strong></p><ul style="padding-left:18px">${grouped.protections.map(htmlRowForFinding).join('')}</ul>`,
    );
  }
  if (!sections.length) {
    sections.push('• Da questa pagina pubblica non ho visto le cose che di solito segnaliamo.');
    htmlSections.push(
      '<ul style="padding-left:18px"><li>Da questa pagina pubblica non ho visto le cose che di solito segnaliamo.</li></ul>',
    );
  }

  const text = [
    `Buongiorno,`,
    ``,
    `ho aperto la pagina pubblica di ${input.domain} come farebbe un visitatore.`,
    `Non ho provato ingressi, moduli o percorsi nascosti: solo quello che la pagina mostra da sola.`,
    ``,
    ...sections,
    `Se vuoi, possiamo guardarli insieme. Un controllo più approfondito si può fare anche prima di questa mail, se mi dai il permesso al telefono o per iscritto.`,
    ``,
    `Un saluto`,
  ].join('\n');

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1917">
    <p>Buongiorno,</p>
    <p>ho aperto la pagina pubblica di <strong>${escapeHtml(input.domain)}</strong> come farebbe un visitatore. Non ho provato ingressi, moduli o percorsi nascosti: solo quello che la pagina mostra da sola.</p>
    ${htmlSections.join('\n')}
    <p>Se vuoi, possiamo guardarli insieme. Un controllo più approfondito si può fare anche prima di questa mail, se mi dai il permesso al telefono o per iscritto.</p>
    <p>Un saluto</p>
  </div>`.trim();

  return { subject, html, text };
}

export function buildScopeLetter(input: { businessName: string; domain: string }): string {
  return [
    `Lettera di incarico — controllo sul sito (modello)`,
    ``,
    `Attività: ${input.businessName}`,
    `Sito: ${input.domain}`,
    ``,
    `Il titolare autorizza un controllo più approfondito sul sito sopra indicato.`,
    `Il permesso può arrivare per lettera firmata, al telefono o di persona: va annotato chi ha detto sì e quando.`,
    `Dopo quel permesso, Attila può eseguire un secondo controllo automatico e non distruttivo sulle pagine pubbliche collegate dello stesso sito. Non è un attacco e il permesso non vale per altri sistemi.`,
    ``,
    `Cosa si può fare solo dopo la firma:`,
    `• leggere un numero limitato di pagine pubbliche collegate dello stesso sito;`,
    `• confrontare il secondo report con la prima analisi della homepage;`,
    `• annotare eventuali verifiche manuali concordate con il titolare;`,
    `• fermarsi subito se il titolare lo chiede.`,
    ``,
    `Cosa non si fa:`,
    `• tentativi di ingresso, password, payload, invio di moduli o scansioni aggressive;`,
    `• controlli su sistemi, account o sedi non scritti qui.`,
    ``,
    `Data: _______________`,
    `Nome e firma del titolare: _______________`,
  ].join('\n');
}
