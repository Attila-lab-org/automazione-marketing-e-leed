import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdminSessionTokenEdge } from '@/lib/auth/admin-session-edge';
import { ADMIN_SESSION_COOKIE, isPublicPath } from '@/lib/auth/constants';
import { areQaFixturesAllowed, isQaFixturePath } from '@/lib/qa/gate';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // QA fixtures: 404 in production unless ALLOW_PUBLIC_QA=1
  if (isQaFixturePath(pathname) && !areQaFixturesAllowed(process.env)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminSessionTokenEdge(token);
  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
