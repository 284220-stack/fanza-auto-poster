import assert from 'node:assert/strict';
import { XApiPostClient } from './x-api-adapter.js';
import { ThreadPostPersistenceService } from './thread-post-persistence.js';

const transportCalls: string[] = [];
const adapter = new XApiPostClient({
  uploadMedia: async (media) => { transportCalls.push(`upload:${media.kind}`); return 'media-1'; },
  tweet: async (_text, reply, mediaId) => { transportCalls.push(`tweet:${mediaId ?? 'none'}`); return { id: reply ? 'reply' : 'parent' }; }
});
assert.equal((await adapter.createPost('PR')).postId, 'parent');
assert.equal((await adapter.createPost('PR', { url: 'https://pics.dmm.co.jp/image.jpg', kind: 'image' })).postId, 'parent');
assert.equal((await adapter.createReply('作品はこちら\nhttps://example.com', 'parent')).postId, 'reply');
assert.deepEqual(transportCalls, ['tweet:none', 'upload:image', 'tweet:media-1', 'tweet:none']);
await assert.rejects(() => new XApiPostClient({ tweet: async () => ({ id: 'never' }) }).createPost('PR', { url: 'https://pics.dmm.co.jp/image.jpg', kind: 'image' }), { message: 'x_media_upload_failed' });
await assert.rejects(() => new XApiPostClient({ tweet: async () => { throw { code: 401, detail: 'secret' }; } }).createPost('secret post'), { message: 'x_unauthorized' });
const calls: string[] = [];
const history = { create: async (value: { postType: string; executionStatus: string }) => { calls.push(`${value.postType}:${value.executionStatus}`); return { id: value.postType === 'parent' ? 1 : 2 }; }, markReplyCompleted: async () => { calls.push('completed'); } } as never;
const service = new ThreadPostPersistenceService(history);
const client = { createPost: async (_text: string, media?: { kind: string }) => { assert.equal(media?.kind, 'image'); return { postId: 'parent', textLength: 2, createdAt: 'now' }; }, createReply: async (_text: string, id: string) => { assert.equal(id, 'parent'); return { postId: 'reply', textLength: 2, createdAt: 'now' }; } };
const success = await service.run({ productId: 1, parentPostText: 'PR\n本文', affiliateUrl: 'https://example.com/affiliate', media: { url: 'https://pics.dmm.co.jp/image.jpg', kind: 'image' }, dryRun: false, client });
assert.equal(success.status, 'success'); assert.deepEqual(calls, ['parent:pending_reply', 'reply:posted', 'completed']);
calls.length = 0;
const dry = await service.run({ productId: 1, parentPostText: 'PR\n本文', affiliateUrl: 'https://example.com/affiliate', dryRun: true, client });
assert.equal(dry.status, 'dry_run'); assert.deepEqual(calls, []);
const partial = await service.run({ productId: 2, parentPostText: 'PR\n本文', affiliateUrl: 'https://example.com/affiliate', media: { url: 'https://pics.dmm.co.jp/image.jpg', kind: 'image' }, dryRun: false, client: { ...client, createReply: async () => { throw new Error('token'); } } });
assert.equal(partial.status, 'partial_success'); assert.equal(partial.retryReplyPossible, true); assert.deepEqual(partial.errors, ['reply_post_failed']);
console.log('x post history integration: ok');
