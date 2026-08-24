import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listWorkspaceLeads } from '@/lib/leads/discovery';
import { createManualLead } from '@/lib/leads/manual';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase non configurato', leads: [], source: 'unconfigured' },
      { status: 503 },
    );
  }

  const leads = await listWorkspaceLeads(process.env);
  return NextResponse.json({
    leads,
    source: 'supabase',
    count: leads.length,
  });
});

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as {
    businessName?: string;
    email?: string;
    websiteUrl?: string;
    phone?: string;
    city?: string;
    category?: string;
  };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  try {
    const lead = await createManualLead(admin, workspace.id, {
      businessName: body.businessName ?? '',
      email: body.email ?? '',
      websiteUrl: body.websiteUrl,
      phone: body.phone,
      city: body.city,
      category: body.category,
    });
    return NextResponse.json({ lead, message: 'Lead manuale creato' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Creazione lead fallita' },
      { status: 400 },
    );
  }
});
