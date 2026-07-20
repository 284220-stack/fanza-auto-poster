import type { PostHistoryRepository } from './post-history.js';

export type PostEligibilityInput = { productId: number; now?: Date; windowDays?: number };
export type PostEligibilityResult = { eligible: boolean; reason: 'eligible' | 'repost_window_active' | 'pending_reply_exists' | 'product_not_found' | 'invalid_input'; pendingParentPostId?: string };
export class PostEligibilityService {
  constructor(private readonly history: PostHistoryRepository) {}
  async check(input: PostEligibilityInput): Promise<PostEligibilityResult> {
    if (!Number.isInteger(input.productId) || input.productId < 1 || !Number.isFinite(input.windowDays ?? 30) || (input.windowDays ?? 30) < 1) return { eligible: false, reason: 'invalid_input' };
    const pending = await this.history.findPendingReply(input.productId);
    if (pending) return { eligible: false, reason: 'pending_reply_exists', pendingParentPostId: pending.xPostId ?? undefined };
    const since = new Date((input.now ?? new Date()).getTime() - (input.windowDays ?? 30) * 86_400_000);
    return await this.history.hasWithin(input.productId, since) ? { eligible: false, reason: 'repost_window_active' } : { eligible: true, reason: 'eligible' };
  }
}
