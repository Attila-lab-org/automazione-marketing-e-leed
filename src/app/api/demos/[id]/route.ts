import { NextResponse } from 'next/server';
import { loadDemoById } from '@/lib/demos/load';
import { updateDemoContent } from '@/lib/demos/update';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
    }
    const { id } = await ctx.params;
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    const demo = await loadDemoById(admin, workspace.id, id);
    if (!demo) return NextResponse.json({ error: 'Demo non trovata' }, { status: 404 });
    return NextResponse.json({ demo });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lettura demo fallita';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
    }
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      branding?: Record<string, unknown>;
      content?: Record<string, unknown>;
      contact?: Record<string, unknown>;
    };
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    const demo = await updateDemoContent(admin, workspace.id, id, {
      branding: body.branding as never,
      content: body.content as never,
      contact: body.contact as never,
    });
    return NextResponse.json({ demo, message: 'Demo salvata' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Salvataggio demo fallito';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
