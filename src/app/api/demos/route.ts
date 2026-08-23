import { NextResponse } from 'next/server';
import { createDemoFromLead } from '@/lib/demos/create';
import { listDemos } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function unconfigured() {
  return NextResponse.json(
    { error: 'Supabase non configurato', demos: [] },
    { status: 503 },
  );
}

export async function GET() {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return unconfigured();
    }
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    const demos = await listDemos(admin, workspace.id);
    return NextResponse.json({ demos, count: demos.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Elenco demo fallito';
    return NextResponse.json({ error: message, demos: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return unconfigured();
    }
    const body = (await request.json()) as { leadId?: string; templateKey?: string };
    if (!body.leadId) {
      return NextResponse.json({ error: 'leadId obbligatorio' }, { status: 400 });
    }
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    const demo = await createDemoFromLead(admin, workspace.id, {
      leadId: body.leadId,
      templateKey: body.templateKey,
    });
    return NextResponse.json({
      demo,
      message: demo.reused ? 'Demo esistente riaperta' : 'Demo creata',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Creazione demo fallita';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
