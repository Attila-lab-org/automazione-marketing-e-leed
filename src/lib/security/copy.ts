import { explainFinding } from './explain';
import type { SurfaceAnalysis, SurfaceFinding } from './surface-audit';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function findingsToPlainList(findings: SurfaceFinding[]): string[] {
  return findings.map((item) => `${item.title}: ${item.detail}`);
}

export function buildSecurityEmail(input: {
  businessName: string;
  domain: string;
  analysis: SurfaceAnalysis;
}): { subject: string; html: string; text: string } {
  const subject = `Cose visibili sul sito di ${input.businessName}`;
  const bullets = input.analysis.findings.length
    ? input.analysis.findings.flatMap((item) => {
        const explained = explainFinding(item.code);
        return [
          `• ${item.title}`,
          `  In pratica: ${explained.meaning}`,
          `  Esempio: ${explained.example}`,
        ];
      })
    : ['• Da questa pagina pubblica non ho visto le cose che di solito segnaliamo.'];

  const text = [
    `Buongiorno,`,
    ``,
    `ho aperto la pagina pubblica di ${input.domain} come farebbe un visitatore.`,
    `Non ho provato ingressi, moduli o percorsi nascosti: solo quello che la pagina mostra da sola.`,
    ``,
    `Da quella pagina si vede:`,
    ...bullets,
    ``,
    `Se vuoi, possiamo guardarli insieme. Un controllo più approfondito si può fare anche prima di questa mail, se mi dai il permesso al telefono o per iscritto.`,
    ``,
    `Un saluto`,
  ].join('\n');

  const rows = input.analysis.findings.length
    ? input.analysis.findings
        .map((item) => {
          const explained = explainFinding(item.code);
          return `<li style="margin:0 0 12px"><strong>${escapeHtml(item.title)}</strong><br/><span style="color:#57534e">${escapeHtml(explained.meaning)}</span><br/><span style="color:#78716c">Esempio: ${escapeHtml(explained.example)}</span></li>`;
        })
        .join('')
    : '<li>Da questa pagina pubblica non ho visto le cose che di solito segnaliamo.</li>';

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1917">
    <p>Buongiorno,</p>
    <p>ho aperto la pagina pubblica di <strong>${escapeHtml(input.domain)}</strong> come farebbe un visitatore. Non ho provato ingressi, moduli o percorsi nascosti: solo quello che la pagina mostra da sola.</p>
    <p>Da quella pagina si vede:</p>
    <ul style="padding-left:18px">${rows}</ul>
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
    `Il controllo lo fa una persona, dopo quel permesso. Non è un attacco automatico e non vale come permesso generico su altri sistemi.`,
    ``,
    `Cosa si può fare solo dopo la firma:`,
    `• approfondire con il titolare presente o informato;`,
    `• usare solo gli accessi e gli ambienti che il titolare indica;`,
    `• fermarsi subito se il titolare lo chiede.`,
    ``,
    `Cosa non si fa:`,
    `• tentativi di ingresso, payload, scansioni aggressive;`,
    `• controlli su sistemi, account o sedi non scritti qui.`,
    ``,
    `Data: _______________`,
    `Nome e firma del titolare: _______________`,
  ].join('\n');
}
