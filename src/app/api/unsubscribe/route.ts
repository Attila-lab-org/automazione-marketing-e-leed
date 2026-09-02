import { NextResponse } from 'next/server';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { stopLeadSequences, suppressLeadEmail } from '@/lib/sales/stop';
import { verifyUnsubscribeToken } from '@/lib/suppression/unsubscribe-token';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Servizio non disponibile.' }, { status: 503 });
  }
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let payload;
  try {
    payload = verifyUnsubscribeToken(token, process.env);
  } catch {
    return NextResponse.json({ error: 'Servizio non configurato.' }, { status: 503 });
  }
  if (!payload) {
    return NextResponse.json({ error: 'Link non valido.' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient(process.env);
  const result = await suppressLeadEmail(
    admin,
    payload.workspaceId,
    payload.leadId,
    'UNSUBSCRIBE',
  );
  await stopLeadSequences(admin, payload.workspaceId, payload.leadId);

  return NextResponse.json({
    ok: true,
    suppressed: result.suppressed,
    message: 'Non riceverai altre email commerciali da Atti-Lab.',
  });
}
