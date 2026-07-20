import assert from 'node:assert/strict';
import { FanzaSaleProvider } from './fanza-sale-provider.js';

const now = new Date();
const begin = new Date(now.valueOf() - 3_600_000).toISOString();
const end = new Date(now.valueOf() + 3_600_000).toISOString();
const valid = {
  content_id: 'id', title: 'title', URL: 'https://example.test/p', affiliateURL: 'https://example.test/a',
  prices: { price: '80', list_price: '100' }, campaign: [{ date_begin: begin, date_end: end }],
  sampleMovieURL: { size_720_480: 'https://example.test/v' }, imageURL: { large: 'https://example.test/i' },
  date: '2026-01-01', iteminfo: { actress: [{ name: 'A' }, { name: 'A' }] }
};
let requested = '';
const provider = new FanzaSaleProvider({
  async get(url) {
    requested = url;
    return {
      status: 200,
      async json() {
        return {
          result: {
            items: [
              valid,
              { ...valid, campaign: [] },
              { ...valid, campaign: [{ date_begin: '2000-01-01', date_end: '2000-01-02' }] },
              { ...valid, prices: { list_price: '100' } },
              { ...valid, prices: { price: '-1', list_price: '100' } },
              { ...valid, prices: { price: '100', list_price: '90' } },
              { ...valid, title: '' },
              { ...valid, URL: 'bad' },
              { ...valid, affiliateURL: 'bad' }
            ], total_count: 10, result_count: 9, first_position: 1
          }
        };
      }
    };
  }
}, { DMM_API_ID: 'x', DMM_AFFILIATE_ID: 'y' });

const result = await provider.fetch({ limit: 8, page: 2 });
assert.equal(result.items.length, 1);
assert.equal(result.items[0].price, 100);
assert.equal(result.items[0].salePrice, 80);
assert.equal(result.items[0].isSale, true);
assert.equal(result.hasMore, true);
assert.equal(result.nextPage, 3);
assert.match(requested, /hits=8/);
assert.match(requested, /offset=9/);
assert.equal(result.items[0].sampleVideoUrl, 'https://example.test/v');
assert.deepEqual(result.items[0].actressNames, ['A']);
assert.equal(result.warnings.length, 8);
for (const warning of ['campaign_missing', 'campaign_out_of_period', 'price_missing:current_price:unsupported_type:undefined:scalar:length_na', 'price_not_discounted', 'required_field_missing', 'invalid_url', 'normalization_failed']) {
  assert.ok(result.warnings.includes(warning));
}
assert.ok(result.warnings.some((warning) => /^invalid_price:current_price:numeric_only:string:scalar:length_2:pattern_R?D:ascii_digits_1:/.test(warning)));
assert.doesNotMatch(JSON.stringify(result), /api_id=x|affiliate_id=y/);
console.log('fanza-sale-provider: ok');
