import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { analyzeManualSite } from '@/lib/security/manual-site';
import { UrlNotAllowedError } from '@/lib/security/url-guard';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { url?: unknown; name?: unknown } | null;
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'Scrivi l’indirizzo del sito da controllare.' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  try {
    const result = await analyzeManualSite(admin, workspace.id, { url, name: name || null });
    return NextResponse.json({
      ...result,
      message: result.ok
        ? `Report pronto per ${result.name}.`
        : result.error ?? `Ho provato ad aprire ${result.name}, ma la pagina non ha risposto.`,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Controllo non riuscito';
    return NextResponse.json(
      { error: message },
      { status: reason instanceof UrlNotAllowedError ? 400 : 500 },
    );
  }
});
