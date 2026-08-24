import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { qualifyWorkspaceLeads } from '@/lib/leads/discovery';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';

export const POST = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const result = await qualifyWorkspaceLeads(process.env);
  return NextResponse.json({
    qualified: result.qualified,
    message: `${result.qualified} lead qualificati`,
  });
});
