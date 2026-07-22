import assert from 'node:assert/strict';
import { isVrProduct, isVrTitle } from './vr-product.js';
import { PostCandidateSelectionService, type CandidateSource } from './post-candidate-selection.js';

assert.equal(isVrTitle('【VR】作品'), true);
assert.equal(isVrTitle('  [ｖｒ] 作品'), true);
assert.equal(isVrTitle('VR作品の紹介'), false);
assert.equal(isVrTitle('AVR機器を使う作品'), false);
assert.equal(isVrProduct({ title: '一般作品', rawData: { genre: [{ name: 'VR' }] } }), true);
assert.equal(isVrProduct({ title: '一般作品', rawData: { genre: [{ name: 'ドラマ' }] } }), false);

const base: CandidateSource = { productId: 1, title: '一般作品', affiliateUrl: 'https://example.com', isSale: false, status: 'available', favorite: false, actressNames: ['A'], enabledActressNames: ['A'], enabledNewReleaseActressNames: ['A'], actressPriority: 1, hasRecentParentPost: false, hasPendingReply: false };
const result = await new PostCandidateSelectionService({ listSelectable: async () => [{ ...base, productId: 2, title: '【VR】対象外' }, base] }).select();
assert.equal(result.actressCandidates.length, 1);
assert.equal(result.actressCandidates[0].productId, 1);
console.log('vr product: ok');
