import { NextResponse } from 'next/server';
import { adminSessionCookieOptions } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';

export async function POST() {
  const opts = adminSessionCookieOptions();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(opts.name, '', { ...opts, maxAge: 0 });
  return res;
}
