import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { isConsentChannel, openDeepCheck, saveDeepCheck } from '@/lib/security/deep-check';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

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

  if (typeof body?.notes === 'string' || body?.done === true) {
    try {
      const target = await saveDeepCheck(admin, {
        workspaceId: workspace.id,
        targetId: id,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        done: body?.done === true,
      });
      return NextResponse.json({
        ok: true,
        target,
        message: body?.done === true ? 'Controllo approfondito segnato come fatto.' : 'Note salvate.',
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
    const target = await openDeepCheck(admin, {
      workspaceId: workspace.id,
      targetId: id,
      channel: body.channel,
      note: typeof body.note === 'string' ? body.note : null,
    });
    return NextResponse.json({
      ok: true,
      target,
      message:
        'Controllo approfondito aperto. Lo fai tu con il titolare: Attila non attacca e non parte da solo.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Non ho potuto aprire il controllo.' },
      { status: 400 },
    );
  }
});
