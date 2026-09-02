import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export const DEMO_RETENTION_HOURS = 36;

export function demoExpiresAt(from: Date = new Date()): string {
  return new Date(from.getTime() + DEMO_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
}

export function isDemoExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

export async function purgeExpiredDemos(
  admin: AppSupabaseClient,
  now: Date = new Date(),
): Promise<{ found: number; deleted: number; failed: number }> {
  const cutoff = now.toISOString();
  const { data: sites, error } = await admin
    .from('demo_sites')
    .select('id')
    .lte('expires_at', cutoff)
    .limit(100);
  if (error) throw new Error(`Demo retention: lettura fallita — ${error.message}`);

  let deleted = 0;
  let failed = 0;
  for (const site of sites ?? []) {
    const { data: assets } = await admin
      .from('demo_assets')
      .select('storage_bucket, storage_path')
      .eq('demo_site_id', site.id);

    const byBucket = new Map<string, string[]>();
    for (const asset of assets ?? []) {
      const paths = byBucket.get(asset.storage_bucket) ?? [];
      paths.push(asset.storage_path);
      byBucket.set(asset.storage_bucket, paths);
    }
    for (const [bucket, paths] of byBucket) {
      await admin.storage.from(bucket).remove(paths).catch(() => undefined);
    }

    // Lo stato scaduto rende subito irraggiungibile la demo anche se la cancellazione fallisce.
    await admin
      .from('demo_sites')
      .update({ status: 'EXPIRED', disabled_at: cutoff })
      .eq('id', site.id);
    const { error: deleteError } = await admin.from('demo_sites').delete().eq('id', site.id);
    if (deleteError) failed += 1;
    else deleted += 1;
  }

  return { found: sites?.length ?? 0, deleted, failed };
}
