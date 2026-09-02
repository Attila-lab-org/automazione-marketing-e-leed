import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { SecurityConsentChannel, SecurityTargetRow } from '@/lib/types/database';

export const CONSENT_CHANNELS: SecurityConsentChannel[] = ['phone', 'letter', 'in_person'];

export function isConsentChannel(value: unknown): value is SecurityConsentChannel {
  return value === 'phone' || value === 'letter' || value === 'in_person';
}

export function consentChannelLabel(channel: SecurityConsentChannel | null): string {
  if (channel === 'phone') return 'Al telefono';
  if (channel === 'letter') return 'Lettera firmata';
  if (channel === 'in_person') return 'Di persona';
  return 'Non annotato';
}

export async function openDeepCheck(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    targetId: string;
    channel: SecurityConsentChannel;
    note?: string | null;
  },
): Promise<SecurityTargetRow> {
  const { data: target, error: readError } = await admin
    .from('security_targets')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.targetId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!target) throw new Error('Contatto non trovato.');

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from('security_targets')
    .update({
      status: 'deep_open',
      consent_channel: input.channel,
      consent_note: input.note?.trim() || null,
      consent_at: now,
      updated_at: now,
    })
    .eq('id', input.targetId)
    .eq('workspace_id', input.workspaceId)
    .select('*')
    .single();
  if (error || !updated) {
    throw new Error(error?.message ?? 'Non ho potuto aprire il controllo approfondito.');
  }
  return updated;
}

export async function saveDeepCheck(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    targetId: string;
    notes?: string | null;
    done?: boolean;
  },
): Promise<SecurityTargetRow> {
  const now = new Date().toISOString();
  const patch = input.done
    ? {
        deep_notes: input.notes ?? null,
        updated_at: now,
        status: 'deep_done' as const,
      }
    : {
        deep_notes: input.notes ?? null,
        updated_at: now,
      };

  const { data: updated, error } = await admin
    .from('security_targets')
    .update(patch)
    .eq('id', input.targetId)
    .eq('workspace_id', input.workspaceId)
    .select('*')
    .single();
  if (error || !updated) {
    throw new Error(error?.message ?? 'Salvataggio non riuscito.');
  }
  return updated;
}
