import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_WORKSPACE_SLUG } from '@/lib/workspace';

const OUTREACH_FLAG = 'OUTREACH_PAUSED_ALL';

export async function getOutreachPausedAll(
  admin: SupabaseClient,
  workspaceId?: string,
): Promise<boolean> {
  let wsId = workspaceId;
  if (!wsId) {
    const { data: ws } = await admin
      .from('workspaces')
      .select('id')
      .eq('slug', DEFAULT_WORKSPACE_SLUG)
      .maybeSingle();
    wsId = ws?.id;
  }
  if (!wsId) return true;

  const { data, error } = await admin
    .from('workspace_feature_flags')
    .select('value')
    .eq('workspace_id', wsId)
    .eq('key', OUTREACH_FLAG)
    .maybeSingle();

  if (error) {
    console.error('getOutreachPausedAll', error.message);
    return true;
  }

  const value = data?.value as { enabled?: boolean } | null;
  return Boolean(value?.enabled);
}

export async function setOutreachPausedAll(
  admin: SupabaseClient,
  workspaceId: string,
  paused: boolean,
  reason = 'manual toggle',
): Promise<void> {
  const value = { enabled: paused, reason, updatedAt: new Date().toISOString() };
  const { error } = await admin.from('workspace_feature_flags').upsert(
    {
      workspace_id: workspaceId,
      key: OUTREACH_FLAG,
      value,
    },
    { onConflict: 'workspace_id,key' },
  );
  if (error) throw new Error(`Kill switch: persistenza fallita — ${error.message}`);

  await admin.from('activity_log').insert({
    workspace_id: workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'workspace',
    entity_id: workspaceId,
    category: 'DECISION',
    event_type: paused ? 'KILL_SWITCH_ACTIVATED' : 'KILL_SWITCH_DEACTIVATED',
    message: paused ? 'Outreach globale in pausa' : 'Outreach globale riattivato',
    data: value,
  });
}
