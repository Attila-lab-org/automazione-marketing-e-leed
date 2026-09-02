/** «guarda il report dello studio mazzei» → studio mazzei */
export function extractNamedSecurityQuery(question: string): string | null {
  const cleaned = question.replace(/[?!.,;:]+$/g, '').trim();
  const named = cleaned.match(
    /(?:report|controllo|check-?up|checkup|sicurezza|analisi)\s+(?:dello|della|del|di|sul|sulla|per)\s+(.+)/i,
  );
  if (named?.[1]) {
    const value = named[1].replace(/^(il|lo|la|i|gli|le)\s+/i, '').trim();
    if (/^(ieri|oggi|settimana|mese|numeri|periodo)\b/i.test(value)) return null;
    return value;
  }
  return null;
}

export function isSecurityReportQuestion(question: string): boolean {
  const q = question.toLocaleLowerCase('it-IT');
  if (/sicurezz|check-?up|checkup|cose viste|lucchetto/.test(q)) return true;
  if (extractNamedSecurityQuery(q)) return true;
  return /report|controllo/.test(q) && /sito|studio|attivita|attivita'/.test(q) && !/ieri|oggi|numeri|briefing/.test(q);
}
