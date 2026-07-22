import assert from 'node:assert/strict';
import { ActressProductProvider, ProductMetadataProvider, type DmmHttpClient } from './actress-product-provider.js';
const actress = { id: 1, name: '正式名', aliases: ['別名'], enabled: true, priority: 1, targetNewReleases: true, targetSales: false, minimumPostIntervalHours: 0, weeklyPostLimit: 1, createdAt: '', updatedAt: '' };
const item = (id: string, names: string[]) => ({ content_id: id, title: 'title', URL: 'https://example.test/product', affiliateURL: 'https://example.test/affiliate', date: '2026-01-01', iteminfo: { actress: names.map((name) => ({ name })) } });
const calls: string[] = [];
const http: DmmHttpClient = { async get(url) { calls.push(url); const id = new URL(url).searchParams.get('cid'); if (id === 'one') return { status: 200, json: async () => ({ result: { items: [item('one', ['正式名'])] } }) }; if (id === 'two') return { status: 200, json: async () => ({ result: { items: [item('two', ['別人'])] } }) }; if (id === 'missing') return { status: 200, json: async () => ({ result: { items: [] } }) }; if (id === 'mismatch') return { status: 200, json: async () => ({ result: { items: [item('other', ['正式名'])] } }) }; if (id === 'second') return { status: 200, json: async () => ({ result: { items: [item('other', ['正式名']), item('second', ['正式名'])] } }) }; if (id === 'invalid') return { status: 200, json: async () => ({ result: { items: [{ content_id: 'invalid', URL: 'https://example.test/product' }] } }) }; if (id === 'vr') return { status: 200, json: async () => ({ result: { items: [{ ...item('vr', ['正式名']), title: '【VR】除外作品' }] } }) }; return { status: 200, json: async () => ({ result: { items: [item('one', ['正式名']), item('one', ['正式名']), item('two', ['別人'])] } }) }; } };
const metadata = new ProductMetadataProvider(http, { DMM_API_ID: 'x', DMM_AFFILIATE_ID: 'y' });
assert.equal((await metadata.fetch('one', 'favorite'))?.source, 'favorite');
assert.equal(await metadata.fetch('mismatch', 'favorite'), undefined);
assert.equal((await metadata.lookup('missing', 'favorite')).status, 'api_not_listed');
assert.equal((await metadata.lookup('mismatch', 'favorite')).status, 'id_mismatch');
assert.equal((await metadata.lookup('second', 'favorite')).status, 'available');
assert.equal((await metadata.lookup('invalid', 'favorite')).status, 'invalid_metadata');
assert.equal((await metadata.lookup('vr', 'favorite')).status, 'vr_excluded');
for (const lookupId of ['missing', 'mismatch', 'second', 'invalid', 'vr']) {
  assert.ok(calls.some((url) => new URL(url).searchParams.get('cid') === lookupId && new URL(url).searchParams.get('hits') === '20'));
}
assert.ok(calls.some((url) => new URL(url).searchParams.get('cid') === 'one' && new URL(url).searchParams.get('hits') === '1'));
const result = await new ActressProductProvider([actress, { ...actress, id: 2, enabled: false }, { ...actress, id: 3, targetNewReleases: false }], http, metadata, { DMM_API_ID: 'x', DMM_AFFILIATE_ID: 'y' }).fetch();
assert.equal(result.registeredActressCount, 1); assert.equal(result.searchedActressCount, 2); assert.equal(result.uniqueProductCount, 1); assert.equal(result.items[0]?.externalProductId, 'one'); assert.ok(result.unmatchedCount >= 1); assert.equal(calls.filter((url) => new URL(url).searchParams.get('cid') === 'one').length, 2);
console.log('actress product provider: ok');
