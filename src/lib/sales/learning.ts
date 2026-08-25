import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';

export type CommercialLearningSnapshot = {
  windowDays: number;
  generatedAt: string;
  metrics: {
    inboundClassified: number;
    pricingRequests: number;
    discountRequests: number;
    appointmentsBooked: number;
    humanHandoffs: number;
    proactiveFollowUps: number;
    ownerCtaClicks: number;
  };
  recommendations: string[];
};

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildCommercialLearningSnapshot(args: {
  events: Array<{ event_type: string; payload: unknown }>;
  ownerCtaClicks: number;
  windowDays: number;
  now?: Date;
}): CommercialLearningSnapshot {
  let inboundClassified = 0;
  let pricingRequests = 0;
  let discountRequests = 0;
  let appointmentsBooked = 0;
  let humanHandoffs = 0;
  let proactiveFollowUps = 0;

  for (const event of args.events) {
    const payload = payloadRecord(event.payload);
    if (event.event_type === 'INBOUND_CLASSIFIED') {
      inboundClassified += 1;
      if (payload.intent === 'quote_request') pricingRequests += 1;
      if (payload.intent === 'discount_request') discountRequests += 1;
      if (payload.mode === 'HUMAN_ONLY') humanHandoffs += 1;
    } else if (event.event_type === 'APPOINTMENT_BOOKED') {
      appointmentsBooked += 1;
    } else if (event.event_type === 'PROACTIVE_FOLLOW_UP_DUE') {
      proactiveFollowUps += 1;
    }
  }

  const recommendations: string[] = [];
  if (inboundClassified === 0) {
    recommendations.push('Verifica i canali inbound: nel periodo non risultano conversazioni classificate.');
  }
  if (inboundClassified >= 5 && appointmentsBooked / inboundClassified < 0.12) {
    recommendations.push('Il booking è basso rispetto alle conversazioni: proponi una call prima e usa slot reali.');
  }
  if (pricingRequests + discountRequests >= 3 && appointmentsBooked === 0) {
    recommendations.push('Le richieste prezzo non arrivano a una call: testa una proposta più chiara e una CTA unica.');
  }
  if (inboundClassified >= 5 && humanHandoffs / inboundClassified > 0.35) {
    recommendations.push('Troppi passaggi all’umano: amplia il playbook sulle obiezioni ricorrenti mantenendo i limiti.');
  }
  if (args.ownerCtaClicks > 0 && appointmentsBooked === 0) {
    recommendations.push('Ci sono click sulla proposta ma nessun appuntamento: ricontatta subito questi lead caldi.');
  }
  if (proactiveFollowUps > 0) {
    recommendations.push(`Gestisci ${proactiveFollowUps} ricontatti riaperti automaticamente da Attila.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Nessun blocco evidente: continua a misurare reply, prezzo e booking sullo stesso periodo.');
  }

  return {
    windowDays: args.windowDays,
    generatedAt: (args.now ?? new Date()).toISOString(),
    metrics: {
      inboundClassified,
      pricingRequests,
      discountRequests,
      appointmentsBooked,
      humanHandoffs,
      proactiveFollowUps,
      ownerCtaClicks: args.ownerCtaClicks,
    },
    recommendations,
  };
}

export async function getCommercialLearningSnapshot(
  admin: AppSupabaseClient,
  workspaceId: string,
  windowDays = 30,
  now = new Date(),
): Promise<CommercialLearningSnapshot> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: events }, cta] = await Promise.all([
    admin
      .from('sales_thread_events')
      .select('event_type, payload')
      .eq('workspace_id', workspaceId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000),
    admin
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'OWNER_CTA_CLICKED')
      .gte('occurred_at', since),
  ]);
  return buildCommercialLearningSnapshot({
    events: events ?? [],
    ownerCtaClicks: cta.count ?? 0,
    windowDays,
    now,
  });
}

export async function runCommercialLearningCycle(
  admin: AppSupabaseClient,
  workspaceId: string,
  now = new Date(),
): Promise<{ created: boolean; snapshot: CommercialLearningSnapshot }> {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: existing } = await admin
    .from('activity_log')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('event_type', 'AI_LEARNING_DIGEST')
    .gte('occurred_at', dayStart.toISOString())
    .limit(1)
    .maybeSingle();
  const snapshot = await getCommercialLearningSnapshot(admin, workspaceId, 30, now);
  if (existing) return { created: false, snapshot };

  await admin.from('activity_log').insert({
    workspace_id: workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'workspace',
    entity_id: workspaceId,
    category: 'BUSINESS',
    event_type: 'AI_LEARNING_DIGEST',
    message: `Attila ha analizzato gli ultimi 30 giorni: ${snapshot.recommendations[0]}`,
    data: snapshot as unknown as Json,
    occurred_at: now.toISOString(),
  });
  return { created: true, snapshot };
}
