import { generateReplyTemplate } from './reply-template.js';
import type { PostHistoryRepository } from './post-history.js';
import type { XPostClient } from './thread-post-execution.js';

export type RetryReplyInput = { productId: number; affiliateUrl?: string; dryRun?: boolean; client: XPostClient };
export type RetryReplyResult = { status: 'success' | 'failed' | 'dry_run' | 'already_running' | 'not_found' | 'not_retryable'; productId: number; parentPostId?: string; replyPostId?: string; warnings: string[]; errors: string[] };
export class ReplyRetryService {
  private readonly running = new Set<number>();
  constructor(private readonly history: PostHistoryRepository) {}
  async run(input: RetryReplyInput): Promise<RetryReplyResult> {
    if (!Number.isInteger(input.productId) || input.productId < 1) return { status: 'failed', productId: input.productId, warnings: [], errors: ['invalid_input'] };
    if (this.running.has(input.productId)) return { status: 'already_running', productId: input.productId, warnings: [], errors: [] };
    const parent = await this.history.findPendingReply(input.productId);
    if (!parent) return { status: 'not_found', productId: input.productId, warnings: [], errors: [] };
    if (!parent.xPostId) return { status: 'not_retryable', productId: input.productId, warnings: [], errors: [] };
    const reply = generateReplyTemplate({ affiliateUrl: input.affiliateUrl });
    if (!reply.reply) return { status: 'failed', productId: input.productId, parentPostId: parent.xPostId, warnings: reply.warnings, errors: ['invalid_reply'] };
    if (input.dryRun ?? (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false') return { status: 'dry_run', productId: input.productId, parentPostId: parent.xPostId, warnings: [], errors: [] };
    this.running.add(input.productId);
    try { try { const posted = await input.client.createReply(reply.reply.text, parent.xPostId); await this.history.create({ productId: input.productId, xPostId: posted.postId, postType: 'reply', executionStatus: 'posted', parentHistoryId: parent.id }); await this.history.markReplyCompleted(parent.id); return { status: 'success', productId: input.productId, parentPostId: parent.xPostId, replyPostId: posted.postId, warnings: [], errors: [] }; } catch { return { status: 'failed', productId: input.productId, parentPostId: parent.xPostId, warnings: [], errors: ['reply_post_failed'] }; } } finally { this.running.delete(input.productId); }
  }
}
