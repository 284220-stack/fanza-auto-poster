import assert from 'node:assert/strict';
import { MANUAL_SALE_SOURCE_REFERENCE, ProductSourceRepository, type TransactionPool } from './product-sources.js';
import type { ProviderItem } from './providers.js';

const product = (id: string): ProviderItem => ({
  source: 'sale', externalProductId: id, title: `商品${id}`,
  productUrl: `https://video.dmm.co.jp/av/content/?id=${id}`,
  affiliateUrl: 'https://al.dmm.co.jp/safe', sampleVideoUrl: undefined,
  thumbnailUrl: undefined, price: null, salePrice: null, isSale: true,
  releaseDate: undefined, fetchedAt: new Date().toISOString()
});

const poolQueries: Array<{ sql: string; values?: readonly unknown[] }> = [];
const transactionQueries: Array<{ sql: string; values?: readonly unknown[] }> = [];
let nextProductId = 10;
const pool: TransactionPool = {
  async query<T>(sql: string, values?: readonly unknown[]) {
    poolQueries.push({ sql, values });
    if (sql.includes('to_regclass')) return { rows: [{ ready: true }] as T[] };
    if (sql.includes('GROUP BY product_id')) return { rows: [{ productId: 10, sources: ['favorite', 'sale'], currentSale: true, firstSeenAt: '2026-01-01', lastSeenAt: '2026-01-02' }] as T[] };
    return { rows: [{ matchedProductCount: 1, currentSaleCount: 2, activateCount: 0, deactivateCount: 1 }] as T[] };
  },
  async connect() {
    return {
      async query<T>(sql: string, values?: readonly unknown[]) {
        transactionQueries.push({ sql, values });
        if (sql.includes('WITH desired')) return { rows: [{ matchedProductCount: 1, currentSaleCount: 2, activateCount: 0, deactivateCount: 1 }] as T[] };
        if (sql.includes('INSERT INTO products')) return { rows: [{ id: nextProductId++, created: values?.[0] === 'new' }] as T[] };
        if (sql.includes('UPDATE product_sources')) return { rows: [{ productId: 99 }] as T[] };
        return { rows: [] as T[] };
      },
      release() { transactionQueries.push({ sql: 'RELEASE' }); }
    };
  }
};

const repository = new ProductSourceRepository(pool);
assert.equal(await repository.schemaReady(), true);
assert.deepEqual(await repository.listSummaries(), [{ productId: 10, sources: ['favorite', 'sale'], currentSale: true, firstSeenAt: '2026-01-01', lastSeenAt: '2026-01-02' }]);
assert.deepEqual(await repository.planSaleSnapshot(['known']), { matchedProductCount: 1, currentSaleCount: 2, activateCount: 0, deactivateCount: 1 });
const persisted = await repository.persistSaleSnapshot([product('known'), product('new')]);
assert.equal(persisted.createdProductCount, 1);
assert.equal(persisted.updatedProductCount, 1);
assert.equal(persisted.activateCount, 1);
assert.equal(transactionQueries[0].sql, 'BEGIN');
assert.ok(transactionQueries.some((query) => query.sql.includes("source_type = 'sale'")));
assert.ok(transactionQueries.some((query) => query.sql.includes('ON CONFLICT (product_id, source_type, source_reference)')));
assert.ok(transactionQueries.some((query) => query.sql.includes('SET is_sale = EXISTS')));
assert.ok(transactionQueries.some((query) => query.sql === 'COMMIT'));
assert.equal(transactionQueries.at(-1)?.sql, 'RELEASE');
assert.ok(transactionQueries.some((query) => query.values?.includes(MANUAL_SALE_SOURCE_REFERENCE)));

const failedQueries: string[] = [];
const failed = new ProductSourceRepository({
  async query<T>() { return { rows: [] as T[] }; },
  async connect() {
    return {
      async query<T>(sql: string) {
        failedQueries.push(sql);
        if (sql.includes('INSERT INTO products')) throw new Error('write failed');
        if (sql.includes('WITH desired')) return { rows: [{ matchedProductCount: 0, currentSaleCount: 0, activateCount: 0, deactivateCount: 0 }] as T[] };
        return { rows: [] as T[] };
      },
      release() { failedQueries.push('RELEASE'); }
    };
  }
});
await assert.rejects(failed.persistSaleSnapshot([product('failed')]));
assert.ok(failedQueries.includes('ROLLBACK'));
assert.equal(failedQueries.at(-1), 'RELEASE');

console.log('product sources: ok');
