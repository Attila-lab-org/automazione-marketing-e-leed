export type PreparationSnapshot = Record<string, unknown>;

/** Merge sicuro: non perde chiavi precedenti di campaign_leads.preparation. */
export function mergePreparation(
  current: unknown,
  patch: PreparationSnapshot,
): PreparationSnapshot {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as PreparationSnapshot)
      : {};
  return { ...base, ...patch, updatedAt: new Date().toISOString() };
}
