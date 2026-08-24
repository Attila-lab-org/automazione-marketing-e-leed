/**
 * Pure helpers for reveal-safe full-page QA (no browser dependency in unit tests).
 */

export function isQaRevealMode(search: string, datasetQaReveal?: string | null): boolean {
  if (datasetQaReveal === '1') return true;
  try {
    const q = search.startsWith('?') ? search.slice(1) : search;
    return new URLSearchParams(q).get('qa') === '1';
  } catch {
    return false;
  }
}

/** Progressive scroll offsets used by the QA screenshot runner. */
export function progressiveScrollOffsets(pageHeight: number, viewportHeight: number): number[] {
  if (pageHeight <= viewportHeight) return [0];
  const step = Math.max(Math.floor(viewportHeight * 0.75), 200);
  const offsets: number[] = [];
  for (let y = 0; y < pageHeight; y += step) {
    offsets.push(y);
  }
  const last = Math.max(0, pageHeight - viewportHeight);
  if (offsets[offsets.length - 1] !== last) offsets.push(last);
  return offsets;
}
