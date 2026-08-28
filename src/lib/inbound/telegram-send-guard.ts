import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { TelegramInboundSettings } from '@/lib/inbound/telegram-settings';
import { resolveTelegramOperationalMode } from '@/lib/inbound/telegram-settings';

export type TelegramSendGuardReason =
  | 'TELEGRAM_STOPPED'
  | 'MANUAL_MODE'
  | 'HUMAN_TAKEOVER'
  | 'RATE_LIMIT'
  | 'DUPLICATE_OUTBOUND'
  | 'LOW_CONFIDENCE'
  | 'CRITICAL_HANDOFF'
  | 'NO_DRAFT'
  | 'OK';

export type TelegramSendGuardResult = {
  allowed: boolean;
  reason: TelegramSendGuardReason;
  message: string;
};

const RATE_WINDOW_MS = 90_000;
const RATE_MAX_OUTBOUND = 2;

export async function evaluateTelegramSendGuard(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  threadId: string;
  settings: TelegramInboundSettings;
  draft: string | null;
  salesMode: string | null;
  salesHumanRequired: boolean;
  classificationConfidence?: number | null;
  /** Invio forzato dall’operatore (resume / reply_telegram). */
  operatorOverride?: boolean;
}): Promise<TelegramSendGuardResult> {
  const mode = resolveTelegramOperationalMode(args.settings);
  if (mode === 'stopped' && !args.operatorOverride) {
    return {
      allowed: false,
      reason: 'TELEGRAM_STOPPED',
      message: 'Telegram è fermo: nessun invio automatico.',
    };
  }
  if (mode === 'manual' && !args.operatorOverride) {
    return {
      allowed: false,
      reason: 'MANUAL_MODE',
      message: 'Gestione manuale: Attila prepara la bozza, non invia da solo.',
    };
  }

  const { data: thread } = await args.admin
    .from('message_threads')
    .select('assigned_mode, human_required_reason, status')
    .eq('id', args.threadId)
    .maybeSingle();

  if (thread?.assigned_mode === 'HUMAN' || args.salesHumanRequired) {
    return {
      allowed: false,
      reason: 'HUMAN_TAKEOVER',
      message: 'Conversazione in carico a te: nessun invio automatico.',
    };
  }

  if (
    args.salesMode === 'HUMAN_ONLY' ||
    args.salesMode === 'APPROVAL_REQUIRED' ||
    args.salesMode === 'DRAFT_ONLY'
  ) {
    return {
      allowed: false,
      reason: 'CRITICAL_HANDOFF',
      message: `Invio bloccato dalla policy (${args.salesMode}).`,
    };
  }

  if (
    typeof args.classificationConfidence === 'number' &&
    args.classificationConfidence < 0.45 &&
    !args.operatorOverride
  ) {
    return {
      allowed: false,
      reason: 'LOW_CONFIDENCE',
      message: 'Sicurezza bassa: bozza bloccata per controllo umano.',
    };
  }

  if (!args.draft?.trim()) {
    return {
      allowed: false,
      reason: 'NO_DRAFT',
      message: 'Nessuna bozza da inviare.',
    };
  }

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await args.admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', args.workspaceId)
    .eq('thread_id', args.threadId)
    .eq('provider', 'telegram')
    .eq('direction', 'OUTBOUND')
    .gte('created_at', since);
  if ((count ?? 0) >= RATE_MAX_OUTBOUND && !args.operatorOverride) {
    return {
      allowed: false,
      reason: 'RATE_LIMIT',
      message: 'Troppe risposte recenti: attendo prima di reinviare.',
    };
  }

  const { data: lastOutbound } = await args.admin
    .from('messages')
    .select('body_snapshot')
    .eq('workspace_id', args.workspaceId)
    .eq('thread_id', args.threadId)
    .eq('provider', 'telegram')
    .eq('direction', 'OUTBOUND')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    lastOutbound?.body_snapshot &&
    normalizeForDup(lastOutbound.body_snapshot) === normalizeForDup(args.draft)
  ) {
    return {
      allowed: false,
      reason: 'DUPLICATE_OUTBOUND',
      message: 'Messaggio duplicato rispetto all’ultimo inviato: bloccato.',
    };
  }

  return {
    allowed: true,
    reason: 'OK',
    message: 'Controlli superati: invio consentito.',
  };
}

function normalizeForDup(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function telegramModeLabel(mode: ReturnType<typeof resolveTelegramOperationalMode>): string {
  switch (mode) {
    case 'stopped':
      return 'Fermo';
    case 'auto_guarded':
      return 'Automatico protetto';
    case 'manual':
      return 'Gestione manuale';
  }
}
