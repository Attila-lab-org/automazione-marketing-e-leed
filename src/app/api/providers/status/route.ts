import { NextResponse } from 'next/server';
import { getProvidersStatus } from '@/lib/providers/status';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await getProvidersStatus(process.env);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status providers fallito';
    console.error('GET /api/providers/status', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
