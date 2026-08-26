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
  const provider = getResendProvider(process.env);
  try {
    const event = provider.parseWebhookEvent(rawBody, svixHeaders(request));
    payload =
      event.payload && typeof event.payload.type === 'string'
        ? event.payload
        : {
            type: event.type === 'REPLIED' ? 'email.received' : `email.${event.type.toLowerCase()}`,
            data: {
              email_id: event.providerMessageId,
              to: event.recipient ? [event.recipient] : [],
            },
            created_at: event.occurredAt,
          };
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Firma webhook non valida',
        detail: error instanceof Error ? error.message : 'WEBHOOK_VERIFICATION_FAILED',
      },
      { status: 401 },
    );
  }

  if (payload.type === 'email.received') {
    const metadata =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : {};
    const emailId = typeof metadata.email_id === 'string' ? metadata.email_id : null;
    if (!emailId) {
      return NextResponse.json({ error: 'email_id inbound mancante' }, { status: 400 });
    }
    try {
      const received = await provider.retrieveReceivedEmail(emailId);
      payload = {
        ...payload,
        data: {
          ...metadata,
          email_id: received.id,
          from: received.from,
          to: received.to,
          subject: received.subject,
          text: received.text,
          html: received.html,
          headers: received.headers,
          message_id: received.messageId,
        },
      };
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Contenuto email inbound non recuperabile',
          detail: error instanceof Error ? error.message : 'INBOUND_RETRIEVE_FAILED',
        },
        { status: 502 },
      );
    }
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
