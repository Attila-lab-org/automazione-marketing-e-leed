import type { OperatorAction, OperatorReply } from './actions';
import { buildOperatorCapabilityReply, HARD_DELETE_FOLLOWUP, type OperatorAssistMode } from './capabilities';
import type { DailyReport, LeadSearchHit, OperatorToolName } from './registry';
import type { OperatorEnvelope } from './envelope';
import type { OperatorIntent } from './intent';
import type { WriteResult } from './writes';

function metricText(metric: DailyReport['metrics'][keyof DailyReport['metrics']]): string | null {
  if (!metric.available) return null;
  return String(metric.value);
}

export function navigationActionForQuestion(question: string): OperatorAction | null {
  const q = question
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:telegeram|telegramm+|telgram|telegran|telegam)\b/g, 'telegram');
  if (!/\b(apri|vai|portami|portami alla|portami agli|mostrami la pagina)\b/.test(q)) return null;
  if (/telegram/.test(q)) {
    return /messagg|chat|conversaz/.test(q)
      ? { type: 'open_page', page: 'telegram-messages', label: 'Apri messaggi Telegram' }
      : { type: 'open_page', page: 'telegram', label: 'Apri bot Telegram' };
  }
  if (/messagg|inbox|posta/.test(q)) {
    return { type: 'open_page', page: 'inbox', label: 'Apri messaggi' };
  }
  if (/contatt|lead|client/.test(q)) {
    return { type: 'open_page', page: 'leads', label: 'Apri contatti' };
  }
  if (/invii|campagn|email/.test(q)) {
    return { type: 'open_page', page: 'campaigns', label: 'Apri invii email' };
  }
  if (/calendar|appuntament|agenda/.test(q)) {
    return { type: 'open_page', page: 'calendar', label: 'Apri calendario' };
  }
  if (/archiv/.test(q)) return { type: 'open_page', page: 'archive', label: 'Apri archivio' };
  if (/impostazion|setting/.test(q)) {
    return { type: 'open_page', page: 'settings', label: 'Apri impostazioni' };
  }
  if (/oggi|panoramica|dashboard|home/.test(q)) {
    return { type: 'open_page', page: 'overview', label: 'Apri Oggi' };
  }
  return null;
}

export function composeOperatorReply(
  question: string,
  envelope: OperatorEnvelope,
  traces: Array<{ name: OperatorToolName; result: unknown }>,
  writes: WriteResult[] = [],
  intent?: OperatorIntent,
  assistMode: OperatorAssistMode = 'ASSISTITO',
): OperatorReply {
  const navigation = navigationActionForQuestion(question);
  if (navigation) {
    return { reply: `Ti porto a ${navigation.label.replace(/^Apri /, '')}.`, actions: [navigation] };
  }
  if (intent?.kind === 'HELP') {
    const help = buildOperatorCapabilityReply(assistMode);
    return { reply: help.reply, actions: [] };
  }
  if (intent?.kind === 'UNKNOWN') {
    return {
      reply:
        'Non ho collegato questa richiesta a un’azione. Prova: «rispondi a telegram», «prendi in carico», «aggiungi disponibilità domani alle 15:00», «riprogramma appuntamento», oppure preparare una campagna TEST.',
      actions: [],
    };
  }

  const byName = new Map(traces.map((t) => [t.name, t.result]));
  const actions: OperatorAction[] = [];
  const parts: string[] = [];
  const q = question.toLowerCase();

  const create = writes.find((w) => w.tool === 'create_campaign');
  const prepare = writes.find((w) => w.tool === 'prepare_campaign');
  const discovery = writes.find((w) => w.tool === 'discover_leads');
  const analyze = writes.find((w) => w.tool === 'analyze_business');
  const send = writes.find((w) => w.tool === 'send_campaign');
  const policy = writes.find((w) => w.tool === 'propose_autonomy' || w.tool === 'enable_autonomy');

  if (discovery) parts.push(discovery.summary);

  if (analyze?.ok) {
    const opp = analyze.data.opportunity as { aiOpportunityScore?: number; reasons?: string[] } | undefined;
    const analysis = analyze.data.analysis as { recommendedOffer?: string; confidence?: number } | undefined;
    parts.push(analyze.summary);
    if (opp?.reasons?.length) parts.push(`Motivi: ${opp.reasons.join('; ')}.`);
    if (analysis?.recommendedOffer) parts.push(`Azione: ${analysis.recommendedOffer}.`);
    const leadId = typeof analyze.data.leadId === 'string' ? analyze.data.leadId : null;
    if (leadId) actions.push({ type: 'open_lead', leadId, label: 'Apri attività' });
  }

  if (create || prepare) {
    const selected = Number(prepare?.data.selected ?? create?.data.leadCount ?? 0);
    const skipped = Number(create?.data.skipped ?? 0);
    const campaignId = String(prepare?.data.campaignId ?? create?.data.campaignId ?? '');
    const isDemoBatch = /demo|anteprim|propost[ae] visiv|siti? dimostrativ/.test(q);
    parts.push(
      isDemoBatch
        ? `${selected} attività selezionate. ${
            typeof prepare?.data.enqueued === 'number'
              ? `Preparazione di ${prepare.data.enqueued} demo avviata: analisi, personalizzazione e copy.`
              : 'Non ho potuto avviare la preparazione delle demo.'
          } ${skipped} attività bloccate. 0 messaggi inviati.`
        : `Invio email ${create?.ok ? 'creato' : 'non creato'}. ${selected} contatti selezionati. ${
            typeof prepare?.data.enqueued === 'number' ? `${prepare.data.enqueued} in preparazione.` : ''
          } ${skipped} bloccati in partenza. 0 messaggi inviati.`,
    );
    if (campaignId) {
      actions.push({ type: 'open_campaign', campaignId, label: 'Apri campagna' });
      actions.push({ type: 'open_review', label: 'Apri da controllare' });
      actions.push({ type: 'show_blockers', campaignId, label: 'Mostra problemi' });
    }
  }

  if (send) {
    parts.push(send.summary);
    const pendingId = typeof send.data.pendingActionId === 'string' ? send.data.pendingActionId : null;
    const campaignId = typeof send.data.campaignId === 'string' ? send.data.campaignId : null;
    if (campaignId) actions.push({ type: 'open_campaign', campaignId, label: 'Apri campagna' });
    if (pendingId && send.ok) {
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label: 'Conferma invio' });
      actions.push({ type: 'cancel_action', pendingActionId: pendingId, label: 'Annulla' });
    }
  }

  if (policy) {
    parts.push(policy.summary);
    const pendingId = typeof policy.data.pendingActionId === 'string' ? policy.data.pendingActionId : null;
    if (pendingId) {
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label: 'Abilita policy' });
      actions.push({ type: 'cancel_action', pendingActionId: pendingId, label: 'Annulla' });
    }
  }

  const personalize = writes.find(
    (w) => w.tool === 'personalize_demo' || w.tool === 'apply_demo_personalization',
  );
  if (personalize) {
    parts.push(personalize.summary);
    const proposal = personalize.data.proposal as
      | {
          headline?: string;
          subheadline?: string;
          description?: string;
          ctaLabel?: string;
        }
      | undefined;
    if (personalize.ok && proposal) {
      parts.push(
        [
          'Ecco i testi che ho preparato:',
          proposal.headline ? `Titolo: ${proposal.headline}` : null,
          proposal.subheadline ? `Sottotitolo: ${proposal.subheadline}` : null,
          proposal.description ? `Descrizione: ${proposal.description}` : null,
          proposal.ctaLabel ? `Pulsante: ${proposal.ctaLabel}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    const path = typeof personalize.data.publicPath === 'string' ? personalize.data.publicPath : null;
    if (path) actions.push({ type: 'open_demo', path, label: 'Apri anteprima' });
  }

  const opsWrite = writes.find((w) =>
    [
      'reply_telegram',
      'take_over_thread',
      'return_to_ai',
      'stop_automation',
      'create_calendar_slot',
      'cancel_appointment',
      'reschedule_appointment',
      'set_telegram_runtime',
      'update_commercial_playbook',
      'update_telegram_keywords',
      'list_manual_followups',
      'close_won',
      'archive_thread',
      'drop_thread',
      'dismiss_todo',
    ].includes(w.tool),
  );
  if (opsWrite) {
    parts.push(opsWrite.summary);
    const href = typeof opsWrite.data.href === 'string' ? opsWrite.data.href : null;
    const threadId = typeof opsWrite.data.threadId === 'string' ? opsWrite.data.threadId : null;
    const pendingId = typeof opsWrite.data.pendingActionId === 'string' ? opsWrite.data.pendingActionId : null;
    const confirmLabel = opsWrite.data.confirmLabel;
    if (href?.startsWith('/inbox') || threadId) {
      actions.push({
        type: 'open_inbox',
        ...(threadId ? { threadId } : {}),
        label: 'Apri messaggi',
      });
    }
    if (pendingId && opsWrite.ok) {
      const label =
        confirmLabel === 'Conferma risposta' ||
        confirmLabel === 'Conferma azione' ||
        confirmLabel === 'Metti in pausa' ||
        confirmLabel === 'Conferma invio' ||
        confirmLabel === 'Abilita policy' ||
        confirmLabel === 'Sì, accendi Telegram' ||
        confirmLabel === 'Sì, spegni Telegram' ||
        confirmLabel === 'Archivia invio' ||
        confirmLabel === 'Nascondi invio'
          ? confirmLabel
          : 'Conferma azione';
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label });
      actions.push({ type: 'cancel_action', pendingActionId: pendingId, label: 'Annulla' });
    }
    if (opsWrite.tool === 'create_calendar_slot' || opsWrite.tool === 'reschedule_appointment') {
      actions.push({ type: 'open_calendar', label: 'Apri calendario' });
    }
    if (opsWrite.tool === 'update_commercial_playbook') {
      actions.push({ type: 'open_settings', section: 'playbook', label: 'Apri impostazioni' });
    }
  }

  const pauseWrite = writes.find((w) => w.tool === 'pause_campaign');
  if (pauseWrite) {
    parts.push(pauseWrite.summary);
    const pendingId = typeof pauseWrite.data.pendingActionId === 'string' ? pauseWrite.data.pendingActionId : null;
    const campaignId = typeof pauseWrite.data.campaignId === 'string' ? pauseWrite.data.campaignId : null;
    if (campaignId) actions.push({ type: 'open_campaign', campaignId, label: 'Apri campagna' });
    if (pendingId && pauseWrite.ok) {
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label: 'Metti in pausa' });
      actions.push({ type: 'cancel_action', pendingActionId: pendingId, label: 'Annulla' });
    }
  }

  const mutation = writes.find((w) => w.tool === 'campaign_mutation');
  if (mutation) {
    parts.push(mutation.summary);
    const campaignId = typeof mutation.data.campaignId === 'string' ? mutation.data.campaignId : null;
    const pendingId = typeof mutation.data.pendingActionId === 'string' ? mutation.data.pendingActionId : null;
    const listed = byName.get('list_campaigns') as Array<{ id: string; name: string; status: string }> | undefined;
    if (campaignId) actions.push({ type: 'open_campaign', campaignId, label: 'Apri campagna' });
    if (pendingId && mutation.data.canPause === true) {
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label: 'Metti in pausa' });
    }
    if (pendingId && mutation.data.canPause !== true) {
      const label =
        mutation.data.confirmLabel === 'Nascondi invio' ? 'Nascondi invio' : 'Archivia invio';
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label });
    }
    if (campaignId && mutation.data.choice === true && mutation.data.hardDelete === false) {
      actions.push({
        type: 'send_followup',
        message: HARD_DELETE_FOLLOWUP,
        label: 'Elimina definitivamente',
      });
    }
    if (pendingId) {
      actions.push({ type: 'cancel_action', pendingActionId: pendingId, label: 'Annulla' });
    }
    if (!campaignId && listed?.length) {
      parts.push(
        listed
          .slice(0, 5)
          .map((row) => `«${row.name}» (${row.id.slice(0, 8)}…, ${row.status})`)
          .join('; ') + '.',
      );
    }
  }

  const daily = byName.get('get_daily_report') as DailyReport | undefined;
  if (daily) {
    const found = metricText(daily.metrics.leadsFound);
    const qualified = metricText(daily.metrics.qualified);
    const demos = metricText(daily.metrics.demosReady);
    const review = metricText(daily.metrics.reviewEntered);
    const failed = metricText(daily.metrics.failedPreparations);
    const period = daily.period.label;
    const sentences: string[] = [];
    if (found) sentences.push(`${period === 'ieri' ? 'Ieri' : period} hai trovato ${found} nuov${found === '1' ? 'o contatto' : 'i contatti'}`);
    else sentences.push(`Il numero di nuovi contatti per ${period} non è disponibile`);
    if (qualified) sentences.push(`${qualified} ${qualified === '1' ? 'è stato qualificato' : 'sono stati qualificati'}`);
    else sentences.push('il numero di qualificati non è disponibile');
    if (demos) sentences.push(`${demos} ${demos === '1' ? 'ha' : 'hanno'} un’anteprima pronta`);
    else sentences.push('il numero di anteprime pronte non è disponibile');
    if (review) sentences.push(`${review} ${review === '1' ? 'è da controllare' : 'sono da controllare'}`);
    else sentences.push('il numero di attività da controllare non è disponibile');
    parts.push(`${sentences[0]}. ${sentences.slice(1).join(', ')}.`);
    if (failed) {
      const samples = daily.failedSamples
        .map((s) => s.reason)
        .filter(Boolean)
        .slice(0, 2);
      if (Number(failed) > 0) {
        parts.push(
          samples.length
            ? `${failed === '1' ? 'Una preparazione è ferma' : `${failed} preparazioni sono ferme`}: ${samples.join('; ')}.`
            : `${failed === '1' ? 'Una preparazione è ferma' : `${failed} preparazioni sono ferme`}.`,
        );
      }
    } else {
      parts.push('Lo stato delle preparazioni ferme non è disponibile.');
    }
    if (!daily.metrics.emailsSent.available) {
      parts.push('Il numero di email inviate in quel periodo non è disponibile.');
    }
    if (!daily.metrics.replies.available) {
      parts.push('Il numero di risposte ricevute in quel periodo non è disponibile.');
    }
    if (Number(review ?? '0') > 0) {
      actions.push({ type: 'open_review', label: 'Apri da controllare' });
    }
  }

  const leads = byName.get('search_leads') as LeadSearchHit[] | undefined;
  if (leads) {
    if (leads.length === 0) {
      parts.push('Non ho trovato attività con questi filtri nei dati attuali.');
    } else {
      const cityLabel =
        q.match(/\b(milano|roma|napoli|torino|firenze|bologna|bergamo|brescia|genova|padova|verona)\b/i)?.[1] ??
        envelope.filters?.city ??
        null;
      const ranked = [...leads].sort((a, b) => (b.discoveryScore ?? -1) - (a.discoveryScore ?? -1));
      const lines = ranked.slice(0, 5).map((lead, i) => {
        const score = lead.discoveryScore == null ? 'punteggio non disponibile' : `punteggio ${lead.discoveryScore}`;
        return `${i + 1}. ${lead.name}${lead.city ? ` (${lead.city})` : ''} — ${score}`;
      });
      parts.push(
        `${cityLabel ? `I contatti più interessanti a ${cityLabel[0]!.toUpperCase()}${cityLabel.slice(1)}` : 'I contatti più interessanti'} in questo momento:\n${lines.join('\n')}`,
      );
      actions.push({
        type: 'show_leads',
        leadIds: ranked.slice(0, 8).map((l) => l.id),
        city: cityLabel ?? undefined,
        label: 'Mostra contatti',
      });
    }
  }

  const campaign = byName.get('get_campaign_detail') as
    | { name?: string; status?: string; missing?: boolean; reason?: string; id?: string }
    | null
    | undefined;
  const blockers = byName.get('get_blockers') as Array<{ label: string; entityId: string | null }> | undefined;
  if (campaign || blockers) {
    if (campaign && 'missing' in campaign && campaign.missing) {
      parts.push(
        'Non ho una campagna nel contesto di questa pagina. Aprine una e riprova, senza bisogno di copiare l’ID.',
      );
    } else if (campaign?.name) {
      const statusLabel =
        campaign.status === 'PAUSED'
          ? 'in pausa'
          : campaign.status === 'ACTIVE'
            ? 'in corso'
            : campaign.status === 'DRAFT'
              ? 'in bozza'
              : campaign.status === 'COMPLETED'
                ? 'completata'
                : campaign.status === 'STOPPED'
                  ? 'fermata'
                  : campaign.status === 'ARCHIVED'
                    ? 'archiviata'
                    : null;
      parts.push(
        statusLabel
          ? `L’invio «${campaign.name}» è ${statusLabel}.`
          : `L’invio «${campaign.name}» è aperto.`,
      );
      if (campaign.id) {
        actions.push({ type: 'open_campaign', campaignId: campaign.id, label: 'Apri campagna' });
      }
    }
    if (blockers) {
      if (blockers.length === 0) {
        parts.push('Al momento non ci sono problemi aperti.');
      } else {
        parts.push(
          `${blockers.length === 1 ? 'C’è 1 cosa da sistemare' : `Ci sono ${blockers.length} cose da sistemare`}: ${blockers
            .slice(0, 5)
            .map((b) => b.label)
            .join('; ')}.`,
        );
      }
    }
  }

  const dashboard = byName.get('get_dashboard_summary') as Record<string, number> | undefined;
  if (dashboard && parts.length === 0) {
    parts.push(
      `Ci sono ${dashboard.leadsTotal ?? 0} attività in elenco, ${dashboard.leadsQualified ?? 0} qualificate e ${dashboard.campaignsActive ?? 0} campagne attive.`,
    );
  }

  const review = byName.get('list_review_items') as Array<{ companyName: string; blockers: string[] }> | undefined;
  if (review) {
    parts.push(
      review.length
        ? `Ci sono ${review.length} attività da controllare.`
        : 'Non c’è niente da controllare.',
    );
    if (review.length) actions.push({ type: 'open_review', label: 'Apri da controllare' });
  }

  const conversations = byName.get('list_conversations') as Array<{ leadName: string }> | undefined;
  if (conversations && !opsWrite) {
    parts.push(
      conversations.length
        ? `Ci sono ${conversations.length} conversazioni in Messaggi.`
        : 'Non ci sono conversazioni in Messaggi.',
    );
    if (conversations.length) actions.push({ type: 'open_inbox', label: 'Apri messaggi' });
  }

  const calendarSummary = byName.get('get_calendar_summary') as
    | {
        scheduledAppointments: number;
        completedAppointments: number;
        cancelledAppointments: number;
        upcomingThisWeek: number;
        availableSlots: number;
        nextAppointments: Array<{ label: string; leadName?: string | null; id: string }>;
        periodLabel: string;
      }
    | undefined;
  if (calendarSummary) {
    parts.push(
      `In calendario hai ${calendarSummary.scheduledAppointments} appuntamenti fissati (status SCHEDULED), di cui ${calendarSummary.upcomingThisWeek} questa settimana. Completati: ${calendarSummary.completedAppointments}. Annullati: ${calendarSummary.cancelledAppointments}. Slot liberi: ${calendarSummary.availableSlots}.`,
    );
    if (calendarSummary.nextAppointments.length) {
      parts.push(
        `Prossimi: ${calendarSummary.nextAppointments
          .slice(0, 5)
          .map((e) => `${e.label}${e.leadName ? ` (${e.leadName})` : ''}`)
          .join('; ')}.`,
      );
    } else {
      parts.push('Nessun appuntamento SCHEDULED nei prossimi giorni.');
    }
    actions.push({
      type: 'open_calendar',
      ...(calendarSummary.nextAppointments[0]?.id
        ? { focus: calendarSummary.nextAppointments[0].id }
        : {}),
      label: 'Apri calendario',
    });
  }

  const calendarEvents = byName.get('list_calendar_events') as
    | Array<{ label: string; status: string; leadName?: string | null }>
    | undefined;
  if (calendarEvents && !calendarSummary) {
    parts.push(
      calendarEvents.length
        ? `Eventi calendario: ${calendarEvents
            .slice(0, 8)
            .map((e) => `${e.label} [${e.status}]`)
            .join('; ')}.`
        : 'Nessun evento in calendario per il periodo richiesto.',
    );
    actions.push({ type: 'open_calendar', label: 'Apri calendario' });
  }

  const slots = byName.get('list_available_slots') as Array<{ label: string }> | undefined;
  if (slots) {
    parts.push(
      slots.length
        ? `Disponibilità aperte: ${slots.slice(0, 8).map((s) => s.label).join('; ')}.`
        : 'Non ci sono slot disponibili. Aggiungine uno, es. «aggiungi disponibilità domani alle 15:00».',
    );
    actions.push({ type: 'open_calendar', label: 'Apri calendario' });
  }

  const conversation = byName.get('get_conversation') as
    | {
        leadName?: string;
        status?: string;
        assignedMode?: string | null;
        messages?: Array<{ direction: string; body: string }>;
        aiDraft?: { understanding: string; text: string } | null;
        threadId?: string;
      }
    | null
    | undefined;
  if (conversation?.leadName && !opsWrite) {
    parts.push(
      `Conversazione con ${conversation.leadName} (${conversation.status ?? 'aperta'}${
        conversation.assignedMode ? `, modalità ${conversation.assignedMode}` : ''
      }).`,
    );
    if (conversation.messages?.length) {
      const last = conversation.messages.slice(-4);
      parts.push(
        last
          .map((m) => `${m.direction === 'INBOUND' ? 'Cliente' : 'Noi'}: ${m.body.slice(0, 120)}`)
          .join('\n'),
      );
    }
    if (conversation.aiDraft?.text) {
      parts.push(
        `Ho capito: ${conversation.aiDraft.understanding}\n\nBozza pronta (non inviata):\n${conversation.aiDraft.text}`,
      );
    }
    actions.push({
      type: 'open_inbox',
      ...(conversation.threadId ? { threadId: conversation.threadId } : {}),
      label: 'Apri messaggi',
    });
  }

  const demoInspect = byName.get('inspect_demo') as { publicPath?: string; leadName?: string } | undefined;
  if (demoInspect && typeof demoInspect.publicPath === 'string') {
    actions.push({ type: 'open_demo', path: demoInspect.publicPath, label: 'Apri anteprima' });
  }

  const uniqueActions = actions.filter((action, index) => {
    const key = JSON.stringify(action);
    return actions.findIndex((a) => JSON.stringify(a) === key) === index;
  });

  if (parts.length === 0) {
    parts.push('Ho letto i dati disponibili, ma non c’è un riepilogo specifico per questa domanda.');
  }

  return { reply: parts.join(' ').replace(/\s+\n/g, '\n').trim(), actions: uniqueActions };
}

export function missingMetricDeclared(reply: string): boolean {
  return /non è disponibile/i.test(reply);
}
