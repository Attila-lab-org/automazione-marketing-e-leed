import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { normalizePlaceKey } from '@/lib/leads/discovery-areas';

export type CityBoardContact = {
  id: string;
  city: string | null;
  email: string | null;
  sent: boolean;
  replied: boolean;
  ready: boolean;
};

export type CityBoardRow = {
  city: string;
  contacts: number;
  withEmail: number;
  sent: number;
  noReply: number;
  replied: number;
  ready: number;
  searched: boolean;
};

export type CityBoard = {
  rows: CityBoardRow[];
  totals: {
    cities: number;
    sent: number;
    noReply: number;
    replied: number;
    ready: number;
  };
};

export function campaignCityLabel(raw: string | null | undefined): string {
  const value = raw?.trim().replace(/\s+/g, ' ') ?? '';
  if (!value) return 'Città non indicata';
  return value
    .toLocaleLowerCase('it-IT')
    .replace(/(^|[\s'-])\p{L}/gu, (match) => match.toLocaleUpperCase('it-IT'));
}

function searchCoversCity(searchKey: string, cityKey: string): boolean {
  return searchKey === cityKey || searchKey.startsWith(`${cityKey} `);
}

export function buildCityBoard(input: {
  contacts: CityBoardContact[];
  searchedLocations: string[];
}): CityBoard {
  const byCity = new Map<string, CityBoardRow>();
  const ensure = (city: string): CityBoardRow => {
    const existing = byCity.get(city);
    if (existing) return existing;
    const created: CityBoardRow = {
      city,
      contacts: 0,
      withEmail: 0,
      sent: 0,
      noReply: 0,
      replied: 0,
      ready: 0,
      searched: false,
    };
    byCity.set(city, created);
    return created;
  };

  for (const contact of input.contacts) {
    const row = ensure(campaignCityLabel(contact.city));
    row.contacts += 1;
    if (contact.email?.trim()) row.withEmail += 1;
    if (contact.sent) row.sent += 1;
    if (contact.replied) row.replied += 1;
    if (contact.sent && !contact.replied) row.noReply += 1;
    if (contact.ready && !contact.sent) row.ready += 1;
  }

  for (const location of input.searchedLocations) {
    const searchKey = normalizePlaceKey(location);
    if (!searchKey) continue;
    let matched = false;
    for (const row of byCity.values()) {
      if (searchCoversCity(searchKey, normalizePlaceKey(row.city))) {
        row.searched = true;
        matched = true;
      }
    }
    if (!matched) {
      const row = ensure(campaignCityLabel(location));
      row.searched = true;
    }
  }

  const rows = [...byCity.values()].sort((a, b) => b.sent - a.sent || b.contacts - a.contacts || a.city.localeCompare(b.city, 'it'));
  return {
    rows,
    totals: {
      cities: rows.length,
      sent: rows.reduce((sum, row) => sum + row.sent, 0),
      noReply: rows.reduce((sum, row) => sum + row.noReply, 0),
      replied: rows.reduce((sum, row) => sum + row.replied, 0),
      ready: rows.reduce((sum, row) => sum + row.ready, 0),
    },
  };
}

export async function loadCityBoard(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<CityBoard> {
  const [{ data: leads, error: leadError }, { data: messages, error: messageError }, { data: threads, error: threadError }, { data: waiting, error: waitingError }, { data: searches, error: searchError }] =
    await Promise.all([
      admin.from('leads').select('id, city, email').eq('workspace_id', workspaceId),
      admin.from('messages').select('lead_id, direction, thread_id').eq('workspace_id', workspaceId),
      admin.from('message_threads').select('id, channel').eq('workspace_id', workspaceId),
      admin
        .from('campaign_leads')
        .select('lead_id, status')
        .eq('workspace_id', workspaceId)
        .in('status', ['REVIEW', 'READY']),
      admin
        .from('cost_events')
        .select('meta')
        .eq('workspace_id', workspaceId)
        .eq('operation', 'discovery')
        .limit(500),
    ]);
  if (leadError) throw new Error(`Campagna: contatti — ${leadError.message}`);
  if (messageError) throw new Error(`Campagna: messaggi — ${messageError.message}`);
  if (threadError) throw new Error(`Campagna: conversazioni — ${threadError.message}`);
  if (waitingError) throw new Error(`Campagna: pronte — ${waitingError.message}`);
  if (searchError) throw new Error(`Campagna: ricerche — ${searchError.message}`);

  const emailThreadIds = new Set(
    (threads ?? []).filter((thread) => thread.channel === 'EMAIL').map((thread) => thread.id),
  );
  const sentLeadIds = new Set<string>();
  const repliedLeadIds = new Set<string>();
  for (const message of messages ?? []) {
    if (!message.lead_id) continue;
    if (message.direction === 'OUTBOUND') sentLeadIds.add(message.lead_id);
    if (message.direction === 'INBOUND' && message.thread_id && emailThreadIds.has(message.thread_id)) {
      repliedLeadIds.add(message.lead_id);
    }
  }
  const readyLeadIds = new Set(
    (waiting ?? []).filter((row) => row.status === 'REVIEW' || row.status === 'READY').map((row) => row.lead_id),
  );
  const searchedLocations = (searches ?? []).flatMap((row) => {
    const meta = row.meta as { location?: unknown } | null;
    return typeof meta?.location === 'string' && meta.location.trim() ? [meta.location] : [];
  });

  return buildCityBoard({
    contacts: (leads ?? []).map((lead) => ({
      id: lead.id,
      city: lead.city,
      email: lead.email,
      sent: sentLeadIds.has(lead.id),
      replied: repliedLeadIds.has(lead.id),
      ready: readyLeadIds.has(lead.id),
    })),
    searchedLocations,
  });
}
