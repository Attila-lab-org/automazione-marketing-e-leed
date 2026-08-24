import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getProvidersStatus } from '@/lib/providers/status';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  const status = await getProvidersStatus(process.env);
  return NextResponse.json(status);
});
