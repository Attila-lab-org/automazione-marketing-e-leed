import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { europeRomeDayRange, europeRomeLocalToIso, europeRomeYmd, formatEuropeRome } from '@/lib/ai/operator/time';

export type BriefingChannel = 'EMAIL' | 'TELEGRAM';

export type ChannelPerformance = {
  outboundThreads: number;
  repliedThreads: number;
  replyRate: number;
  appointmentsBooked: number;
};

export type DailyCommercialBriefing = {
  generatedAt: string;
  today: {
    appointments: number;
    nextAppointment: string | null;
    hotThreads: number;
    followUpsDue: number;
  };
  channels: Record<BriefingChannel, ChannelPerformance>;
  recommendation: {
    channel: BriefingChannel | 'BALANCED';
    market: string | null;
    city: string | null;
    readyLeads: number;
    reason: string;
  };
  actions: string[];
  summary: string;
};

type BriefingInput = {
  now: Date;
  messages: Array<{
    thread_id: string;
    provider: string | null;
    direction: string;
  }>;
  bookedThreadIds: string[];
  threadChannels: Record<string, string>;
  appointments: Array<{ starts_at: string | null; title: string }>;
  hotThreads: number;
  followUpsDue: number;
  readyLeads: Array<{ country: string | null; city: string | null }>;
};

function channelForProvider(provider: string | null): BriefingChannel | null {
  const value = provider?.toLowerCase() ?? '';
  if (value.includes('telegram')) return 'TELEGRAM';
  if (value.includes('resend') || value.includes('email')) return 'EMAIL';
  return null;
}

function performance(
  channel: BriefingChannel,
  messages: BriefingInput['messages'],
  bookedThreadIds: string[],
  threadChannels: Record<string, string>,
): ChannelPerformance {
  const outbound = new Set<string>();
  const inbound = new Set<string>();
  for (const message of messages) {
    if (channelForProvider(message.provider) !== channel) continue;
    if (message.direction === 'OUTBOUND') outbound.add(message.thread_id);
    if (message.direction === 'INBOUND') inbound.add(message.thread_id);
  }
  const repliedThreads = [...outbound].filter((threadId) => inbound.has(threadId)).length;
  const appointmentsBooked = bookedThreadIds.filter(
    (threadId) => threadChannels[threadId] === channel,
  ).length;
  return {
    outboundThreads: outbound.size,
    repliedThreads,
    replyRate: outbound.size ? Number((repliedThreads / outbound.size).toFixed(3)) : 0,
    appointmentsBooked,
  };
}

function bestMarket(leads: BriefingInput['readyLeads']): {
  market: string | null;
  city: string | null;
  readyLeads: number;
} {
  const countries = new Map<string, number>();
  for (const lead of leads) {
    const country = lead.country?.trim();
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);
  }
  const market = [...countries.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const cityCandidates = market
    ? leads.filter((lead) => lead.country?.trim() === market[0])
    : leads;
  const cities = new Map<string, number>();
  for (const lead of cityCandidates) {
    if (lead.city?.trim()) cities.set(lead.city.trim(), (cities.get(lead.city.trim()) ?? 0) + 1);
  }
  const city = [...cities.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    market: market?.[0] ?? null,
    city: city?.[0] ?? null,
    readyLeads: market?.[1] ?? leads.length,
  };
}

function channelScore(value: ChannelPerformance): number {
  if (value.outboundThreads === 0) return 0;
  const bookingRate = value.appointmentsBooked / value.outboundThreads;
  return value.replyRate * 0.7 + Math.min(1, bookingRate) * 0.3;
}

export function buildDailyCommercialBriefing(input: BriefingInput): DailyCommercialBriefing {
  const email = performance('EMAIL', input.messages, input.bookedThreadIds, input.threadChannels);
  const telegram = performance(
    'TELEGRAM',
    input.messages,
    input.bookedThreadIds,
    input.threadChannels,
  );
  const emailScore = channelScore(email);
  const telegramScore = channelScore(telegram);
  const enoughEmail = email.outboundThreads >= 3;
  const enoughTelegram = telegram.outboundThreads >= 3;
  let channel: BriefingChannel | 'BALANCED' = 'BALANCED';
  let reason = 'Non ci sono ancora abbastanza dati: usa entrambi i canali e misura le risposte.';
  if (enoughEmail || enoughTelegram) {
    if (emailScore > telegramScore + 0.05) {
      channel = 'EMAIL';
      reason = `Email sta rendendo meglio: ${Math.round(email.replyRate * 100)}% di conversazioni con risposta contro ${Math.round(telegram.replyRate * 100)}% su Telegram.`;
    } else if (telegramScore > emailScore + 0.05) {
      channel = 'TELEGRAM';
      reason = `Telegram sta rendendo meglio: ${Math.round(telegram.replyRate * 100)}% di conversazioni con risposta contro ${Math.round(email.replyRate * 100)}% via email.`;
    } else {
      reason = 'Email e Telegram hanno risultati simili: usa email per il primo contatto e Telegram per le conversazioni attive.';
    }
  }

  const market = bestMarket(input.readyLeads);
  const sortedAppointments = input.appointments
    .filter((item) => item.starts_at)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const next = sortedAppointments[0];
  const actions: string[] = [];
  if (next?.starts_at) actions.push(`Prepara la call: ${next.title}, ${formatEuropeRome(next.starts_at)}.`);
  if (input.hotThreads > 0) actions.push(`Gestisci prima ${input.hotThreads} conversazioni calde.`);
  if (input.followUpsDue > 0) actions.push(`Completa ${input.followUpsDue} ricontatti in scadenza.`);
  if (market.readyLeads > 0) {
    const target = market.city ?? market.market;
    actions.push(
      channel === 'TELEGRAM'
        ? `Usa Telegram sulle conversazioni già attive; per le nuove email ${target ? `testa ${target}` : 'usa i lead pronti'}.`
        : `Avvia ${channel === 'BALANCED' ? 'un test multicanale' : 'una campagna email'} ${target ? `su ${target}` : 'sui lead pronti'}.`,
    );
  }
  if (!actions.length) actions.push('Prepara un piccolo test commerciale e raccogli i primi risultati.');

  const appointmentText = sortedAppointments.length
    ? `oggi hai ${sortedAppointments.length} appuntamenti`
    : 'oggi non hai appuntamenti';
  const recommendationText =
    channel === 'BALANCED'
      ? 'ti consiglio un test bilanciato tra email e Telegram'
      : `ti consiglio ${channel === 'EMAIL' ? 'email' : 'Telegram'}`;
  return {
    generatedAt: input.now.toISOString(),
    today: {
      appointments: sortedAppointments.length,
      nextAppointment: next?.starts_at ? `${next.title}, ${formatEuropeRome(next.starts_at)}` : null,
      hotThreads: input.hotThreads,
      followUpsDue: input.followUpsDue,
    },
    channels: { EMAIL: email, TELEGRAM: telegram },
    recommendation: {
      channel,
      market: market.market,
      city: market.city,
      readyLeads: market.readyLeads,
      reason,
    },
    actions,
    summary: `Ciao Attilio, ${appointmentText}. Per oggi ${recommendationText}. ${reason}${
      market.readyLeads && (market.city || market.market)
        ? ` Per le nuove email partirei da ${market.city ?? market.market}, dove hai ${market.readyLeads} lead pronti.`
        : ''
    }`,
  };
}

export async function getDailyCommercialBriefing(
  admin: AppSupabaseClient,
  workspaceId: string,
  now = new Date(),
): Promise<DailyCommercialBriefing> {
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const today = europeRomeDayRange(0, now);
  const tomorrowYmd = europeRomeYmd(-1, now);
  const [year, month, day] = tomorrowYmd.split('-').map(Number);
  const tomorrowStart = europeRomeLocalToIso(year, month, day, 0, 0);

  const [messagesResult, bookedResult, appointmentsResult, hotResult, dueResult, leadsResult] =
    await Promise.all([
      admin
        .from('messages')
        .select('thread_id, provider, direction')
        .eq('workspace_id', workspaceId)
        .gte('sent_at', since)
        .limit(4000),
      admin
        .from('sales_thread_events')
        .select('thread_id')
        .eq('workspace_id', workspaceId)
        .eq('event_type', 'APPOINTMENT_BOOKED')
        .gte('created_at', since)
        .limit(1000),
      admin
        .from('calendar_events')
        .select('starts_at, title')
        .eq('workspace_id', workspaceId)
        .eq('status', 'SCHEDULED')
        .gte('starts_at', today.startIso)
        .lt('starts_at', tomorrowStart)
        .order('starts_at', { ascending: true }),
      admin
        .from('message_threads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('priority', 'HOT')
        .neq('commercial_state', 'WON')
        .neq('commercial_state', 'LOST'),
      admin
        .from('message_threads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .lte('next_step_at', now.toISOString())
        .not('next_step_at', 'is', null),
      admin
        .from('leads')
        .select('country, city')
        .eq('workspace_id', workspaceId)
        .not('email', 'is', null)
        .in('business_status', ['NEW', 'QUALIFIED', 'CAMPAIGN_READY'])
        .limit(2000),
    ]);

  const bookedThreadIds = (bookedResult.data ?? []).map((row) => row.thread_id);
  const uniqueBooked = [...new Set(bookedThreadIds)];
  const { data: bookedThreads } = uniqueBooked.length
    ? await admin
        .from('message_threads')
        .select('id, channel')
        .eq('workspace_id', workspaceId)
        .in('id', uniqueBooked)
    : { data: [] as Array<{ id: string; channel: string }> };
  const threadChannels = Object.fromEntries(
    (bookedThreads ?? []).map((thread) => [thread.id, thread.channel]),
  );

  return buildDailyCommercialBriefing({
    now,
    messages: messagesResult.data ?? [],
    bookedThreadIds,
    threadChannels,
    appointments: appointmentsResult.data ?? [],
    hotThreads: hotResult.count ?? 0,
    followUpsDue: dueResult.count ?? 0,
    readyLeads: leadsResult.data ?? [],
  });
}
