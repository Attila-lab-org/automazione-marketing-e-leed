import { buildOperatorCapabilityReply } from './capabilities';
import type { OperatorComposeInput } from './orchestrator-input';
import type { OperatorFinalReply } from './orchestrator-schema';
import type { DailyCommercialBriefing } from '@/lib/sales/daily-briefing';
import type { CommercialGoalPlanRow, CommercialGoalRow } from '@/lib/types/database';
import type { GoalProgressSnapshot } from '@/lib/sales/goals/types';
import type {
  BlockerItem,
  CalendarEventHit,
  CalendarSlotHit,
  CalendarSummary,
  CampaignSummary,
  CommercialInsights,
  DailyReport,
  DemoSummary,
  LeadSearchHit,
  SecurityOperatorReport,
  TelegramInboundStatus,
  TemplateSummary,
} from './registry';
import { riskIfUnfixed } from '@/lib/security/explain';

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

  const security = succeeded<SecurityOperatorReport>(input, 'get_security_report');
  if (security) {
    if (security.found && security.name) {
      parts.push(
        `Report Sicurezza di ${security.name}${security.score != null ? `: punteggio ${security.score}.` : '.'}`,
      );
      if ((security.findings ?? []).length) {
        parts.push('Per ogni voce, cosa rischia se non sistema:');
      }
      for (const finding of (security.findings ?? []).slice(0, 6)) {
        parts.push(`${finding.title}. ${riskIfUnfixed(finding.risk)}`);
      }
    } else {
      parts.push(security.reason ?? 'Questo report Sicurezza non è disponibile.');
    }
  }

  const commercialGoal = succeeded<CommercialGoalRow>(input, 'get_active_commercial_goal');
  const goalPlan = succeeded<CommercialGoalPlanRow>(input, 'get_commercial_goal_plan');
  if (commercialGoal) {
    const progress = commercialGoal.progress_snapshot as unknown as Partial<GoalProgressSnapshot>;
    parts.push(
      `Obiettivo attivo: ${commercialGoal.title}. ${Number(commercialGoal.current_value)}/${Number(commercialGoal.target_value)} ${commercialGoal.target_metric.toLowerCase().replaceAll('_', ' ')}, modalità ${commercialGoal.mode}.`,
    );
    if (progress.pace) {
      parts.push(
        `Ritmo ${progress.pace}: ${progress.progressPct ?? 0}% dell’obiettivo, ${progress.elapsedPct ?? 0}% del tempo passato.${progress.blockers?.length ? ` Da sistemare: ${progress.blockers.join(', ')}.` : ''}`,
      );
    }
    if (goalPlan) {
      parts.push(
        `Piano v${goalPlan.version}: ${goalPlan.rationale} Prossima verifica: ${commercialGoal.next_tick_at ? new Date(commercialGoal.next_tick_at).toLocaleString('it-IT') : 'non programmata'}.`,
      );
    }
  } else if (input.traces.some((trace) => trace.name === 'get_active_commercial_goal')) {
    parts.push('Non c’è ancora un obiettivo commerciale attivo.');
  }

  const briefing = succeeded<DailyCommercialBriefing>(input, 'get_daily_briefing');
  if (briefing) {
    parts.push(briefing.summary);
    if (briefing.actions.length) {
      parts.push(`Priorità: ${briefing.actions.slice(0, 3).join(' ')}`);
    }
  }

  const insights = succeeded<CommercialInsights>(input, 'get_commercial_insights');
  if (insights) {
    parts.push(
      `Dagli ultimi ${insights.windowDays} giorni: ${insights.recommendations
        .slice(0, 3)
        .join(' ')}`,
    );
  }

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
        : 'Non ci sono orari liberi: dalle 9 alle 18 è tutto già occupato.',
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
        ? `${blockers.length === 1 ? 'questa cosa da sistemare' : `queste ${blockers.length} cose da sistemare`} (${blockers[0]?.label ?? 'blocco'})`
        : daily?.metrics.reviewEntered.available && daily.metrics.reviewEntered.value > 0
          ? 'le attività da controllare'
          : campaigns?.find((c) => c.status === 'PAUSED')
            ? `l’invio in pausa «${campaigns.find((c) => c.status === 'PAUSED')?.name}»`
            : 'i contatti già pronti, prima di aprire un nuovo invio';
    parts.push(`Partirei da ${startFrom}, dai dati attuali.`);
    if (dashboard) {
      parts.push(
        `In elenco ci sono ${dashboard.leadsTotal ?? 0} attività e ${dashboard.campaignsActive ?? 0} campagne attive.`,
      );
    }
  } else if (blockers?.length) {
    parts.push(
      `${blockers.length === 1 ? 'C’è 1 cosa da sistemare' : `Ci sono ${blockers.length} cose da sistemare`}: ${blockers
        .slice(0, 5)
        .map((b) => b.label)
        .join('; ')}.`,
    );
  }
  if (daily && !wantsPriority) {
    const found = daily.metrics.leadsFound;
    if (found.available) parts.push(`${daily.period.label} hai trovato ${found.value} contatti.`);
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
        `Contatti più interessanti: ${top
          .map(
            (l, i) =>
              `${i + 1}. ${l.name}${l.city ? ` (${l.city})` : ''}${
                l.discoveryScore != null ? ` — punteggio ${l.discoveryScore}` : ''
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
      `Anteprima «${demo.leadName}» sul modello ${demo.templateName}. Titolo: ${demo.headline ?? 'non impostato'}.`,
    );
  } else if (template && !('missing' in (template as object))) {
    parts.push(`Modello «${template.name}», ${template.demoCount} anteprime collegate.`);
  } else if (templates || demos) {
    if (demos?.length) parts.push(`Anteprime pronte: ${demos.slice(0, 5).map((d) => d.leadName).join(', ')}. Quale controllo?`);
    else if (templates?.length) parts.push(`Modelli: ${templates.map((t) => t.name).join(', ')}. Quale vuoi aprire?`);
    else parts.push('Non c’è un’anteprima o un modello da aprire. Quale vuoi che controlli?');
  }

  const reply = parts.join(' ').trim();
  if (!reply) {
    return {
      reply:
        input.plan.clarification ??
        'Ho i dati. Dimmi se vuoi approfondire i contatti, un invio, il calendario, un’anteprima o Telegram.',
      citedTools: cited,
    };
  }
  return { reply, citedTools: cited };
}
