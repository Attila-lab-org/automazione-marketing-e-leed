/**
 * Send Guard — MASTER_SPEC §11.2.
 *
 * Unico gate di emissione, eseguito server-side PRIMA di ogni send (incluso
 * FULL_AUTO). Tutti e 7 i check devono passare; l'esito è strutturale con
 * motivazioni, pronto per essere persistito nel Decision Trace (§19.1).
 *
 * Il Send Guard è una funzione pura sul contesto fornito: la raccolta dei dati
 * (suppression list, stato campagna, bozze, invii precedenti) è compito del
 * chiamante (Domain Service server-side).
 */

import type {
  BusinessStatus,
  CampaignStatus,
  DraftStatus,
  PolicyEvaluation,
  SendGuardCheck,
  SendGuardCheckName,
  SendGuardResult,
} from './types/domain';

export interface SendGuardContext {
  recipient: {
    email: string | null;
    emailValid: boolean;
    /** presente in suppression_list (hard bounce / unsubscribe / stop §12.2, §18). */
    suppressed: boolean;
  };
  lead: {
    businessStatus: BusinessStatus;
    /** reply ricevuta che blocca il flusso (§11.2 "nessuna reply che blocchi"). */
    hasBlockingReply: boolean;
  };
  campaign: {
    status: CampaignStatus;
    /** rate limit campaign/workspace disponibile (§11.2, §18). */
    rateLimitAvailable: boolean;
    /** Kill switch globale §19.2: OUTREACH_PAUSED_ALL. */
    outreachPausedAll: boolean;
  };
  policy: {
    /** Esito del Policy Engine con policy snapshot valida (§11.2 check Policy). */
    evaluation: PolicyEvaluation | null;
    /** Approvazione umana registrata (richiesta se decision ≠ AUTO). */
    humanApproved: boolean;
  };
  message: {
    subject: string;
    body: string;
    status: DraftStatus;
  };
  demo: {
    /** demo richiesta dal template/campagna. */
    required: boolean;
    demoReady: boolean;
    screenshotReady: boolean;
  };
  idempotency: {
    /** esiste già un send per campaign_lead + sequence_step (§11.2). */
    alreadySent: boolean;
  };
}

/** Business status compatibili con un send (primo contatto o follow-up). */
export const SENDABLE_BUSINESS_STATUSES: readonly BusinessStatus[] = [
  'CAMPAIGN_READY',
  'CONTACTED',
];

const CHECK_ORDER: readonly SendGuardCheckName[] = [
  'recipient',
  'lead',
  'campaign',
  'policy',
  'message',
  'demo',
  'idempotency',
];

function checkRecipient(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  if (!ctx.recipient.email) reasons.push('email destinatario assente');
  if (ctx.recipient.email && !ctx.recipient.emailValid) reasons.push('email destinatario non valida');
  if (ctx.recipient.suppressed) {
    reasons.push('destinatario in suppression_list (hard bounce / unsubscribe / stop request §12.2)');
  }
  return { name: 'recipient', passed: reasons.length === 0, reasons };
}

function checkLead(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  if (!SENDABLE_BUSINESS_STATUSES.includes(ctx.lead.businessStatus)) {
    reasons.push(`business_status ${ctx.lead.businessStatus} non compatibile con il send`);
  }
  if (ctx.lead.hasBlockingReply) {
    reasons.push('reply ricevuta: il flusso automatico è bloccato (§11.2, §12.2)');
  }
  return { name: 'lead', passed: reasons.length === 0, reasons };
}

function checkCampaign(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  if (ctx.campaign.outreachPausedAll) {
    reasons.push('kill switch PAUSE ALL OUTREACH attivo (§19.2)');
  }
  if (ctx.campaign.status !== 'ACTIVE') {
    reasons.push(`campaign ${ctx.campaign.status}: richiesta ACTIVE`);
  }
  if (!ctx.campaign.rateLimitAvailable) {
    reasons.push('rate limit campaign/workspace esaurito (§18)');
  }
  return { name: 'campaign', passed: reasons.length === 0, reasons };
}

function checkPolicy(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  const evaluation = ctx.policy.evaluation;
  if (!evaluation) {
    reasons.push('policy snapshot mancante: valutazione impossibile (§4.1)');
  } else if (evaluation.action !== 'send') {
    reasons.push(`valutazione policy per azione "${evaluation.action}" invece di "send"`);
  } else if (evaluation.decision === 'AUTO') {
    if (evaluation.autoApproved) {
      reasons.push('policy: auto-send autorizzato dal Policy Engine (§5.2)');
    } else {
      reasons.push('policy: decisione AUTO incoerente (autoApproved=false)');
    }
  } else if (evaluation.decision === 'REVIEW' || evaluation.decision === 'MANUAL') {
    if (ctx.policy.humanApproved) {
      reasons.push(`policy: gate ${evaluation.decision} superato con approvazione umana`);
    } else {
      reasons.push(`policy: gate ${evaluation.decision} richiede approvazione umana (Review Queue §8.2)`);
    }
  } else {
    reasons.push('policy: decisione BLOCKED dal Policy Engine');
  }
  const passed =
    evaluation !== null &&
    evaluation.action === 'send' &&
    ((evaluation.decision === 'AUTO' && evaluation.autoApproved) ||
      ((evaluation.decision === 'REVIEW' || evaluation.decision === 'MANUAL') && ctx.policy.humanApproved));
  return { name: 'policy', passed, reasons };
}

function checkMessage(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  if (!ctx.message.subject.trim()) reasons.push('subject vuoto');
  if (!ctx.message.body.trim()) reasons.push('body vuoto');
  const readyStatuses: readonly DraftStatus[] = ['READY', 'APPROVED'];
  if (!readyStatuses.includes(ctx.message.status)) {
    reasons.push(`draft status ${ctx.message.status}: richiesta READY o APPROVED`);
  }
  return { name: 'message', passed: reasons.length === 0, reasons };
}

function checkDemo(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  if (ctx.demo.required) {
    if (!ctx.demo.demoReady) reasons.push('demo richiesta ma non READY (§10.1)');
    if (!ctx.demo.screenshotReady) {
      reasons.push('screenshot richiesto ma non READY: nessun invio dipendente può partire (§10.1)');
    }
  }
  return { name: 'demo', passed: reasons.length === 0, reasons };
}

function checkIdempotency(ctx: SendGuardContext): SendGuardCheck {
  const reasons: string[] = [];
  if (ctx.idempotency.alreadySent) {
    reasons.push('send duplicato per campaign_lead + sequence_step (§11.2 Idempotency)');
  }
  return { name: 'idempotency', passed: reasons.length === 0, reasons };
}

const CHECK_FNS: Record<SendGuardCheckName, (ctx: SendGuardContext) => SendGuardCheck> = {
  recipient: checkRecipient,
  lead: checkLead,
  campaign: checkCampaign,
  policy: checkPolicy,
  message: checkMessage,
  demo: checkDemo,
  idempotency: checkIdempotency,
};

/**
 * Esegue tutti e 7 i check §11.2 nell'ordine canonico. allowed = true solo se
 * TUTTI passano. I check falliti contribuiscono a `blockers` per audit/UI.
 */
export function runSendGuard(ctx: SendGuardContext, now: Date = new Date()): SendGuardResult {
  const checks = CHECK_ORDER.map((name) => CHECK_FNS[name](ctx));
  const blockers = checks.filter((c) => !c.passed).flatMap((c) => c.reasons.map((r) => `[${c.name}] ${r}`));
  return {
    allowed: checks.every((c) => c.passed),
    checks,
    blockers,
    evaluatedAt: now.toISOString(),
  };
}
