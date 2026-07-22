import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ProductMetadataLookupResult } from './actress-product-provider.js';
import { handleManualSaleSyncApiRequest } from './manual-sale-sync-api.js';
import { MAX_MANUAL_SALE_PRODUCTS, ManualSaleSyncError, ManualSaleSyncService, type ManualSaleSyncStore } from './manual-sale-sync.js';
import type { ProviderItem } from './providers.js';

const url = (id: string) => `https://video.dmm.co.jp/av/content/?id=${id}`;
const item = (id: string): ProviderItem => ({
  source: 'sale', externalProductId: id, title: `商品${id}`, productUrl: url(id),
  affiliateUrl: 'https://al.dmm.co.jp/safe', price: null, salePrice: null,
  isSale: true, fetchedAt: new Date().toISOString()
});

let persisted = 0;
let persistedItems: readonly ProviderItem[] = [];
let schemaReady = true;
const store: ManualSaleSyncStore = {
  async schemaReady() { return schemaReady; },
  async planSaleSnapshot(ids) { return { matchedProductCount: ids.includes('known') ? 1 : 0, currentSaleCount: 1, activateCount: ids.includes('new') ? 1 : 0, deactivateCount: 0 }; },
  async persistSaleSnapshot(items) { persisted += 1; persistedItems = items; return { matchedProductCount: 1, currentSaleCount: 1, activateCount: 1, deactivateCount: 0, createdProductCount: 1, updatedProductCount: 1 }; }
};
const metadata = {
  async lookup(id: string): Promise<ProductMetadataLookupResult> {
    if (id === 'missing') return { status: 'api_not_listed' };
    if (id === 'mismatch') return { status: 'id_mismatch' };
    if (id === 'invalid') return { status: 'invalid_metadata' };
    if (id === 'vr') return { status: 'vr_excluded' };
    if (id === 'noaffiliate') return { status: 'available', item: { ...item(id), affiliateUrl: undefined } };
    if (id === 'failed') throw new Error('remote failure');
    return { status: 'available', item: item(id) };
  }
};
const service = new ManualSaleSyncService(store, metadata);

const checked = await service.sync([url('known'), url('new'), url('new')], { snapshotComplete: true });
assert.equal(checked.checkOnly, true);
assert.equal(checked.receivedCount, 3);
assert.equal(checked.uniqueProductCount, 2);
assert.equal(checked.metadataAvailableCount, 2);
assert.equal(checked.saveCandidateCount, 1);
assert.equal(checked.snapshotComplete, true);
assert.match(checked.snapshotHash, /^[a-f0-9]{64}$/);
assert.equal(persisted, 0);

const saved = await service.sync([url('known'), url('new')], { persist: true, snapshotComplete: true, expectedHash: checked.snapshotHash });
assert.equal(saved.checkOnly, false);
assert.equal(saved.createdProductCount, 1);
assert.equal(saved.updatedProductCount, 1);
assert.equal(persisted, 1);
assert.equal(persistedItems.every((value) => value.source === 'sale' && value.isSale === true), true);

await assert.rejects(service.sync([url('known')], { persist: true, snapshotComplete: false, expectedHash: checked.snapshotHash }), ManualSaleSyncError);
await assert.rejects(service.sync([url('known')], { persist: true, snapshotComplete: true, expectedHash: '0'.repeat(64) }), ManualSaleSyncError);
for (const id of ['missing', 'mismatch', 'invalid', 'vr', 'noaffiliate', 'failed']) {
  const result = await service.sync([url(id)], { snapshotComplete: true });
  assert.equal(result.metadataAvailableCount, 0);
  await assert.rejects(service.sync([url(id)], { persist: true, snapshotComplete: true, expectedHash: result.snapshotHash }), ManualSaleSyncError);
}
assert.equal(persisted, 1);

schemaReady = false;
const noSchema = await service.sync([url('known')], { snapshotComplete: true });
assert.equal(noSchema.schemaReady, false);
await assert.rejects(service.sync([url('known')], { persist: true, snapshotComplete: true, expectedHash: noSchema.snapshotHash }), ManualSaleSyncError);
schemaReady = true;

await assert.rejects(service.sync(Array.from({ length: MAX_MANUAL_SALE_PRODUCTS + 1 }, (_, index) => url(`p${index}`))), ManualSaleSyncError);
const invalidUrl = await service.sync(['https://example.test/product'], { snapshotComplete: true });
assert.equal(invalidUrl.invalidCount, 1);

const apiCheck = await handleManualSaleSyncApiRequest('POST', '/api/sales/manual-sync', { urls: [url('known')], snapshotComplete: true }, () => service);
assert.equal(apiCheck?.status, 200);
assert.equal((await handleManualSaleSyncApiRequest('GET', '/api/sales/manual-sync', {}, () => service))?.status, 400);
assert.equal((await handleManualSaleSyncApiRequest('POST', '/api/sales/manual-sync', { urls: [1] }, () => service))?.status, 400);
assert.equal((await handleManualSaleSyncApiRequest('POST', '/api/sales/manual-sync', { urls: [], secret: true }, () => service))?.status, 400);

const migration = await readFile(new URL('../migrations/1763000000000_product_sources.ts', import.meta.url), 'utf8');
assert.ok(migration.includes('product_sources_unique_observation'));
assert.ok(migration.includes('manual-favorite-sync'));
assert.ok(migration.includes("'actress:' || pa.actress_id::text"));
assert.ok(migration.includes("source_type IN ('actress', 'favorite', 'sale')"));
assert.ok(migration.includes("pgm.dropTable('product_sources')"));

console.log('manual sale sync: ok');
