import assert from 'node:assert/strict';
import { extractFanzaContentId, FavoriteRepository, FavoriteSyncError, FavoriteSyncService, type FavoriteSyncPlan, type FavoriteSyncStore } from './favorites.js';
import type { Queryable } from './actresses.js';

assert.equal(extractFanzaContentId('https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=ABC_123/'), 'abc_123');
assert.equal(extractFanzaContentId('https://video.dmm.co.jp/av/content/?id=SSIS-001'), 'ssis-001');
assert.equal(extractFanzaContentId('https://video.dmm.co.jp/av/content/?content_id=test001'), 'test001');
assert.equal(extractFanzaContentId('https://example.test/digital/videoa/-/detail/=/cid=abc/'), undefined);
assert.equal(extractFanzaContentId('http://www.dmm.co.jp/digital/videoa/-/detail/=/cid=abc/'), undefined);
assert.equal(extractFanzaContentId('https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=bad.value/'), undefined);
assert.equal(extractFanzaContentId('https://www.dmm.co.jp/search/?keyword=cid=abc'), undefined);

const plan: FavoriteSyncPlan = { currentCount: 2, createdCount: 1, refreshedCount: 1, removedCount: 1 };
let replaceCalls = 0;
const store: FavoriteSyncStore = {
  async resolveProductIds(ids) {
    return ids.filter((id) => id !== 'missing').map((contentId, index) => ({ productId: String(index + 1), contentId }));
  },
  async planReplacement() { return plan; },
  async replace() { replaceCalls += 1; return { currentCount: 2, createdCount: 1, refreshedCount: 1, removedCount: 1 }; }
};

const service = new FavoriteSyncService(store);
const checked = await service.sync([
  'https://video.dmm.co.jp/av/content/?id=known',
  'https://video.dmm.co.jp/av/content/?id=KNOWN',
  'https://example.test/not-allowed',
  'https://video.dmm.co.jp/av/content/?id=missing'
]);
assert.deepEqual(checked, {
  checkOnly: true,
  receivedCount: 4,
  validCount: 3,
  invalidCount: 1,
  uniqueProductCount: 2,
  matchedProductCount: 1,
  unmatchedProductCount: 1,
  ...plan
});
assert.equal(replaceCalls, 0);

await assert.rejects(service.sync(['https://example.test/not-allowed'], true), FavoriteSyncError);
await assert.rejects(service.sync(['https://video.dmm.co.jp/av/content/?id=missing'], true), (error: unknown) => error instanceof FavoriteSyncError && error.status === 409);
await assert.rejects(service.sync([], true), FavoriteSyncError);
assert.equal(replaceCalls, 0);

const persisted = await service.sync(['https://video.dmm.co.jp/av/content/?id=known'], true);
assert.equal(persisted.checkOnly, false);
assert.equal(persisted.matchedProductCount, 1);
assert.equal(replaceCalls, 1);

const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
const db: Queryable = {
  async query<T>(sql: string, values?: readonly unknown[]) {
    queries.push({ sql, values });
    if (sql.includes('FROM products')) return { rows: [{ productId: '7', contentId: 'known' }] as T[] };
    if (sql.includes('WITH desired')) return { rows: [{ currentCount: 1, createdCount: 1, refreshedCount: 0, removedCount: 2 }] as T[] };
    return { rows: [{ currentCount: 2, createdCount: 1, refreshedCount: 1, removedCount: 1 }] as T[] };
  }
};
const repository = new FavoriteRepository(db);
assert.deepEqual(await repository.resolveProductIds(['known']), [{ productId: '7', contentId: 'known' }]);
assert.deepEqual(await repository.planReplacement(['7']), plan);
assert.deepEqual(await repository.replace(['7']), { currentCount: 1, createdCount: 1, refreshedCount: 0, removedCount: 2 });
assert.equal(queries.length, 3);
assert.ok(queries[0].sql.includes('lower(fanza_product_id)'));
assert.ok(queries[1].sql.includes('cardinality($1::bigint[])'));
assert.ok(queries[2].sql.includes('ON CONFLICT (product_id) DO UPDATE'));
assert.deepEqual(queries.map((query) => query.values), [[['known']], [['7']], [['7']]]);

console.log('favorites: ok');
