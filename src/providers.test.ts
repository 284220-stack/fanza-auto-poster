import assert from 'node:assert/strict';
import { normalizeProviderResult, ProviderError, ProviderRegistry, type ProductProvider, type ProviderQuery } from './providers.js';

const item = { source: 'sale', externalProductId: ' id ', title: ' title ', productUrl: 'https://example.test/p', price: 100, salePrice: 80, actressNames: [' A ', '', 'A', 'B'], fetchedAt: '2026-01-01T00:00:00Z', rawData: { token: 'secret', ok: true } };
const normalized = normalizeProviderResult({ source: 'sale', items: [item], fetchedAt: '2026-01-01T00:00:00Z', warnings: [], hasMore: false });
assert.equal(normalized.items[0].title, 'title'); assert.deepEqual(normalized.items[0].actressNames, ['A', 'B']); assert.deepEqual(normalized.items[0].rawData, { ok: true });
const partial = normalizeProviderResult({ source: 'sale', items: [item, { ...item, productUrl: 'bad' }, { ...item, price: -1 }, { ...item, salePrice: 101 }, { ...item, releaseDate: 'bad' }], fetchedAt: '2026-01-01T00:00:00Z', warnings: ['source warning'], nextPage: 2, hasMore: true });
assert.equal(partial.items.length, 1); assert.equal(partial.warnings.length, 5); assert.equal(partial.nextPage, 2); assert.equal(partial.hasMore, true);
let query: ProviderQuery | undefined;
const fake: ProductProvider = { source: 'favorite', async fetch(value) { query = value; return { source: 'favorite', items: [item], fetchedAt: '2026-01-01T00:00:00Z', warnings: [], hasMore: false }; } };
const registry = new ProviderRegistry(); registry.register(fake); assert.deepEqual(registry.list(), ['favorite']); await registry.get('favorite').fetch({ limit: 3, page: 2 }); assert.deepEqual(query, { limit: 3, page: 2 });
assert.throws(() => registry.register(fake), ProviderError); assert.throws(() => registry.get('sale'), ProviderError);
console.log('providers: ok');
