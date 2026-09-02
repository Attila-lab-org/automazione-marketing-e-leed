import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getResendProvider } from '@/lib/providers/resend';
import { loadSecurityReport } from '@/lib/security/run-audit';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

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
        error: report.hasConfirmedProblems
          ? 'Manca il report: analizza prima la pagina pubblica.'
          : 'Non invio un allarme: la prima analisi non contiene problemi confermati.',
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

  const { data: outreach, error: insertError } = await admin
    .from('security_outreach')
    .insert({
      workspace_id: workspace.id,
      target_id: report.target.id,
      audit_id: report.audit?.id ?? null,
      to_email: to,
      subject: report.emailPreview.subject,
      body_html: report.emailPreview.html,
      status: 'draft',
    })
    .select('*')
    .single();
  if (insertError || !outreach) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Salvataggio bozza fallito.' },
      { status: 500 },
    );
  }

  try {
    const sent = await getResendProvider(process.env).send({
      from,
      to,
      subject: report.emailPreview.subject,
      html: report.emailPreview.html,
      text: report.emailPreview.text,
      idempotencyKey: `SECURITY_EMAIL:${outreach.id}`,
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
