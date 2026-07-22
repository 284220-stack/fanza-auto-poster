import { closeDatabasePool, getDatabasePool } from './db/pool.js';
import { DatabasePostCandidateRepository, PostCandidateSelectionService } from './post-candidate-selection.js';
import { PostExecutionOrchestrator } from './post-execution-orchestrator.js';
import { PostEligibilityService } from './post-eligibility.js';
import { PostHistoryRepository } from './post-history.js';
import { ReplyRetryService } from './reply-retry.js';
import { ThreadPostPersistenceService } from './thread-post-persistence.js';
import { PostMediaResolver } from './post-media.js';
import { createXApiPostClient } from './x-api-adapter.js';
import { LiveOneGuardRepository } from './live-one-guard.js';
import { LiveOnePostService } from './live-one-post.js';
import { canExecuteLiveOne, parseLiveOneArguments } from './live-one-post-cli.js';
import { LIVE_ONE_RUN_LOCK_KEY, PostgresAdvisoryRunLock, type AdvisoryLockPool } from './run-lock.js';
import type { Queryable } from './actresses.js';

async function main() {
  const options = parseLiveOneArguments(process.argv.slice(2));
  const pool = getDatabasePool() as unknown as Queryable & AdvisoryLockPool;
  const history = new PostHistoryRepository(pool);
  const orchestrator = new PostExecutionOrchestrator(new PostEligibilityService(history), new ReplyRetryService(history), new ThreadPostPersistenceService(history));
  const selection = new PostCandidateSelectionService(new DatabasePostCandidateRepository(pool));
  const service = new LiveOnePostService(
    () => selection.select({ saleLimit: 0, favoriteSaleLimit: 0, actressLimit: 1 }),
    orchestrator,
    new PostMediaResolver(),
    new LiveOneGuardRepository(pool)
  );

  if (!options.execute) {
    const preflight = await service.preflight();
    console.log(JSON.stringify({ mode: 'preflight', ...preflight }));
    process.exitCode = preflight.ready ? 0 : 1;
    return;
  }
  if (!canExecuteLiveOne(options)) {
    console.log(JSON.stringify({ mode: 'execute', executed: false, errors: ['live_one_safety_confirmation_missing'] }));
    process.exitCode = 1;
    return;
  }
  const lock = new PostgresAdvisoryRunLock(pool, LIVE_ONE_RUN_LOCK_KEY);
  if (!await lock.acquire()) {
    console.log(JSON.stringify({ mode: 'execute', executed: false, errors: ['already_running'] }));
    process.exitCode = 1;
    return;
  }
  try {
    const result = await service.execute(options.confirmationToken!, createXApiPostClient());
    console.log(JSON.stringify({ mode: 'execute', executed: result.executed, productId: result.preflight.productId, category: result.preflight.category, status: result.result?.status, action: result.result?.action, errors: result.errors }));
    process.exitCode = result.executed && result.result?.status === 'success' ? 0 : 1;
  } finally { await lock.release(); }
}

main().catch(() => {
  console.log(JSON.stringify({ mode: 'failed', executed: false, errors: ['live_one_failed'] }));
  process.exitCode = 1;
}).finally(() => closeDatabasePool().catch(() => undefined));
