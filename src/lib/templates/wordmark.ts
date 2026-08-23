/**
 * Fallback logo: wordmark dal nome attività. Nessun logo ufficiale inventato.
 */
export function wordmarkFromName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return 'ATTIVITÀ';
  return trimmed.toLocaleUpperCase('it-IT');
}
