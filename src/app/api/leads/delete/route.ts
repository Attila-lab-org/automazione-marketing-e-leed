import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { leadIds?: unknown } | null;
  const leadIds = Array.isArray(body?.leadIds)
    ? [...new Set(body.leadIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  if (!leadIds.length || leadIds.length > 100) {
    return NextResponse.json(
      { error: 'Seleziona da 1 a 100 contatti da eliminare' },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const [{ data: campaignLinks }, { data: messages }, { data: threads }] = await Promise.all([
    admin
      .from('campaign_leads')
      .select('lead_id')
      .eq('workspace_id', workspace.id)
      .in('lead_id', leadIds),
    admin
      .from('messages')
      .select('lead_id')
      .eq('workspace_id', workspace.id)
      .in('lead_id', leadIds),
    admin
      .from('message_threads')
      .select('lead_id')
      .eq('workspace_id', workspace.id)
      .in('lead_id', leadIds),
  ]);

  const usedIds = new Set([
    ...(campaignLinks ?? []).map((row) => row.lead_id),
    ...(messages ?? []).map((row) => row.lead_id),
    ...(threads ?? []).map((row) => row.lead_id),
  ]);
  const blocked = leadIds.filter((id) => usedIds.has(id));
  const deletable = leadIds.filter((id) => !usedIds.has(id));

  if (deletable.length) {
    const { error: linkError } = await admin
      .from('commercial_goal_links')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('entity_type', 'lead')
      .in('entity_id', deletable);
    if (linkError) {
      return NextResponse.json({ error: `Collegamenti obiettivo: ${linkError.message}` }, { status: 500 });
    }

    const { error: deleteError } = await admin
      .from('leads')
      .delete()
      .eq('workspace_id', workspace.id)
      .in('id', deletable);
    if (deleteError) {
      return NextResponse.json({ error: `Eliminazione contatti: ${deleteError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    deleted: deletable,
    blocked,
    message: blocked.length
      ? `${deletable.length} contatti eliminati. ${blocked.length} conservati perché hanno campagne o messaggi.`
      : `${deletable.length} contatti eliminati.`,
  });
});
