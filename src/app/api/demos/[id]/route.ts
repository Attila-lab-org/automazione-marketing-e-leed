import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { loadDemoById } from '@/lib/demos/load';
import { updateDemoContent } from '@/lib/demos/update';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await (ctx as RouteCtx).params;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const demo = await loadDemoById(admin, workspace.id, id);
  if (!demo) return NextResponse.json({ error: 'Demo non trovata' }, { status: 404 });
  return NextResponse.json({ demo });
});

export const PATCH = withAdmin(async (request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await (ctx as RouteCtx).params;
  const body = (await request.json()) as {
    branding?: Record<string, unknown>;
    content?: Record<string, unknown>;
    contact?: Record<string, unknown>;
    signals?: Record<string, unknown>;
  };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const demo = await updateDemoContent(admin, workspace.id, id, body);
  return NextResponse.json({ demo, message: 'Demo salvata' });
});
