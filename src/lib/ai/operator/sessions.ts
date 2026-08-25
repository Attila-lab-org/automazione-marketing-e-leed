import type { Json } from '@/lib/types/database';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { OperatorAction } from './actions';
import type { OperatorEnvelope } from './envelope';

export type OperatorSessionRecord = {
  id: string;
  title: string;
  createdAt: string;
};

export type OperatorMessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: OperatorAction[];
  createdAt: string;
};

export async function createOperatorSession(
  admin: AppSupabaseClient,
  workspaceId: string,
  envelope: OperatorEnvelope,
): Promise<OperatorSessionRecord> {
  const { data, error } = await admin
    .from('ai_operator_sessions')
    .insert({
      workspace_id: workspaceId,
      title: 'Attila AI',
      context: envelope as unknown as Json,
    })
    .select('id, title, created_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Sessione AI non creata');
  return { id: data.id, title: data.title, createdAt: data.created_at };
}

export async function getOperatorSession(
  admin: AppSupabaseClient,
  workspaceId: string,
  sessionId: string,
): Promise<OperatorSessionRecord | null> {
  const { data, error } = await admin
    .from('ai_operator_sessions')
    .select('id, title, created_at')
    .eq('workspace_id', workspaceId)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id, title: data.title, createdAt: data.created_at };
}

export async function listOperatorMessages(
  admin: AppSupabaseClient,
  workspaceId: string,
  sessionId: string,
): Promise<OperatorMessageRecord[]> {
  const { data, error } = await admin
    .from('ai_operator_messages')
    .select('id, role, content, actions, created_at')
    .eq('workspace_id', workspaceId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    actions: Array.isArray(row.actions) ? (row.actions as OperatorAction[]) : [],
    createdAt: row.created_at,
  }));
}

export async function appendOperatorMessage(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    actions?: OperatorAction[];
    toolTrace?: unknown;
    aiRunId?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from('ai_operator_messages').insert({
    workspace_id: input.workspaceId,
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    actions: (input.actions ?? []) as unknown as Json,
    tool_trace: (input.toolTrace ?? []) as unknown as Json,
    ai_run_id: input.aiRunId ?? null,
  });
  if (error) throw new Error(error.message);
  await admin
    .from('ai_operator_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('workspace_id', input.workspaceId);
}
