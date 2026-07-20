import type { XPostClient } from './thread-post-execution.js';
import { generateReplyTemplate } from './reply-template.js';
import type { PostHistoryRepository } from './post-history.js';

export type PersistedThreadPostInput = { productId: number; parentPostText: string; affiliateUrl?: string; dryRun?: boolean; client: XPostClient };
export type PersistedThreadPostResult = { status: 'success' | 'partial_success' | 'failed' | 'dry_run' | 'already_running'; productId: number; parentPostId?: string; replyPostId?: string; parentHistorySaved: boolean; replyHistorySaved: boolean; retryReplyPossible: boolean; startedAt: string; completedAt: string; warnings: string[]; errors: string[] };
export class ThreadPostPersistenceService {
  private readonly running = new Set<number>();
  constructor(private readonly history: PostHistoryRepository) {}
  async run(input: PersistedThreadPostInput): Promise<PersistedThreadPostResult> {
    const startedAt = new Date().toISOString(); const done = (result: Omit<PersistedThreadPostResult, 'startedAt' | 'completedAt'>) => ({ ...result, startedAt, completedAt: new Date().toISOString() });
    if (!Number.isInteger(input.productId) || input.productId < 1 || !input.parentPostText.trim() || /https?:\/\//iu.test(input.parentPostText)) return done({ status: 'failed', productId: input.productId, parentHistorySaved: false, replyHistorySaved: false, retryReplyPossible: false, warnings: [], errors: ['invalid_input'] });
    if (this.running.has(input.productId)) return done({ status: 'already_running', productId: input.productId, parentHistorySaved: false, replyHistorySaved: false, retryReplyPossible: false, warnings: [], errors: [] });
    const reply = generateReplyTemplate({ affiliateUrl: input.affiliateUrl });
    if (!reply.reply) return done({ status: 'failed', productId: input.productId, parentHistorySaved: false, replyHistorySaved: false, retryReplyPossible: false, warnings: reply.warnings, errors: ['invalid_reply'] });
    if (input.dryRun ?? (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false') return done({ status: 'dry_run', productId: input.productId, parentHistorySaved: false, replyHistorySaved: false, retryReplyPossible: false, warnings: [], errors: [] });
    this.running.add(input.productId);
    try {
      let parent; try { parent = await input.client.createPost(input.parentPostText); } catch { return done({ status: 'failed', productId: input.productId, parentHistorySaved: false, replyHistorySaved: false, retryReplyPossible: false, warnings: [], errors: ['parent_post_failed'] }); }
      let parentHistory; try { parentHistory = await this.history.create({ productId: input.productId, xPostId: parent.postId, postType: 'parent', executionStatus: 'pending_reply', postText: input.parentPostText }); } catch { return done({ status: 'partial_success', productId: input.productId, parentPostId: parent.postId, parentHistorySaved: false, replyHistorySaved: false, retryReplyPossible: true, warnings: [], errors: ['parent_history_failed'] }); }
      try { const posted = await input.client.createReply(reply.reply.text, parent.postId); await this.history.create({ productId: input.productId, xPostId: posted.postId, postType: 'reply', executionStatus: 'posted', parentHistoryId: parentHistory.id, postText: reply.reply.text }); await this.history.markReplyCompleted(parentHistory.id); return done({ status: 'success', productId: input.productId, parentPostId: parent.postId, replyPostId: posted.postId, parentHistorySaved: true, replyHistorySaved: true, retryReplyPossible: false, warnings: [], errors: [] }); }
      catch { return done({ status: 'partial_success', productId: input.productId, parentPostId: parent.postId, parentHistorySaved: true, replyHistorySaved: false, retryReplyPossible: true, warnings: [], errors: ['reply_post_failed'] }); }
    } finally { this.running.delete(input.productId); }
  }
}
