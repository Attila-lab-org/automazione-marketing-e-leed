import { buildOperatorCapabilityReply } from './capabilities';
import type { OperatorComposeInput } from './orchestrator-input';
import type { OperatorFinalReply } from './orchestrator-schema';
import type {
  BlockerItem,
  CalendarEventHit,
  CalendarSlotHit,
  CalendarSummary,
  CampaignSummary,
  DailyReport,
  DemoSummary,
  LeadSearchHit,
  TelegramInboundStatus,
  TemplateSummary,
} from './registry';

function succeeded<T>(input: OperatorComposeInput, name: string): T | undefined {
  const row = input.traces.find((t) => t.ok && t.name === name);
  return row?.result as T | undefined;
}

export function composeOrchestratorReply(input: OperatorComposeInput): OperatorFinalReply {
  const cited = input.traces.filter((t) => t.ok).map((t) => t.name);
  if (input.plan.clarification && cited.length === 0 && input.plan.safetyClass === 'UNKNOWN') {
    return { reply: input.plan.clarification, citedTools: [] };
  }
  if (input.plan.safetyClass === 'HELP') {
    return { reply: buildOperatorCapabilityReply(input.assistMode).reply, citedTools: [] };
  }

  const parts: string[] = [];
  if (input.writeSummaries.length) parts.push(input.writeSummaries.join(' '));

  const calendar = succeeded<CalendarSummary>(input, 'get_calendar_summary');
  if (calendar) {
    parts.push(
      `In calendario hai ${calendar.scheduledAppointments} appuntamenti fissati (SCHEDULED), di cui ${calendar.upcomingThisWeek} questa settimana. Completati: ${calendar.completedAppointments}. Annullati: ${calendar.cancelledAppointments}. Slot liberi: ${calendar.availableSlots}.`,
    );
    if (calendar.nextAppointments.length) {
      parts.push(
        `Prossimi: ${calendar.nextAppointments
          .slice(0, 5)
          .map((e) => `${e.label}${e.leadName ? ` (${e.leadName})` : ''}`)
          .join('; ')}.`,
      );
    }
  }

  const events = succeeded<CalendarEventHit[]>(input, 'list_calendar_events');
  if (events && !calendar) {
    parts.push(
      events.length
        ? `Eventi: ${events.slice(0, 8).map((e) => `${e.label} [${e.status}]`).join('; ')}.`
        : 'Nessun evento in calendario per il periodo richiesto.',
    );
  }

  const slots = succeeded<CalendarSlotHit[]>(input, 'list_available_slots');
  if (slots) {
    parts.push(
      slots.length
        ? `Disponibilità: ${slots.slice(0, 8).map((s) => s.label).join('; ')}.`
        : 'Nessuno slot disponibile.',
    );
  }

  const telegram = succeeded<TelegramInboundStatus>(input, 'get_telegram_inbound_status');
  if (telegram) {
    parts.push(telegram.summary);
    parts.push('Non creo una campagna: Telegram ascolta i messaggi inbound già configurati, non cerca ristoranti.');
  }

  const dashboard = succeeded<Record<string, number>>(input, 'get_dashboard_summary');
  const blockers = succeeded<BlockerItem[]>(input, 'get_blockers');
  const campaigns = succeeded<CampaignSummary[]>(input, 'list_campaigns');
  const daily = succeeded<DailyReport>(input, 'get_daily_report');
  const wantsPriority =
    input.plan.goal.toLowerCase().includes('partire') || /da dove|partirest|priorit/.test(input.question.toLowerCase());
  if (wantsPriority && (dashboard || blockers || daily || campaigns)) {
    const startFrom =
      blockers && blockers.length
        ? `i ${blockers.length} blocker aperti (${blockers[0]?.label ?? 'blocco'})`
        : daily?.metrics.reviewEntered.available && daily.metrics.reviewEntered.value > 0
          ? 'la Review, dove ci sono attività da controllare'
          : campaigns?.find((c) => c.status === 'PAUSED')
            ? `la campagna in pausa «${campaigns.find((c) => c.status === 'PAUSED')?.name}»`
            : 'i lead già qualificati, prima di aprire una nuova campagna';
    parts.push(`Partirei da ${startFrom}, dai dati attuali.`);
    if (dashboard) {
      parts.push(
        `In elenco ci sono ${dashboard.leadsTotal ?? 0} attività e ${dashboard.campaignsActive ?? 0} campagne attive.`,
      );
    }
  } else if (blockers?.length) {
    parts.push(
      `${blockers.length} blocker: ${blockers
        .slice(0, 5)
        .map((b) => b.label)
        .join('; ')}.`,
    );
  }
  if (daily && !wantsPriority) {
    const found = daily.metrics.leadsFound;
    if (found.available) parts.push(`${daily.period.label} hai trovato ${found.value} lead.`);
  }

  const campaign = succeeded<{ id?: string; name?: string; status?: string }>(input, 'get_campaign_detail');
  if (campaign?.name) {
    parts.push(`Campagna «${campaign.name}» (${campaign.status ?? 'stato non indicato'}).`);
  }

  const leads = succeeded<LeadSearchHit[]>(input, 'search_leads');
  if (leads) {
    if (!leads.length) parts.push('Non ho trovato attività con questi filtri.');
    else {
      const top = [...leads].sort((a, b) => (b.discoveryScore ?? -1) - (a.discoveryScore ?? -1)).slice(0, 5);
      parts.push(
        `Lead più forti: ${top
          .map(
            (l, i) =>
              `${i + 1}. ${l.name}${l.city ? ` (${l.city})` : ''}${
                l.discoveryScore != null ? ` — score ${l.discoveryScore}` : ''
              }`,
          )
          .join('; ')}.`,
      );
    }
  }

  const templates = succeeded<TemplateSummary[]>(input, 'list_templates');
  const demos = succeeded<DemoSummary[]>(input, 'list_demos');
  const demo = succeeded<DemoSummary>(input, 'inspect_demo');
  const template = succeeded<TemplateSummary>(input, 'inspect_template');
  if (demo && !('missing' in (demo as object))) {
    parts.push(
      `Demo «${demo.leadName}» su ${demo.templateName}. Headline: ${demo.headline ?? 'non impostata'}. Path ${demo.publicPath}.`,
    );
  } else if (template && !('missing' in (template as object))) {
    parts.push(`Template «${template.name}» (${template.status}), ${template.demoCount} demo collegate.`);
  } else if (templates || demos) {
    if (demos?.length) parts.push(`Demo attive: ${demos.slice(0, 5).map((d) => d.leadName).join(', ')}. Quale controllo?`);
    else if (templates?.length) parts.push(`Template: ${templates.map((t) => t.name).join(', ')}. Quale vuoi aprire?`);
    else parts.push('Non c’è una demo o un template nel contesto. Quale vuoi che controlli?');
  }

  const reply = parts.join(' ').trim();
  if (!reply) {
    return {
      reply:
        input.plan.clarification ??
        'Ho i dati degli strumenti usati. Dimmi se vuoi approfondire lead, campagna, calendario, demo o Telegram.',
      citedTools: cited,
    };
  }
  return { reply, citedTools: cited };
}
