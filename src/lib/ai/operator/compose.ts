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

export function composeOperatorReply(
  question: string,
  envelope: OperatorEnvelope,
  traces: Array<{ name: OperatorToolName; result: unknown }>,
  writes: WriteResult[] = [],
  intent?: OperatorIntent,
  assistMode: OperatorAssistMode = 'ASSISTITO',
): OperatorReply {
  if (intent?.kind === 'HELP') {
    const help = buildOperatorCapabilityReply(assistMode);
    return { reply: help.reply, actions: [] };
  }
  if (intent?.kind === 'UNKNOWN') {
    return {
      reply:
        'Non ho collegato questa richiesta a un’azione del Sales OS. Vuoi trovare lead, preparare una campagna TEST, vedere i blocker, oppure altro?',
      actions: [],
    };
  }

  const byName = new Map(traces.map((t) => [t.name, t.result]));
  const actions: OperatorAction[] = [];
  const parts: string[] = [];
  const q = question.toLowerCase();

  const create = writes.find((w) => w.tool === 'create_campaign');
  const prepare = writes.find((w) => w.tool === 'prepare_campaign');
  const analyze = writes.find((w) => w.tool === 'analyze_business');
  const send = writes.find((w) => w.tool === 'send_campaign');
  const policy = writes.find((w) => w.tool === 'propose_autonomy' || w.tool === 'enable_autonomy');

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
    parts.push(
      `Campagna ${create?.ok ? 'creata' : 'non creata'}. ${selected} lead selezionati. ${
        typeof prepare?.data.enqueued === 'number' ? `${prepare.data.enqueued} in preparazione.` : ''
      } ${skipped} bloccati in partenza. 0 messaggi inviati.`,
    );
    if (campaignId) {
      actions.push({ type: 'open_campaign', campaignId, label: 'Apri campagna' });
      actions.push({ type: 'open_review', label: 'Apri Review' });
      actions.push({ type: 'show_blockers', campaignId, label: 'Mostra blocker' });
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
    const path = typeof personalize.data.publicPath === 'string' ? personalize.data.publicPath : null;
    if (path) actions.push({ type: 'open_demo', path, label: 'Apri demo' });
  }

  const mutation = writes.find((w) => w.tool === 'campaign_mutation');
  if (mutation) {
    parts.push(mutation.summary);
    const campaignId = typeof mutation.data.campaignId === 'string' ? mutation.data.campaignId : null;
    const pendingId = typeof mutation.data.pendingActionId === 'string' ? mutation.data.pendingActionId : null;
    const listed = byName.get('list_campaigns') as Array<{ id: string; name: string; status: string }> | undefined;
    if (campaignId) actions.push({ type: 'open_campaign', campaignId, label: 'Apri campagna' });
    if (pendingId && mutation.data.canPause !== false) {
      actions.push({ type: 'confirm_action', pendingActionId: pendingId, label: 'Metti in pausa' });
    }
    if (campaignId && mutation.data.hardDelete === false && mutation.data.choice !== false) {
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
    if (found) sentences.push(`${period === 'ieri' ? 'Ieri' : period} hai trovato ${found} nuov${found === '1' ? 'o' : 'i'} lead`);
    else sentences.push(`Il numero di nuovi lead per ${period} non è disponibile`);
    if (qualified) sentences.push(`${qualified} ${qualified === '1' ? 'è stato qualificato' : 'sono stati qualificati'}`);
    else sentences.push('il numero di qualificati non è disponibile');
    if (demos) sentences.push(`${demos} ${demos === '1' ? 'ha' : 'hanno'} una demo pronta`);
    else sentences.push('il numero di demo pronte non è disponibile');
    if (review) sentences.push(`${review} ${review === '1' ? 'è entrat' : 'sono entrat'}i in Review`);
    else sentences.push('il numero di item in Review non è disponibile');
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
      actions.push({ type: 'open_review', label: 'Apri Review' });
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
        const score = lead.discoveryScore == null ? 'score non disponibile' : `score ${lead.discoveryScore}`;
        return `${i + 1}. ${lead.name}${lead.city ? ` (${lead.city})` : ''} — ${score}`;
      });
      parts.push(
        `${cityLabel ? `I migliori lead a ${cityLabel[0]!.toUpperCase()}${cityLabel.slice(1)}` : 'I migliori lead'} secondo lo score attuale:\n${lines.join('\n')}`,
      );
      actions.push({
        type: 'show_leads',
        leadIds: ranked.slice(0, 8).map((l) => l.id),
        city: cityLabel ?? undefined,
        label: 'Mostra lead',
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
      if (campaign.status === 'PAUSED') {
        parts.push(`La campagna «${campaign.name}» è in pausa.`);
      } else {
        parts.push(`La campagna «${campaign.name}» è in stato ${campaign.status}.`);
      }
      if (campaign.id) {
        actions.push({ type: 'open_campaign', campaignId: campaign.id, label: 'Apri campagna' });
      }
    }
    if (blockers) {
      if (blockers.length === 0) {
        parts.push('Non risultano blocker aperti nei dati attuali.');
      } else {
        parts.push(
          `${blockers.length} blocker: ${blockers
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
        ? `In Review ci sono ${review.length} attività da controllare.`
        : 'La Review è vuota.',
    );
    if (review.length) actions.push({ type: 'open_review', label: 'Apri Review' });
  }

  const conversations = byName.get('list_conversations') as Array<{ leadName: string }> | undefined;
  if (conversations) {
    parts.push(
      conversations.length
        ? `Ci sono ${conversations.length} conversazioni in Messaggi.`
        : 'Non ci sono conversazioni in Messaggi.',
    );
    if (conversations.length) actions.push({ type: 'open_inbox', label: 'Apri messaggi' });
  }

  const demoInspect = byName.get('inspect_demo') as { publicPath?: string; leadName?: string } | undefined;
  if (demoInspect && typeof demoInspect.publicPath === 'string') {
    actions.push({ type: 'open_demo', path: demoInspect.publicPath, label: 'Apri demo' });
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
