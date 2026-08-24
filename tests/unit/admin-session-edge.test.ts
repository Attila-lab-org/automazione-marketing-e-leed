import { describe, expect, it } from 'vitest';
import { createAdminSessionToken } from '../../src/lib/auth/admin-session';
import { verifyAdminSessionTokenEdge } from '../../src/lib/auth/admin-session-edge';

const env = {
  ADMIN_SESSION_SECRET: 'test-secret-for-edge-middleware',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

describe('admin session edge verify', () => {
  it('accetta token firmato dal server node', async () => {
    const token = createAdminSessionToken('owner@example.com', env);
    const payload = await verifyAdminSessionTokenEdge(token, env);
    expect(payload?.sub).toBe('owner@example.com');
  });

  it('rifiuta token con firma invalida', async () => {
    const token = createAdminSessionToken('owner@example.com', env);
    const payload = await verifyAdminSessionTokenEdge(`${token}x`, env);
    expect(payload).toBeNull();
  });
});
