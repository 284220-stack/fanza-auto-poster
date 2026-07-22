import assert from 'node:assert/strict';
import { LiveOnePostService } from './live-one-post.js';
import type { CandidateSelectionResult, PostCandidate } from './post-candidate-selection.js';

const candidate: PostCandidate = { productId: 7, category: 'actress', title: '通常作品タイトル', actressNames: ['登録女優'], affiliateUrl: 'https://example.test/affiliate', thumbnailUrl: 'https://pics.dmm.co.jp/image.jpg', selectionReasons: ['actress'], priorityScore: 1 };
const selection = (value?: PostCandidate): CandidateSelectionResult => ({ saleCandidates: [], actressCandidates: value ? [value] : [], favoriteSaleCandidates: [], selected: value ? [value] : [], excludedCount: 0, warnings: [], generatedAt: new Date().toISOString() });
const media = { resolve: async () => ({ media: { url: 'https://pics.dmm.co.jp/image.jpg', kind: 'image' as const }, warnings: ['sample_video_unavailable'] }) };
let postCalls = 0;
let reserveCalls = 0;
const orchestrator = { run: async (input: { productId: number }) => { postCalls += 1; return { action: 'new_thread' as const, status: 'success' as const, productId: input.productId, eligibilityReason: 'eligible', retryReplyPossible: false, startedAt: '', completedAt: '', warnings: [], errors: [] }; } };
const service = new LiveOnePostService(
  async () => selection(candidate),
  orchestrator,
  media,
  { reserve: async () => { reserveCalls += 1; return true; } }
);
const preflight = await service.preflight();
assert.equal(preflight.ready, true);
assert.equal(preflight.category, 'actress');
assert.equal(preflight.mediaType, 'image');
assert.equal(preflight.selfReply, true);
assert.doesNotMatch(preflight.parentPostText ?? '', /https?:\/\//u);
assert.match(preflight.parentPostText ?? '', /^PR\n/u);
assert.equal(postCalls, 0);
assert.equal(reserveCalls, 0);

const mismatch = await service.execute('wrong', { createPost: async () => { throw new Error(); }, createReply: async () => { throw new Error(); } });
assert.equal(mismatch.executed, false);
assert.deepEqual(mismatch.errors, ['confirmation_token_mismatch']);
assert.equal(reserveCalls, 0);

const executed = await service.execute(preflight.confirmationToken!, { createPost: async () => { throw new Error(); }, createReply: async () => { throw new Error(); } });
assert.equal(executed.executed, true);
assert.equal(postCalls, 1);
assert.equal(reserveCalls, 1);

const blocked = new LiveOnePostService(async () => selection(candidate), orchestrator, media, { reserve: async () => false });
assert.deepEqual((await blocked.execute(preflight.confirmationToken!, { createPost: async () => { throw new Error(); }, createReply: async () => { throw new Error(); } })).errors, ['live_one_already_attempted']);

const none = await new LiveOnePostService(async () => selection(), orchestrator, media, { reserve: async () => true }).preflight();
assert.deepEqual(none.errors, ['actress_candidate_unavailable']);

const vr = await new LiveOnePostService(async () => selection({ ...candidate, title: ' 【VR】対象外' }), orchestrator, media, { reserve: async () => true }).preflight();
assert.deepEqual(vr.errors, ['vr_excluded']);
const invalidUrl = await new LiveOnePostService(async () => selection({ ...candidate, affiliateUrl: 'not-a-url' }), orchestrator, media, { reserve: async () => true }).preflight();
assert.deepEqual(invalidUrl.errors, ['affiliate_url_invalid']);

console.log('live one post: ok');
