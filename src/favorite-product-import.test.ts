import assert from 'node:assert/strict';
import { FavoriteProductImportService } from './favorite-product-import.js';
import type { Product } from './products.js';

const saved: Array<{ source: string; isSale?: boolean }> = [];
let relationCalls = 0;
const product: Product = { id: 1, fanzaProductId: 'known', title: '既存', productUrl: 'https://video.dmm.co.jp/av/content/?id=known', affiliateUrl: 'https://al.dmm.co.jp/safe', sampleVideoUrl: null, thumbnailUrl: null, price: null, salePrice: null, isSale: true, releaseDate: null, status: 'available', createdAt: '', updatedAt: '' };
const metadata = {
  async fetch(id: string, source?: string) {
    return { source: source ?? 'actress', externalProductId: id, title: '商品', productUrl: `https://video.dmm.co.jp/av/content/?id=${id}`, affiliateUrl: 'https://al.dmm.co.jp/safe', price: null, salePrice: null, isSale: false, fetchedAt: new Date().toISOString() };
  }
};
const writer = {
  async getByFanzaProductId(id: string) { return id === 'known' ? product : undefined; },
  async create(input: { isSale?: boolean }) { saved.push({ source: 'create', isSale: input.isSale }); return { ...product, id: 2, isSale: input.isSale ?? false }; },
  async update(_id: number, input: { isSale?: boolean }) { saved.push({ source: 'update', isSale: input.isSale }); return { ...product, isSale: input.isSale ?? false }; },
  async replaceActressRelations() { relationCalls += 1; return 0; }
};
const service = new FavoriteProductImportService(metadata, writer);
const preview = await service.preview([
  'https://video.dmm.co.jp/av/content/?id=known',
  'https://video.dmm.co.jp/av/content/?id=new'
]);
assert.equal(preview.saveCandidateCount, 2);
assert.equal(preview.items.every((item) => item.source === 'favorite'), true);
const result = await service.persist(preview);
assert.equal(result.createdCount, 1);
assert.equal(result.updatedCount, 1);
assert.equal(result.failedCount, 0);
assert.deepEqual(saved, [{ source: 'update', isSale: true }, { source: 'create', isSale: false }]);
assert.equal(relationCalls, 0);

console.log('favorite product import: ok');
