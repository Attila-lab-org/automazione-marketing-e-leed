import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import {
  DEFAULT_CLASSIFY_TEST_TEXT,
  runClassifyIntent,
} from '@/lib/ai/run';
import { createSupabaseAiRunStore } from '@/lib/ai/persist';
import { consumeAiTestRateLimit } from '@/lib/ai/rate-limit';
import { assertNoSecrets, getPublicAiReadiness } from '@/lib/ai/readiness';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const POST = withAdmin(async (request: Request) => {
  if (!consumeAiTestRateLimit()) {
    return NextResponse.json(
      { error: 'Troppe prove AI. Riprova tra un minuto.' },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database non configurato' }, { status: 503 });
  }

  const readiness = getPublicAiReadiness(process.env);
  if (!readiness.modeValid) {
    return NextResponse.json({ error: readiness.detail }, { status: 400 });
  }
  if (readiness.mode === 'openai' && !readiness.apiKeyConfigured) {
    return NextResponse.json({ error: readiness.detail }, { status: 400 });
  }

  let text = DEFAULT_CLASSIFY_TEST_TEXT;
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text === 'string' && body.text.trim()) {
      text = body.text.trim().slice(0, 4000);
    }
  } catch {
    // body vuoto: usa il testo di prova
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const result = await runClassifyIntent(
    { text, languageHint: 'it' },
    {
      workspaceId: workspace.id,
      persist: createSupabaseAiRunStore(admin),
      source: 'settings_test',
    },
  );

  const payload = {
    output: result.output,
    run: result.run,
    persisted: result.persisted,
    route: result.route,
    providerMode: result.providerMode,
    readiness,
  };
  assertNoSecrets(payload);

  if (result.run?.status === 'timeout') {
    return NextResponse.json(payload, { status: 504 });
  }
  if (result.run?.status === 'invalid_output') {
    return NextResponse.json(payload, { status: 422 });
  }
  if (!result.output) {
    return NextResponse.json(payload, { status: 502 });
  }
  return NextResponse.json(payload);
});
