import { NextResponse } from 'next/server';
import { listWorkspaceLeads } from '@/lib/leads/discovery';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lettura lead fallita';
    console.error('GET /api/leads', message);
    return NextResponse.json({ error: message, leads: [] }, { status: 500 });
  }
}
