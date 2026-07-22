import assert from 'node:assert/strict';
import { FavoriteProductProvider } from './favorite-product-provider.js';
import type { ProviderItem, ProductSource } from './providers.js';

const calls: Array<{ id: string; source?: ProductSource }> = [];
const item = (id: string, title = '一般作品', price: number | null = null): ProviderItem => ({
  source: 'actress',
  externalProductId: id,
  title,
  productUrl: `https://video.dmm.co.jp/av/content/?id=${id}`,
  affiliateUrl: 'https://al.dmm.co.jp/?lurl=safe',
  sampleVideoUrl: 'https://example.test/sample.mp4',
  thumbnailUrl: 'https://example.test/image.jpg',
  price,
  salePrice: null,
  isSale: false,
  releaseDate: '2026-07-01',
  actressNames: ['登録女優'],
  fetchedAt: new Date().toISOString()
});
const metadata = {
  async lookup(id: string, source?: ProductSource) {
    calls.push({ id, source });
    if (id === 'missing') return { status: 'api_not_listed' as const };
    if (id === 'mismatch') return { status: 'id_mismatch' as const };
    if (id === 'invalid') return { status: 'invalid_metadata' as const };
    if (id === 'failed') throw new Error('secret');
    if (id === 'vr') return { status: 'available' as const, item: item(id, '【VR】除外作品') };
    return { status: 'available' as const, item: item(id) };
  }
};
const urls = [
  'https://video.dmm.co.jp/av/content/?id=one',
  'https://video.dmm.co.jp/av/content/?id=ONE',
  'https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=two/',
  'https://video.dmm.co.jp/av/content/?id=missing',
  'https://video.dmm.co.jp/av/content/?id=mismatch',
  'https://video.dmm.co.jp/av/content/?id=invalid',
  'https://video.dmm.co.jp/av/content/?id=failed',
  'https://video.dmm.co.jp/av/content/?id=vr',
  'https://example.test/not-official'
];

const result = await new FavoriteProductProvider(urls, metadata).fetch({ limit: 20 });
assert.equal(result.receivedCount, 9);
assert.equal(result.validUrlCount, 8);
assert.equal(result.invalidUrlCount, 1);
assert.equal(result.uniqueContentIdCount, 7);
assert.equal(result.metadataAvailableCount, 2);
assert.equal(result.metadataUnavailableCount, 3);
assert.equal(result.apiNotListedCount, 1);
assert.equal(result.metadataIdMismatchCount, 1);
assert.equal(result.invalidMetadataCount, 1);
assert.equal(result.vrExcludedCount, 1);
assert.equal(result.failedCount, 1);
assert.equal(result.items.length, 2);
assert.ok(result.items.every((value) => value.source === 'favorite' && value.isSale === false));
assert.ok(result.items.some((value) => value.price === null));
assert.deepEqual(calls.map((value) => value.id), ['one', 'two', 'missing', 'mismatch', 'invalid', 'failed', 'vr']);
assert.ok(calls.every((value) => value.source === 'favorite'));

calls.length = 0;
const pageOne = await new FavoriteProductProvider(urls, metadata).fetch({ limit: 2, page: 1 });
assert.equal(pageOne.hasMore, true);
assert.equal(pageOne.nextPage, 2);
assert.equal(pageOne.responseItemCount, 2);
assert.deepEqual(calls.map((value) => value.id), ['one', 'two']);

calls.length = 0;
const pageThree = await new FavoriteProductProvider(urls, metadata).fetch({ limit: 2, page: 4 });
assert.equal(pageThree.hasMore, false);
assert.equal(pageThree.nextPage, undefined);
assert.deepEqual(calls.map((value) => value.id), ['vr']);

console.log('favorite product provider: ok');
