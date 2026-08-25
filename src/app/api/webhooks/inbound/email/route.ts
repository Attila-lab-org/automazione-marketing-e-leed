import { NextResponse } from 'next/server';
import { getResendProvider } from '@/lib/providers/resend';
import {
  getEmailInboundReadiness,
  normalizeResendInboundPayload,
  persistEmailReply,
} from '@/lib/inbound/email';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function svixHeaders(request: Request): string {
  return JSON.stringify({
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    readiness: getEmailInboundReadiness(),
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const rawBody = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    const provider = getResendProvider(process.env);
    try {
      const event = provider.parseWebhookEvent(rawBody, svixHeaders(request));
      payload = { type: `email.${event.type.toLowerCase()}`, data: event.payload, created_at: event.occurredAt };
    } catch {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
      if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) {
        return NextResponse.json(
          { error: 'RESEND_WEBHOOK_SECRET mancante', readiness: getEmailInboundReadiness() },
          { status: 401 },
        );
      }
    }
  } catch {
    return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });
  }

  const inbound = normalizeResendInboundPayload(payload);
  if (!inbound) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'UNMAPPED_EVENT' });
  }
  if (inbound.kind === 'delivery') {
    return NextResponse.json({ ok: true, kind: 'delivery', type: inbound.type });
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const result = await persistEmailReply({ admin, workspaceId: workspace.id, inbound });
  return NextResponse.json({ persisted: result.ok, ...result, kind: 'reply' });
}
