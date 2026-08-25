import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { DEFAULT_PLAYBOOK, mergePlaybook, type CommercialPlaybook } from './playbook';

export async function getCurrentPlaybook(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<CommercialPlaybook> {
  const { data } = await admin
    .from('commercial_playbooks')
    .select('version, brand, offer, pricing, discount, qualification, call_policy, promise_policy, human_escalation, autonomy')
    .eq('workspace_id', workspaceId)
    .eq('is_current', true)
    .maybeSingle();
  if (!data) return DEFAULT_PLAYBOOK;
  return mergePlaybook({
    version: data.version,
    brand: data.brand,
    offer: data.offer,
    pricing: data.pricing,
    discount: data.discount,
    qualification: data.qualification,
    call: data.call_policy,
    promisePolicy: data.promise_policy,
    humanEscalation: data.human_escalation,
    autonomy: data.autonomy,
  });
}

export async function saveCurrentPlaybook(
  admin: AppSupabaseClient,
  workspaceId: string,
  playbook: CommercialPlaybook,
): Promise<CommercialPlaybook> {
  const merged = mergePlaybook(playbook);
  const now = new Date().toISOString();
  const { data: current } = await admin
    .from('commercial_playbooks')
    .select('id, version')
    .eq('workspace_id', workspaceId)
    .eq('is_current', true)
    .maybeSingle();

  const row = {
    workspace_id: workspaceId,
    version: (current?.version ?? 0) + 1,
    is_current: true,
    brand: merged.brand,
    offer: merged.offer,
    pricing: merged.pricing,
    discount: merged.discount,
    qualification: merged.qualification,
    call_policy: merged.call,
    promise_policy: merged.promisePolicy,
    human_escalation: merged.humanEscalation,
    autonomy: merged.autonomy,
    updated_at: now,
  };

  if (current?.id) {
    await admin.from('commercial_playbooks').update({ is_current: false }).eq('id', current.id);
  }
  const { error } = await admin.from('commercial_playbooks').insert(row);
  if (error) throw new Error(`Playbook: ${error.message}`);
  return { ...merged, version: row.version };
}
