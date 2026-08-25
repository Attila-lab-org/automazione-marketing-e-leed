import { withAdmin } from '@/lib/api/with-admin';
import { createSupabaseAiRunStore } from '@/lib/ai/persist';
import { consumeOperatorChatRateLimit } from '@/lib/ai/rate-limit';
import { assertNoSecrets } from '@/lib/ai/readiness';
import { createSupabaseOperatorData } from '@/lib/ai/operator/data';
import { parseOperatorEnvelope } from '@/lib/ai/operator/envelope';
import {
  appendOperatorMessage,
  createOperatorSession,
  getOperatorSession,
} from '@/lib/ai/operator/sessions';
import { runOperatorTurn } from '@/lib/ai/operator/turn';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function sse(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const POST = withAdmin(async (request: Request) => {
  if (!consumeOperatorChatRateLimit()) {
    return Response.json({ error: 'Troppe domande. Riprova tra un minuto.' }, { status: 429 });
  }
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Database non configurato' }, { status: 503 });
  }

  const body = (await request.json()) as {
    message?: unknown;
    sessionId?: unknown;
    envelope?: unknown;
  };
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!message) {
    return Response.json({ error: 'Scrivi una domanda' }, { status: 400 });
  }

  const envelope = parseOperatorEnvelope(body.envelope);
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  let sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  if (sessionId) {
    const existing = await getOperatorSession(admin, workspace.id, sessionId);
    if (!existing) sessionId = null;
  }
  if (!sessionId) {
    const created = await createOperatorSession(admin, workspace.id, envelope);
    sessionId = created.id;
  }

  await appendOperatorMessage(admin, {
    workspaceId: workspace.id,
    sessionId,
    role: 'user',
    content: message,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        assertNoSecrets(event);
        controller.enqueue(encoder.encode(sse(event)));
      };
      try {
        let assistant = '';
        let actions: unknown[] = [];
        let runId: string | null = null;
        let toolTrace: unknown[] = [];
        for await (const event of runOperatorTurn({
          workspaceId: workspace.id,
          sessionId: sessionId!,
          question: message,
          envelope,
          data: createSupabaseOperatorData(admin, workspace.id),
          persist: createSupabaseAiRunStore(admin),
        })) {
          if (event.type === 'tool_done') {
            toolTrace = [...toolTrace, { name: event.name, ok: event.ok }];
          }
          if (event.type === 'done') {
            assistant = event.reply;
            actions = event.actions;
            runId = event.run?.id ?? null;
          }
          send(event);
        }
        if (assistant) {
          await appendOperatorMessage(admin, {
            workspaceId: workspace.id,
            sessionId: sessionId!,
            role: 'assistant',
            content: assistant,
            actions: actions as never,
            toolTrace,
            aiRunId: runId,
          });
        }
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Errore Attila AI',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});
