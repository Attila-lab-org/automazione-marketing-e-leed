import { NextResponse } from 'next/server';
import { qualifyWorkspaceLeads } from '@/lib/leads/discovery';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';

/** Qualifica bulk di tutti i lead del workspace (idempotente). */
export async function POST() {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
    }
    const result = await qualifyWorkspaceLeads(process.env);
    return NextResponse.json({
      qualified: result.qualified,
      message: `${result.qualified} lead qualificati`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Qualification fallita';
    console.error('POST /api/leads/qualify', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
