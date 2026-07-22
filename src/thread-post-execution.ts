import { generateReplyTemplate } from './reply-template.js';
import type { PostMedia } from './post-media.js';

export type XPostClient = {
  createPost(text: string, media?: PostMedia): Promise<{ postId: string; textLength: number; createdAt: string }>;
  createReply(text: string, replyToPostId: string): Promise<{ postId: string; textLength: number; createdAt: string }>;
};
export type ThreadPostInput = { parentPostText: string; affiliateUrl?: string; productId: string; media?: PostMedia; dryRun?: boolean; client: XPostClient; maxLength?: number };
export type ThreadPostResult = { status: 'success' | 'partial_success' | 'failed' | 'dry_run'; parentPostId?: string; replyPostId?: string; parentPosted: boolean; replyPosted: boolean; startedAt: string; completedAt: string; warnings: string[]; errors: string[]; replyText?: string };

export class ThreadPostExecutionService {
  private running = false;
  async run(input: ThreadPostInput): Promise<ThreadPostResult> {
    const startedAt = new Date().toISOString();
    const complete = (result: Omit<ThreadPostResult, 'startedAt' | 'completedAt'>): ThreadPostResult => ({ ...result, startedAt, completedAt: new Date().toISOString() });
    if (this.running) return complete({ status: 'failed', parentPosted: false, replyPosted: false, warnings: [], errors: ['already_running'] });
    if (!input.parentPostText.trim()) return complete({ status: 'failed', parentPosted: false, replyPosted: false, warnings: [], errors: ['invalid_parent_post'] });
    if (!input.parentPostText.startsWith('【PR】\n') || /https?:\/\//iu.test(input.parentPostText) || Array.from(input.parentPostText).length > (input.maxLength ?? 280)) return complete({ status: 'failed', parentPosted: false, replyPosted: false, warnings: [], errors: ['invalid_parent_post'] });
    const template = generateReplyTemplate({ affiliateUrl: input.affiliateUrl, maxLength: input.maxLength });
    if (!template.reply) return complete({ status: 'failed', parentPosted: false, replyPosted: false, warnings: template.warnings, errors: ['invalid_reply'] });
    if (input.dryRun) return complete({ status: 'dry_run', parentPosted: false, replyPosted: false, warnings: [], errors: [], replyText: template.reply.text });
    this.running = true;
    try {
      let parent;
      try { parent = await input.client.createPost(input.parentPostText, input.media); } catch { return complete({ status: 'failed', parentPosted: false, replyPosted: false, warnings: [], errors: ['parent_post_failed'] }); }
      try {
        const reply = await input.client.createReply(template.reply.text, parent.postId);
        return complete({ status: 'success', parentPostId: parent.postId, replyPostId: reply.postId, parentPosted: true, replyPosted: true, warnings: [], errors: [] });
      } catch { return complete({ status: 'partial_success', parentPostId: parent.postId, parentPosted: true, replyPosted: false, warnings: [], errors: ['reply_post_failed'], replyText: template.reply.text }); }
    } finally { this.running = false; }
  }
}
