import type { PostEligibilityService } from './post-eligibility.js';
import type { ReplyRetryService } from './reply-retry.js';
import type { ThreadPostPersistenceService } from './thread-post-persistence.js';
import type { XPostClient } from './thread-post-execution.js';
import type { PostMedia } from './post-media.js';

export type PostExecutionInput = { productId: number; parentPostText: string; affiliateUrl?: string; media?: PostMedia; dryRun?: boolean; client: XPostClient };
export type PostExecutionAction = 'new_thread' | 'retry_reply' | 'blocked' | 'dry_run';
export type PostExecutionStatus = 'success' | 'partial_success' | 'failed' | 'blocked' | 'dry_run' | 'already_running' | 'not_found';
export type PostExecutionResult = { action: PostExecutionAction; status: PostExecutionStatus; productId: number; eligibilityReason: string; parentPostId?: string; replyPostId?: string; retryReplyPossible: boolean; startedAt: string; completedAt: string; warnings: string[]; errors: string[] };
export class PostExecutionOrchestrator {
  private readonly running = new Set<number>();
  constructor(private readonly eligibility: PostEligibilityService, private readonly retry: ReplyRetryService, private readonly thread: ThreadPostPersistenceService) {}
  async run(input: PostExecutionInput): Promise<PostExecutionResult> {
    const startedAt = new Date().toISOString(); const done = (result: Omit<PostExecutionResult, 'startedAt' | 'completedAt'>) => ({ ...result, startedAt, completedAt: new Date().toISOString() });
    const invalid = !Number.isInteger(input.productId) || input.productId < 1 ? 'invalid_product_id' : !input.parentPostText.trim() ? 'empty_parent_post' : !input.parentPostText.startsWith('【PR】\n') ? 'pr_disclosure_missing' : /https?:\/\//iu.test(input.parentPostText) ? 'parent_post_contains_url' : undefined;
    if (invalid) return done({ action: 'blocked', status: 'failed', productId: input.productId, eligibilityReason: 'invalid_input', retryReplyPossible: false, warnings: [], errors: [invalid] });
    if (this.running.has(input.productId)) return done({ action: 'blocked', status: 'already_running', productId: input.productId, eligibilityReason: 'already_running', retryReplyPossible: false, warnings: [], errors: [] });
    this.running.add(input.productId);
    try {
      const eligibility = await this.eligibility.check({ productId: input.productId });
      if (eligibility.reason === 'pending_reply_exists') {
        const result = await this.retry.run({ productId: input.productId, affiliateUrl: input.affiliateUrl, dryRun: input.dryRun, client: input.client });
        const status = result.status === 'not_retryable' ? 'failed' : result.status;
        return done({ action: input.dryRun ? 'dry_run' : 'retry_reply', status, productId: input.productId, eligibilityReason: eligibility.reason, parentPostId: result.parentPostId, replyPostId: result.replyPostId, retryReplyPossible: result.status !== 'success', warnings: result.warnings, errors: result.errors });
      }
      if (!eligibility.eligible) return done({ action: 'blocked', status: 'blocked', productId: input.productId, eligibilityReason: eligibility.reason, retryReplyPossible: false, warnings: [], errors: [] });
      const result = await this.thread.run(input);
      return done({ action: result.status === 'dry_run' ? 'dry_run' : 'new_thread', status: result.status, productId: input.productId, eligibilityReason: eligibility.reason, parentPostId: result.parentPostId, replyPostId: result.replyPostId, retryReplyPossible: result.retryReplyPossible, warnings: result.warnings, errors: result.errors });
    } catch { return done({ action: 'blocked', status: 'failed', productId: input.productId, eligibilityReason: 'internal_error', retryReplyPossible: false, warnings: [], errors: ['post_execution_failed'] }); }
    finally { this.running.delete(input.productId); }
  }
}
