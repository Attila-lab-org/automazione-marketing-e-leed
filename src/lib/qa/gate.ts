/**
 * Whether internal QA fixture routes may be served.
 * Never public in production unless ALLOW_PUBLIC_QA=1.
 */
export function isQaFixturePath(pathname: string): boolean {
  return (
    pathname.startsWith('/demo/qa-') ||
    pathname === '/demo/qa-v3' ||
    pathname.startsWith('/demo/qa-v3/') ||
    pathname.startsWith('/demo/qa-test-mode')
  );
}

export function areQaFixturesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_PUBLIC_QA === '1') return true;
  return (env.NODE_ENV ?? 'development') !== 'production';
}
