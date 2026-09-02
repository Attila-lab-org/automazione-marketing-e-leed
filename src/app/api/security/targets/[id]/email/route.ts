import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getResendProvider } from '@/lib/providers/resend';
import { loadSecurityReport } from '@/lib/security/run-audit';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { appendEmailComplianceFooter } from '@/lib/suppression/email-compliance';
import { buildUnsubscribeUrls } from '@/lib/suppression/unsubscribe-token';

export const runtime = 'nodejs';

export const POST = withAdmin(async (request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await ((ctx as { params: Promise<{ id: string }> }).params);
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Per inviare devi confermare. L’email non parte da sola.' },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const report = await loadSecurityReport(admin, workspace.id, id);
  if (!report) return NextResponse.json({ error: 'Report non trovato.' }, { status: 404 });
  if (!report.emailPreview) {
    return NextResponse.json(
      {
        error: report.hasActionableFindings
          ? 'Manca il report: analizza prima la pagina pubblica.'
          : 'Non preparo una mail: la prima analisi non contiene problemi o protezioni da sistemare.',
      },
      { status: 400 },
    );
  }
  const to = report.lead.email?.trim();
  if (!to || !to.includes('@')) {
    return NextResponse.json(
      { error: 'Questo contatto non ha un’email: non posso inviare.' },
      { status: 400 },
    );
  }

  const from = process.env.RESEND_FROM?.trim() || 'Attila Lab <hello@outreach.attila-lab.net>';
  const mode = (process.env.RESEND_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode === 'live' && !process.env.RESEND_FROM?.trim()) {
    return NextResponse.json({ error: 'Manca il mittente email (RESEND_FROM).' }, { status: 503 });
  }
  const unsubscribe = buildUnsubscribeUrls(workspace.id, report.lead.id, process.env);
  const finalHtml = appendEmailComplianceFooter(
    report.emailPreview.html,
    workspace.id,
    report.lead.id,
    process.env,
  );
  const finalText = `${report.emailPreview.text}

Atti-Lab usa informazioni professionali pubblicamente visibili per questa proposta dimostrativa. La demo viene eliminata dopo 36 ore.
Non vuoi ricevere altre email: ${unsubscribe.pageUrl}`;

  const auditId = report.audit?.id;
  if (!auditId) {
    return NextResponse.json({ error: 'Il primo report non è disponibile.' }, { status: 400 });
  }
  const { data: existing } = await admin
    .from('security_outreach')
    .select('*')
    .eq('target_id', report.target.id)
    .eq('audit_id', auditId)
    .in('status', mode === 'live' ? ['draft', 'sent'] : ['draft', 'sent', 'mock_sent'])
    .maybeSingle();
  if (existing?.status === 'sent' || existing?.status === 'mock_sent') {
    return NextResponse.json({
      ok: true,
      mock: existing.status === 'mock_sent',
      message:
        existing.status === 'mock_sent'
          ? 'Questa email è già stata provata: non è partita davvero.'
          : 'Questa email è già stata inviata. Non la invio due volte.',
    });
  }

  let outreach = existing;
  if (outreach) {
    const { data: refreshed, error: refreshError } = await admin
      .from('security_outreach')
      .update({
        to_email: to,
        subject: report.emailPreview.subject,
        body_html: finalHtml,
        error: null,
      })
      .eq('id', outreach.id)
      .select('*')
      .single();
    if (refreshError || !refreshed) {
      return NextResponse.json(
        { error: refreshError?.message ?? 'Recupero della bozza fallito.' },
        { status: 500 },
      );
    }
    outreach = refreshed;
  } else {
    const { data: created, error: insertError } = await admin
      .from('security_outreach')
      .insert({
        workspace_id: workspace.id,
        target_id: report.target.id,
        audit_id: auditId,
        to_email: to,
        subject: report.emailPreview.subject,
        body_html: finalHtml,
        status: 'draft',
      })
      .select('*')
      .single();
    if (insertError || !created) {
      return NextResponse.json(
        {
          error:
            insertError?.code === '23505'
              ? 'Un invio di questa email è già in corso.'
              : insertError?.message ?? 'Salvataggio bozza fallito.',
        },
        { status: insertError?.code === '23505' ? 409 : 500 },
      );
    }
    outreach = created;
  }

  try {
    const sent = await getResendProvider(process.env).send({
      from,
      to,
      subject: report.emailPreview.subject,
      html: finalHtml,
      text: finalText,
      idempotencyKey: `SECURITY_EMAIL:${outreach.id}`,
      headers: {
        'List-Unsubscribe': `<${unsubscribe.oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    const status = mode === 'live' ? 'sent' : 'mock_sent';
    await admin
      .from('security_outreach')
      .update({
        status,
        provider_message_id: sent.providerMessageId,
        sent_at: sent.sentAt,
      })
      .eq('id', outreach.id);
    await admin
      .from('security_targets')
      .update({
        status: 'email_sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.target.id);
    return NextResponse.json({
      ok: true,
      mock: status === 'mock_sent',
      message:
        status === 'mock_sent'
          ? 'In prova: l’email non è partita davvero. In live partirebbe dopo la conferma.'
          : 'Email inviata.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invio non riuscito';
    await admin
      .from('security_outreach')
      .update({ status: 'failed', error: message })
      .eq('id', outreach.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
