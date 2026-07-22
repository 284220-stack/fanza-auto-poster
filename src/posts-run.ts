import { closeDatabasePool, getDatabasePool } from './db/pool.js';
import { DatabasePostCandidateRepository, PostCandidateSelectionService } from './post-candidate-selection.js';
import { PostExecutionOrchestrator } from './post-execution-orchestrator.js';
import { PostEligibilityService } from './post-eligibility.js';
import { PostHistoryRepository } from './post-history.js';
import { ReplyRetryService } from './reply-retry.js';
import { ScheduledPostRunService } from './scheduled-post-run.js';
import { parseScheduledPostRunArguments, scheduledPostRunExitCode } from './scheduled-post-run-cli.js';
import { ThreadPostPersistenceService } from './thread-post-persistence.js';
import type { XPostClient } from './thread-post-execution.js';
import { createXApiPostClient } from './x-api-adapter.js';
import { PostMediaResolver } from './post-media.js';
import { PostgresAdvisoryRunLock, SCHEDULER_RUN_LOCK_KEY, type AdvisoryLockPool } from './run-lock.js';
import { canRunSchedulerLive } from './scheduler-status.js';
import { SchedulerDailyGuardRepository } from './scheduler-daily-guard.js';

const dryRunClient: XPostClient = {
  createPost: async () => { throw new Error('dry_run_client_must_not_post'); },
  createReply: async () => { throw new Error('dry_run_client_must_not_post'); }
};

function usesRealXApi(mode: 'preview' | 'execute') {
  return mode === 'execute' && (process.env.DRY_RUN ?? 'true').toLowerCase() === 'false';
}

async function main() {
  const options = parseScheduledPostRunArguments(process.argv.slice(2));
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  if (options.mode === 'execute' && (process.env.DRY_RUN ?? 'true').toLowerCase() === 'false' && !canRunSchedulerLive(environment)) {
    console.log(JSON.stringify({ mode: options.mode, selectedCount: 0, failedCount: 0, alreadyRunning: false, errors: ['scheduler_live_configuration_incomplete'], items: [] }));
    process.exitCode = 1;
    return;
  }
  const db = getDatabasePool() as unknown as { query<T>(sql: string): Promise<{ rows: T[] }> } & AdvisoryLockPool;
  const lock = new PostgresAdvisoryRunLock(db, SCHEDULER_RUN_LOCK_KEY);
  if (!await lock.acquire()) {
    console.log(JSON.stringify({ mode: options.mode, selectedCount: 0, failedCount: 0, alreadyRunning: true, items: [] }));
    process.exitCode = 1;
    return;
  }
  try {
    const live = usesRealXApi(options.mode);
    if (live && !await new SchedulerDailyGuardRepository(db).reserve()) {
      console.log(JSON.stringify({ mode: options.mode, selectedCount: 0, failedCount: 0, alreadyRunning: false, errors: ['scheduler_already_ran_today'], items: [] }));
      process.exitCode = 1;
      return;
    }
    const history = new PostHistoryRepository(db);
    const orchestrator = new PostExecutionOrchestrator(new PostEligibilityService(history), new ReplyRetryService(history), new ThreadPostPersistenceService(history));
    const service = new ScheduledPostRunService(() => new PostCandidateSelectionService(new DatabasePostCandidateRepository(db)).select(), orchestrator, new PostMediaResolver());
    const result = await service.run({ ...options, client: live ? createXApiPostClient() : dryRunClient });
    console.log(JSON.stringify({ mode: result.mode, selectedCount: result.selectedCount, successCount: result.successCount, partialSuccessCount: result.partialSuccessCount, blockedCount: result.blockedCount, retryReplyCount: result.retryReplyCount, dryRunCount: result.dryRunCount, failedCount: result.failedCount, alreadyRunning: result.alreadyRunning, items: result.items.map(({ productId, category, action, status, selectedOrder }) => ({ productId, category, action, status, selectedOrder })) }));
    process.exitCode = scheduledPostRunExitCode(result);
  } finally { await lock.release(); }
}

main().catch(() => {
  console.log(JSON.stringify({ status: 'failed' }));
  process.exitCode = 1;
}).finally(() => closeDatabasePool().catch(() => undefined));
