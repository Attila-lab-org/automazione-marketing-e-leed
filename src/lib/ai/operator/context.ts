import { UUID_RE, type OperatorEnvelope } from './envelope';
import type { OperatorIntent } from './intent';
import type { OperatorToolName } from './registry';
import type { WriteResult } from './writes';

export type OperatorEntityRefs = {
  lastCampaignId: string | null;
  lastLeadIds: string[];
  lastReviewContext: boolean;
};

export function emptyEntityRefs(): OperatorEntityRefs {
  return { lastCampaignId: null, lastLeadIds: [], lastReviewContext: false };
}

export function parseEntityRefs(raw: unknown): OperatorEntityRefs {
  if (!raw || typeof raw !== 'object') return emptyEntityRefs();
  const row = raw as Record<string, unknown>;
  const nested = row.refs && typeof row.refs === 'object' ? (row.refs as Record<string, unknown>) : row;
  const lastCampaignId =
    typeof nested.lastCampaignId === 'string' && UUID_RE.test(nested.lastCampaignId)
      ? nested.lastCampaignId
      : null;
  const lastLeadIds = Array.isArray(nested.lastLeadIds)
    ? nested.lastLeadIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)).slice(0, 20)
    : [];
  return {
    lastCampaignId,
    lastLeadIds,
    lastReviewContext: nested.lastReviewContext === true,
  };
}

export function needsCampaignReferent(question: string, intent: OperatorIntent): boolean {
  if (intent.kind === 'DESTRUCTIVE' || intent.kind === 'EXTERNAL') return true;
  if (intent.kind === 'PREPARE' && (intent.writeVerb === 'pause' || intent.writeVerb === 'resume')) {
    return true;
  }
  const q = question.toLowerCase();
  return /cancellala|eliminala|aprila|ferma questa|questa campagna|quella campagna|i bloccati|bloccati\?|apri(?:la)?(?:\s+questa)?/.test(
    q,
  );
}

export function resolveOperatorEnvelope(
  question: string,
  envelope: OperatorEnvelope,
  refs: OperatorEntityRefs,
  intent: OperatorIntent,
): OperatorEnvelope {
  if (envelope.entityType === 'campaign' && envelope.entityId) return envelope;
  if (!refs.lastCampaignId) return envelope;
  if (!needsCampaignReferent(question, intent)) return envelope;
  return {
    ...envelope,
    entityType: 'campaign',
    entityId: refs.lastCampaignId,
  };
}

export function mergeEntityRefs(
  prev: OperatorEntityRefs,
  traces: Array<{ name: OperatorToolName; result: unknown }>,
  writes: WriteResult[],
): OperatorEntityRefs {
  const next: OperatorEntityRefs = {
    lastCampaignId: prev.lastCampaignId,
    lastLeadIds: [...prev.lastLeadIds],
    lastReviewContext: prev.lastReviewContext,
  };

  const writeCampaign = writes.find(
    (w) =>
      (w.tool === 'create_campaign' ||
        w.tool === 'prepare_campaign' ||
        w.tool === 'pause_campaign' ||
        w.tool === 'resume_campaign' ||
        w.tool === 'send_campaign' ||
        w.tool === 'campaign_mutation') &&
      w.ok &&
      typeof w.data.campaignId === 'string' &&
      UUID_RE.test(w.data.campaignId),
  );
  if (writeCampaign && typeof writeCampaign.data.campaignId === 'string') {
    next.lastCampaignId = writeCampaign.data.campaignId;
  }
  if (writes.some((w) => w.tool === 'prepare_campaign' || w.tool === 'create_campaign')) {
    next.lastReviewContext = true;
  }

  for (const trace of traces) {
    if (trace.name === 'search_leads' && Array.isArray(trace.result)) {
      const ids = (trace.result as Array<{ id?: string }>)
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id));
      if (ids.length) next.lastLeadIds = ids.slice(0, 20);
    }
    if (trace.name === 'list_review_items') next.lastReviewContext = true;
    if (trace.name === 'get_campaign_detail' && trace.result && typeof trace.result === 'object') {
      const id = (trace.result as { id?: unknown }).id;
      if (typeof id === 'string' && UUID_RE.test(id)) next.lastCampaignId = id;
    }
  }

  return next;
}
