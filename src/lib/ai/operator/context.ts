import type { DemoPersonalization } from '@/lib/ai/commercial/schemas';
import { demoPersonalizationSchema } from '@/lib/ai/commercial/schemas';
import { UUID_RE, type OperatorEnvelope } from './envelope';
import type { OperatorIntent } from './intent';
import type { OperatorToolName } from './registry';
import type { WriteResult } from './writes';

export type OperatorEntityRefs = {
  lastCampaignId: string | null;
  lastLeadIds: string[];
  lastLeadId: string | null;
  lastDemoId: string | null;
  lastTemplateId: string | null;
  lastThreadId: string | null;
  lastReviewContext: boolean;
  lastOperation: string | null;
  lastDemoProposal: DemoPersonalization | null;
};

export function emptyEntityRefs(): OperatorEntityRefs {
  return {
    lastCampaignId: null,
    lastLeadIds: [],
    lastLeadId: null,
    lastDemoId: null,
    lastTemplateId: null,
    lastThreadId: null,
    lastReviewContext: false,
    lastOperation: null,
    lastDemoProposal: null,
  };
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
    lastLeadId:
      typeof nested.lastLeadId === 'string' && UUID_RE.test(nested.lastLeadId)
        ? nested.lastLeadId
        : lastLeadIds[0] ?? null,
    lastDemoId:
      typeof nested.lastDemoId === 'string' && UUID_RE.test(nested.lastDemoId) ? nested.lastDemoId : null,
    lastTemplateId:
      typeof nested.lastTemplateId === 'string' && UUID_RE.test(nested.lastTemplateId)
        ? nested.lastTemplateId
        : null,
    lastThreadId:
      typeof nested.lastThreadId === 'string' && UUID_RE.test(nested.lastThreadId)
        ? nested.lastThreadId
        : null,
    lastReviewContext: nested.lastReviewContext === true,
    lastOperation: typeof nested.lastOperation === 'string' ? nested.lastOperation.slice(0, 80) : null,
    lastDemoProposal: parseDemoProposal(nested.lastDemoProposal),
  };
}

function parseDemoProposal(raw: unknown): DemoPersonalization | null {
  const parsed = demoPersonalizationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function needsCampaignReferent(question: string, intent: OperatorIntent): boolean {
  if (intent.kind === 'DESTRUCTIVE' || intent.kind === 'EXTERNAL') return true;
  if (intent.kind === 'PREPARE' && (intent.writeVerb === 'pause' || intent.writeVerb === 'resume')) {
    return true;
  }
  const q = question.toLowerCase();
  return /cancellala|eliminala|aprila|ferma questa|ferma quella|mandala|questa campagna|quella campagna|i bloccati|bloccati\?|apri(?:la)?(?:\s+questa)?/.test(
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

export function resolveOrdinalSelection(
  ordinal: number | null,
  refs: OperatorEntityRefs,
): OperatorEntityRefs {
  if (!ordinal || ordinal < 1) return refs;
  const leadId = refs.lastLeadIds[ordinal - 1] ?? null;
  if (!leadId) return refs;
  return { ...refs, lastLeadId: leadId };
}

export function mergeEntityRefs(
  prev: OperatorEntityRefs,
  traces: Array<{ name: OperatorToolName; result: unknown }>,
  writes: WriteResult[],
): OperatorEntityRefs {
  const next: OperatorEntityRefs = {
    lastCampaignId: prev.lastCampaignId,
    lastLeadIds: [...prev.lastLeadIds],
    lastLeadId: prev.lastLeadId,
    lastDemoId: prev.lastDemoId,
    lastTemplateId: prev.lastTemplateId,
    lastThreadId: prev.lastThreadId,
    lastReviewContext: prev.lastReviewContext,
    lastOperation: prev.lastOperation,
    lastDemoProposal: prev.lastDemoProposal,
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
  const demoWrite = writes.find(
    (w) =>
      (w.tool === 'personalize_demo' || w.tool === 'apply_demo_personalization') &&
      typeof w.data.demoId === 'string' &&
      UUID_RE.test(w.data.demoId),
  );
  if (demoWrite && typeof demoWrite.data.demoId === 'string') next.lastDemoId = demoWrite.data.demoId;
  if (demoWrite?.ok) {
    const proposal = parseDemoProposal(demoWrite.data.proposal);
    if (proposal) next.lastDemoProposal = proposal;
  }
  if (writes[0]?.tool) next.lastOperation = writes[0].tool;

  for (const trace of traces) {
    if (trace.name === 'search_leads' && Array.isArray(trace.result)) {
      const ids = (trace.result as Array<{ id?: string }>)
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id));
      if (ids.length) {
        next.lastLeadIds = ids.slice(0, 20);
        next.lastLeadId = ids[0] ?? next.lastLeadId;
      }
    }
    if (trace.name === 'get_lead_detail' && trace.result && typeof trace.result === 'object') {
      const id = (trace.result as { id?: unknown }).id;
      if (typeof id === 'string' && UUID_RE.test(id)) next.lastLeadId = id;
    }
    if (trace.name === 'list_review_items') next.lastReviewContext = true;
    if (trace.name === 'get_campaign_detail' && trace.result && typeof trace.result === 'object') {
      const id = (trace.result as { id?: unknown }).id;
      if (typeof id === 'string' && UUID_RE.test(id)) next.lastCampaignId = id;
    }
    if (trace.name === 'inspect_demo' && trace.result && typeof trace.result === 'object') {
      const row = trace.result as { id?: unknown; leadId?: unknown };
      if (typeof row.id === 'string' && UUID_RE.test(row.id)) next.lastDemoId = row.id;
      if (typeof row.leadId === 'string' && UUID_RE.test(row.leadId)) next.lastLeadId = row.leadId;
    }
    if (trace.name === 'list_demos' && Array.isArray(trace.result) && trace.result[0]) {
      const id = (trace.result[0] as { id?: unknown }).id;
      if (typeof id === 'string' && UUID_RE.test(id)) next.lastDemoId = next.lastDemoId ?? id;
    }
    if (trace.name === 'inspect_template' && trace.result && typeof trace.result === 'object') {
      const id = (trace.result as { id?: unknown }).id;
      if (typeof id === 'string' && UUID_RE.test(id)) next.lastTemplateId = id;
    }
    if (trace.name === 'get_conversation' && trace.result && typeof trace.result === 'object') {
      const id = (trace.result as { threadId?: unknown }).threadId;
      if (typeof id === 'string' && UUID_RE.test(id)) next.lastThreadId = id;
    }
  }

  return next;
}
