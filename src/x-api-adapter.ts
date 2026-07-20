import { TwitterApi } from 'twitter-api-v2';
import type { XPostClient } from './thread-post-execution.js';

export type XTweetTransport = { tweet(text: string, replyToPostId?: string): Promise<{ id: string; createdAt?: string }> };
export class XApiPostClient implements XPostClient {
  constructor(private readonly transport: XTweetTransport) {}
  async createPost(text: string) { return this.send(text); }
  async createReply(text: string, replyToPostId: string) { return this.send(text, replyToPostId); }
  private async send(text: string, replyToPostId?: string) {
    try { const result = await this.transport.tweet(text, replyToPostId); return { postId: result.id, textLength: Array.from(text).length, createdAt: result.createdAt ?? new Date().toISOString() }; }
    catch (error) { throw new Error(xApiErrorCode(error)); }
  }
}
export function createXApiPostClient(environment: NodeJS.ProcessEnv = process.env) {
  const keys = ['X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  if (keys.some((key) => !environment[key]?.trim())) throw new Error('x_configuration_required');
  const api = new TwitterApi({ appKey: environment.X_APP_KEY!, appSecret: environment.X_APP_SECRET!, accessToken: environment.X_ACCESS_TOKEN!, accessSecret: environment.X_ACCESS_SECRET! });
  return new XApiPostClient({ tweet: async (text, replyToPostId) => {
    const result = replyToPostId
      ? await api.v2.tweet({ text, reply: { in_reply_to_tweet_id: replyToPostId } })
      : await api.v2.tweet(text);
    return { id: result.data.id };
  } });
}
function xApiErrorCode(error: unknown) { const status = typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: unknown }).code) : 0; if (status === 400) return 'x_bad_request'; if (status === 401) return 'x_unauthorized'; if (status === 403) return 'x_forbidden'; if (status === 429) return 'x_rate_limited'; if (status >= 500) return 'x_unavailable'; return 'x_request_failed'; }
