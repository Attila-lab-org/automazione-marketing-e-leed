import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/lib/types/supabase-database';
import {
  assertAppUrlSafeForLiveSend,
  getAppUrlStatus,
} from '../../src/lib/app-url';
import { areQaFixturesAllowed, isQaFixturePath } from '../../src/lib/qa/gate';

type LeadsRow = Database['public']['Tables']['leads']['Row'];
type JobsRow = Database['public']['Tables']['automation_jobs']['Row'];
type LeadSourcesRow = Database['public']['Tables']['lead_sources']['Row'];
type MessagesRow = Database['public']['Tables']['messages']['Row'];

describe('Database contract / schema drift (P0.12)', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

  it('migrations 0001..0022 exist', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    expect(files[0]).toMatch(/^0001_/);
    expect(files.some((f) => f.startsWith('0016_'))).toBe(true);
    expect(files.some((f) => f.startsWith('0022_'))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(22);
  });

  it('leads: discovery_confidence exists; confidence column absent in types', () => {
    const leadKeys = null as unknown as keyof LeadsRow;
    void leadKeys;
    type HasDiscovery = 'discovery_confidence' extends keyof LeadsRow ? true : false;
    type HasConfidence = 'confidence' extends keyof LeadsRow ? true : false;
    const hasDiscovery: HasDiscovery = true;
    const hasConfidence: HasConfidence = false;
    expect(hasDiscovery).toBe(true);
    expect(hasConfidence).toBe(false);
  });

  it('automation_jobs: no updated_at in typed Row', () => {
    type HasUpdatedAt = 'updated_at' extends keyof JobsRow ? true : false;
    const hasUpdatedAt: HasUpdatedAt = false;
    expect(hasUpdatedAt).toBe(false);
    type HasNextRetry = 'next_retry_at' extends keyof JobsRow ? true : false;
    const hasNextRetry: HasNextRetry = true;
    expect(hasNextRetry).toBe(true);
  });

  it('lead_sources: query_snapshot present; raw_payload absent', () => {
    type HasQuery = 'query_snapshot' extends keyof LeadSourcesRow ? true : false;
    type HasRaw = 'raw_payload' extends keyof LeadSourcesRow ? true : false;
    expect(true as HasQuery).toBe(true);
    expect(false as HasRaw).toBe(false);
  });

  it('messages: no status column; has direction + sent_at', () => {
    type HasStatus = 'status' extends keyof MessagesRow ? true : false;
    type HasDirection = 'direction' extends keyof MessagesRow ? true : false;
    expect(false as HasStatus).toBe(false);
    expect(true as HasDirection).toBe(true);
  });

  it('migration SQL: leads lack bare confidence column; have discovery_confidence', () => {
    const sql = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/discovery_confidence/);
    // bare "confidence" on leads would be a drift risk — ensure we didn't add it as a column
    expect(sql).not.toMatch(/alter table public\.leads[\s\S]{0,200}add column[^;]*\bconfidence\b/i);
  });

  it('migration 0007 automation_jobs has no updated_at', () => {
    const sql = fs.readFileSync(
      path.join(migrationsDir, '0007_automation_jobs.sql'),
      'utf8',
    );
    expect(sql).toMatch(/create table if not exists public\.automation_jobs/i);
    // Column must not exist on automation_jobs (resume must not write it)
    const tableBlock = sql.match(
      /create table if not exists public\.automation_jobs \(([\s\S]*?)\);/i,
    );
    expect(tableBlock?.[1] ?? '').not.toMatch(/\bupdated_at\b/);
  });
});

describe('APP URL go-live gate (P0.9)', () => {
  it('MISSING when unset', () => {
    expect(getAppUrlStatus({} as NodeJS.ProcessEnv).status).toBe('MISSING');
  });

  it('INVALID localhost in production', () => {
    expect(
      getAppUrlStatus({
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv).status,
    ).toBe('INVALID');
  });

  it('READY for https production URL', () => {
    expect(
      getAppUrlStatus({
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv).status,
    ).toBe('READY');
  });

  it('assertAppUrlSafeForLiveSend fail-closed', () => {
    expect(() =>
      assertAppUrlSafeForLiveSend({
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/APP_URL_NOT_READY/);
  });
});

describe('QA fixtures gate (P0.1)', () => {
  it('detects qa fixture paths', () => {
    expect(isQaFixturePath('/demo/qa-test-mode/create')).toBe(true);
    expect(isQaFixturePath('/demo/qa-v3')).toBe(true);
    expect(isQaFixturePath('/demo/ristorante-demo')).toBe(false);
  });

  it('blocks fixtures in production without ALLOW_PUBLIC_QA', () => {
    expect(areQaFixturesAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      areQaFixturesAllowed({
        NODE_ENV: 'production',
        ALLOW_PUBLIC_QA: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
