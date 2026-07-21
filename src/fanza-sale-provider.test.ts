import assert from 'node:assert/strict';
import { FanzaSaleProvider } from './fanza-sale-provider.js';

const now = new Date();
const begin = new Date(now.valueOf() - 3_600_000).toISOString();
const end = new Date(now.valueOf() + 3_600_000).toISOString();
const base = { content_id: 'id', title: 'title', URL: 'https://example.test/p', affiliateURL: 'https://example.test/a', campaign: [{ date_begin: begin, date_end: end }] };
const provider = new FanzaSaleProvider({ async get() { return { status: 200, async json() { return { result: { items: [
  { ...base, prices: { price: '80', list_price: '100' } },
  { ...base, content_id: 'range', prices: { price: '80～', list_price: '100～' } },
  { ...base, content_id: 'missing', prices: {} },
  { ...base, content_id: 'camel', prices: { price: '80', listPrice: '100' } },
  { ...base, content_id: 'bad', title: '', prices: { price: '80', list_price: '100' } }
], total_count: 5, result_count: 5, first_position: 1 } }; } }; } }, { DMM_API_ID: 'x', DMM_AFFILIATE_ID: 'y' });
const result = await provider.fetch({ limit: 5 });
assert.equal(result.items.length, 4);
assert.deepEqual(result.items.map((item) => [item.price, item.salePrice, item.isSale]), [[100, 80, true], [null, null, false], [null, null, false], [100, 80, true]]);
assert.equal(result.responseItemCount, 5);
assert.equal(result.saveCandidateCount, 4);
assert.equal(result.priceAvailableCount, 3);
assert.equal(result.priceUnavailableCount, 2);
assert.equal(result.saleEligibleCount, 3);
assert.equal(result.saleIneligibleCount, 2);
assert.ok(result.warnings.includes('required_field_missing'));
assert.equal(result.warnings.filter((warning) => warning === 'price_unavailable').length, 2);
assert.doesNotMatch(JSON.stringify(result), /api_id=x|affiliate_id=y|80～|100～/);
console.log('fanza-sale-provider: ok');
