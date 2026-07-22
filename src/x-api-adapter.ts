import { EUploadMimeType, TwitterApi } from 'twitter-api-v2';
import type { XPostClient } from './thread-post-execution.js';
import { downloadPostMedia, type PostMedia } from './post-media.js';

export type XTweetTransport = {
  tweet(text: string, replyToPostId?: string, mediaId?: string): Promise<{ id: string; createdAt?: string }>;
  uploadMedia?(media: PostMedia): Promise<string>;
};
export class XApiPostClient implements XPostClient {
  constructor(private readonly transport: XTweetTransport) {}
  async createPost(text: string, media?: PostMedia) {
    let mediaId: string | undefined;
    try {
      mediaId = media ? await this.transport.uploadMedia?.(media) : undefined;
      if (media && !mediaId) throw new Error('x_media_upload_unavailable');
    } catch (error) { throw new Error(xApiErrorCode(error)); }
    return this.send(text, undefined, mediaId);
  }
  async createReply(text: string, replyToPostId: string) { return this.send(text, replyToPostId); }
  private async send(text: string, replyToPostId?: string, mediaId?: string) {
    try { const result = await this.transport.tweet(text, replyToPostId, mediaId); return { postId: result.id, textLength: Array.from(text).length, createdAt: result.createdAt ?? new Date().toISOString() }; }
    catch (error) { throw new Error(xApiErrorCode(error)); }
  }
}
export function createXApiPostClient(environment: NodeJS.ProcessEnv = process.env) {
  const keys = ['X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  if (keys.some((key) => !environment[key]?.trim())) throw new Error('x_configuration_required');
  const api = new TwitterApi({ appKey: environment.X_APP_KEY!, appSecret: environment.X_APP_SECRET!, accessToken: environment.X_ACCESS_TOKEN!, accessSecret: environment.X_ACCESS_SECRET! });
  return new XApiPostClient({
    uploadMedia: async (media) => {
      const downloaded = await downloadPostMedia(media);
      return api.v2.uploadMedia(downloaded.data, { media_type: downloaded.mimeType as EUploadMimeType, media_category: downloaded.kind === 'video' ? 'tweet_video' : 'tweet_image' });
    },
    tweet: async (text, replyToPostId, mediaId) => {
    const result = replyToPostId
      ? await api.v2.tweet({ text, reply: { in_reply_to_tweet_id: replyToPostId } })
      : await api.v2.tweet(mediaId ? { text, media: { media_ids: [mediaId] } } : { text });
    return { id: result.data.id };
  } });
}
function xApiErrorCode(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message.startsWith('media_') || message === 'x_media_upload_unavailable') return 'x_media_upload_failed'; const status = typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: unknown }).code) : 0; if (status === 400) return 'x_bad_request'; if (status === 401) return 'x_unauthorized'; if (status === 403) return 'x_forbidden'; if (status === 429) return 'x_rate_limited'; if (status >= 500) return 'x_unavailable'; return 'x_request_failed'; }
