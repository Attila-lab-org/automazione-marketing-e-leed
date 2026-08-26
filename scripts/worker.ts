import { loadEnvConfig } from '@next/env';
import { runJobBatch } from '../src/lib/jobs/handlers';
import { createAdminSupabaseClient, isSupabaseConfigured } from '../src/lib/supabase/client';
import { ensureDefaultWorkspace } from '../src/lib/workspace';

loadEnvConfig(process.cwd());

const idleMs = Math.max(250, Number(process.env.JOB_WORKER_IDLE_MS ?? 1_000));
const batchSize = Math.max(1, Math.min(100, Number(process.env.JOB_WORKER_BATCH_SIZE ?? 20)));
const workerId = `standalone-${process.pid}`;
let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Worker non avviato: configurazione Supabase service role mancante');
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  console.log(
    `[worker] ${workerId} avviato · batch=${batchSize} · concurrency=${process.env.JOB_WORKER_CONCURRENCY ?? 4}`,
  );

  while (!stopping) {
    try {
      const results = await runJobBatch(
        admin,
        workspace.id,
        workerId,
        batchSize,
        process.env,
      );
      if (results.length === 0) await sleep(idleMs);
    } catch (error) {
      console.error('[worker] ciclo fallito', error instanceof Error ? error.message : error);
      await sleep(5_000);
    }
  }
  console.log(`[worker] ${workerId} arrestato`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
