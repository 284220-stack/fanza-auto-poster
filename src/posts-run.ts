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

const dryRunClient: XPostClient = {
  createPost: async () => { throw new Error('dry_run_client_must_not_post'); },
  createReply: async () => { throw new Error('dry_run_client_must_not_post'); }
};

function usesRealXApi(mode: 'preview' | 'execute') {
  return mode === 'execute' && (process.env.DRY_RUN ?? 'true').toLowerCase() === 'false';
}

async function main() {
  const options = parseScheduledPostRunArguments(process.argv.slice(2));
  const db = getDatabasePool() as unknown as { query<T>(sql: string): Promise<{ rows: T[] }> };
  const history = new PostHistoryRepository(db);
  const orchestrator = new PostExecutionOrchestrator(new PostEligibilityService(history), new ReplyRetryService(history), new ThreadPostPersistenceService(history));
  const service = new ScheduledPostRunService(() => new PostCandidateSelectionService(new DatabasePostCandidateRepository(db)).select(), orchestrator, new PostMediaResolver());
  const result = await service.run({ ...options, client: usesRealXApi(options.mode) ? createXApiPostClient() : dryRunClient });
  console.log(JSON.stringify({ mode: result.mode, selectedCount: result.selectedCount, successCount: result.successCount, partialSuccessCount: result.partialSuccessCount, blockedCount: result.blockedCount, retryReplyCount: result.retryReplyCount, dryRunCount: result.dryRunCount, failedCount: result.failedCount, items: result.items.map(({ productId, category, action, status, selectedOrder }) => ({ productId, category, action, status, selectedOrder })) }));
  process.exitCode = scheduledPostRunExitCode(result);
}

main().catch(() => {
  console.log(JSON.stringify({ status: 'failed' }));
  process.exitCode = 1;
}).finally(() => closeDatabasePool().catch(() => undefined));
