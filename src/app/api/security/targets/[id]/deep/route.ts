import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import {
  openDeepCheck,
  runDeepCheck,
  saveDeepCheck,
} from '@/lib/security/deep-check';
import { isConsentChannel } from '@/lib/security/deep-consent';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withAdmin(async (request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await ((ctx as { params: Promise<{ id: string }> }).params);
  const body = (await request.json().catch(() => null)) as {
    confirm?: unknown;
    channel?: unknown;
    note?: unknown;
    notes?: unknown;
    done?: unknown;
  } | null;

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  if (typeof body?.notes === 'string') {
    try {
      const target = await saveDeepCheck(admin, {
        workspaceId: workspace.id,
        targetId: id,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
      });
      return NextResponse.json({
        ok: true,
        target,
        message: 'Note salvate.',
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Salvataggio non riuscito.' },
        { status: 400 },
      );
    }
  }

  if (body?.confirm !== true) {
    return NextResponse.json(
      {
        error:
          'Per aprire il controllo approfondito conferma di aver ricevuto il permesso (telefono, lettera o di persona).',
      },
      { status: 400 },
    );
  }
  if (!isConsentChannel(body.channel)) {
    return NextResponse.json(
      { error: 'Indica come è arrivato il permesso: telefono, lettera o di persona.' },
      { status: 400 },
    );
  }

  try {
    await openDeepCheck(admin, {
      workspaceId: workspace.id,
      targetId: id,
      channel: body.channel,
      note: typeof body.note === 'string' ? body.note : null,
    });
    const result = await runDeepCheck(admin, {
      workspaceId: workspace.id,
      targetId: id,
    });
    return NextResponse.json({
      ok: true,
      audit: result.audit,
      analysis: result.analysis,
      message:
        `Secondo report completato: ${result.analysis.pages.length} pagine pubbliche controllate senza inviare moduli.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Non ho potuto aprire il controllo.' },
      { status: 400 },
    );
  }
});
