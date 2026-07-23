import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

type Anchor = {
  href: string;
  textContent: string;
  getAttribute(name: string): string | null;
  closest(selector: string): Anchor | null;
};

type ExtractionResult = {
  urls: string[];
  extractedCount: number;
  duplicateCount: number;
  vrExcludedCount: number;
  truncatedCount: number;
  invalidCandidateCount: number;
  unsupportedProductTypeCount: number;
  urlFormatCounts: { videoAvContent: number; legacyVideoaDetail: number; unsupportedProductType: number };
};

type ExtensionApi = {
  MAX_URLS: number;
  SALE_PAGE_URL: string;
  canPersist(result: Record<string, number | boolean>, count: number): boolean;
  canPersistSale(result: Record<string, number | boolean | string>, count: number, snapshotComplete: boolean): boolean;
  createSaleSyncPayload(urls: string[], persist: boolean, snapshotComplete: boolean, expectedHash?: string, checkToken?: string): Record<string, unknown>;
  createSaleSnapshot(pageUrl: string, result: ExtractionResult): string;
  createSyncPayload(urls: string[], persist: boolean): { urls: string[]; persist: boolean };
  classifyProductLink(value: string): { format: string; contentId?: string } | undefined;
  extractContentId(value: string): string | undefined;
  extractFavoriteUrls(documentValue: { querySelectorAll(selector: string): Anchor[] }, pageUrl: string, limit?: number): ExtractionResult;
  extractSaleUrls(documentValue: { querySelectorAll(selector: string): Anchor[]; readyState?: string; title?: string }, pageUrl: string, limit?: number): ExtractionResult;
  isAllowedFavoritesPage(value: string): boolean;
  isAllowedSalePage(value: string): boolean;
  isExplicitVrLabel(value: string): boolean;
  normalizeDashboardOrigin(value: string): string;
  sendFavoriteSync(fetchValue: typeof fetch, origin: string, urls: string[], persist: boolean): Promise<Record<string, number | boolean>>;
  sendManualSaleSync(fetchValue: typeof fetch, origin: string, urls: string[], persist: boolean, snapshotComplete: boolean, expectedHash?: string, checkToken?: string): Promise<Record<string, number | boolean | string>>;
  validateSalePage(documentValue: { readyState?: string; title?: string }, pageUrl: string): void;
};

const extensionRoot = new URL('../chrome-extension/', import.meta.url);
const coreSource = readFileSync(new URL('core.js', extensionRoot), 'utf8');
const popupSource = readFileSync(new URL('popup.js', extensionRoot), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', extensionRoot), 'utf8')) as Record<string, unknown>;
const context = vm.createContext({ URL, encodeURIComponent });
vm.runInContext(coreSource, context, { filename: 'chrome-extension/core.js' });
const api = (context as { FanzaFavoriteSync: ExtensionApi }).FanzaFavoriteSync;

assert.equal(api.MAX_URLS, 20);
assert.equal(api.SALE_PAGE_URL, 'https://video.dmm.co.jp/av/list/');
assert.equal(api.isAllowedFavoritesPage('https://www.dmm.co.jp/digital/videoa/-/bookmark/'), true);
assert.equal(api.isAllowedFavoritesPage('https://video.dmm.co.jp/av/favorite/?sort=date'), true);
assert.equal(api.isAllowedFavoritesPage('https://www.fanza.com/my/favorites/'), true);
assert.equal(api.isAllowedFavoritesPage('https://video.dmm.co.jp/av/content/?id=one'), false);
assert.equal(api.isAllowedFavoritesPage('https://example.test/favorite/'), false);
assert.equal(api.isAllowedFavoritesPage('http://www.dmm.co.jp/digital/-/bookmark/'), false);
assert.equal(api.isAllowedSalePage('https://video.dmm.co.jp/av/list/'), true);
assert.equal(api.isAllowedSalePage('https://video.dmm.co.jp/av/list'), true);
assert.equal(api.isAllowedSalePage('https://video.dmm.co.jp/av/list/?sort=date'), true);
assert.equal(api.isAllowedSalePage('https://video.dmm.co.jp/av/listing/'), false);
assert.equal(api.isAllowedSalePage('https://www.dmm.co.jp/av/list/'), false);
assert.equal(api.isAllowedSalePage('http://video.dmm.co.jp/av/list/'), false);
assert.throws(() => api.validateSalePage({ readyState: 'loading', title: 'FANZA' }, api.SALE_PAGE_URL));
assert.throws(() => api.validateSalePage({ readyState: 'complete', title: '年齢認証' }, api.SALE_PAGE_URL));
assert.throws(() => api.validateSalePage({ readyState: 'complete', title: 'ログイン' }, api.SALE_PAGE_URL));
assert.throws(() => api.validateSalePage({ readyState: 'complete', title: 'エラー' }, api.SALE_PAGE_URL));
assert.doesNotThrow(() => api.validateSalePage({ readyState: 'complete', title: 'FANZA AV一覧' }, api.SALE_PAGE_URL));

assert.equal(api.extractContentId('https://video.dmm.co.jp/av/content/?id=ABC_001&i3_ref=list'), 'abc_001');
assert.equal(api.extractContentId('https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=ABC-002/'), 'abc-002');
assert.equal(api.extractContentId('https://www.dmm.co.jp/digital/cg/-/detail/=/cid=ABC-002/'), undefined);
assert.equal(api.extractContentId('https://example.test/av/content/?id=abc'), undefined);
assert.equal(api.classifyProductLink('https://video.dmm.co.jp/av/content/?id=one&i3_ref=list')?.format, 'video_av_content');
assert.equal(api.classifyProductLink('https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=one/')?.format, 'legacy_videoa_detail');
assert.equal(api.classifyProductLink('https://www.dmm.co.jp/digital/cg/-/detail/=/cid=one/')?.format, 'unsupported_product_type');
assert.equal(api.isExplicitVrLabel('　［ＶＲ］ 一般作品'), true);
assert.equal(api.isExplicitVrLabel('SUPER VR機器の紹介ではない一般作品'), false);

function anchor(href: string, textContent = '一般作品', cardText?: string): Anchor {
  const container = cardText === undefined ? null : {
    href: '',
    textContent: cardText,
    getAttribute: () => null,
    closest: () => null
  } satisfies Anchor;
  return {
    href,
    textContent,
    getAttribute(name) { return name === 'href' ? href : null; },
    closest() { return container; }
  };
}

const links: Anchor[] = Array.from({ length: 25 }, (_, index) => anchor(`https://video.dmm.co.jp/av/content/?id=item${index}&tracking=removed`));
links.push(anchor('https://video.dmm.co.jp/av/content/?id=item0'));
links.push(anchor('https://video.dmm.co.jp/av/content/?id=vr001', '画像', '  【VR】除外作品'));
links.push(anchor('https://video.dmm.co.jp/av/content/?id=generalvr', 'VRという語を含む一般作品'));
links.push(anchor('https://video.dmm.co.jp/av/content/?id=bad%20id'));
links.push(anchor('https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=item0/'));
links.push(anchor('https://www.dmm.co.jp/digital/cg/-/detail/=/cid=cg001/'));
links.push(anchor('https://example.test/product?id=outside'));
const extracted = api.extractFavoriteUrls({ querySelectorAll: () => links }, 'https://www.dmm.co.jp/digital/videoa/-/bookmark/', 99);
assert.equal(extracted.extractedCount, 20);
assert.equal(extracted.urls.length, 20);
assert.equal(extracted.duplicateCount, 2);
assert.equal(extracted.vrExcludedCount, 1);
assert.equal(extracted.invalidCandidateCount, 1);
assert.equal(extracted.truncatedCount, 6);
assert.equal(extracted.unsupportedProductTypeCount, 1);
assert.deepEqual(JSON.parse(JSON.stringify(extracted.urlFormatCounts)), { videoAvContent: 29, legacyVideoaDetail: 1, unsupportedProductType: 1 });
assert.ok(extracted.urls.every((url) => url.startsWith('https://video.dmm.co.jp/av/content/?id=') && !url.includes('tracking')));
assert.equal(new Set(extracted.urls).size, extracted.urls.length);
assert.throws(() => api.extractFavoriteUrls({ querySelectorAll: () => links }, 'https://video.dmm.co.jp/av/list/'));
const saleExtracted = api.extractSaleUrls({ querySelectorAll: () => links.slice(0, 3) }, 'https://video.dmm.co.jp/av/list/?sort=date');
assert.equal(saleExtracted.extractedCount, 3);
assert.throws(() => api.extractSaleUrls({ querySelectorAll: () => [], readyState: 'complete', title: 'FANZA AV一覧' }, api.SALE_PAGE_URL));
assert.throws(() => api.extractSaleUrls({ querySelectorAll: () => links }, 'https://video.dmm.co.jp/av/favorite/'));
const relativeHrefAnchor: Anchor = {
  href: 'https://video.dmm.co.jp/av/content/?id=relative001',
  textContent: '一般作品',
  getAttribute(name) { return name === 'href' ? '/av/content/?id=relative001' : null; },
  closest() { return null; }
};
const relativeHrefResult = api.extractFavoriteUrls({ querySelectorAll: () => [relativeHrefAnchor] }, 'https://video.dmm.co.jp/av/favorite/');
assert.equal(relativeHrefResult.extractedCount, 1);
assert.equal(relativeHrefResult.invalidCandidateCount, 0);

assert.equal(api.normalizeDashboardOrigin('https://example.up.railway.app/'), 'https://example.up.railway.app');
assert.equal(api.normalizeDashboardOrigin('http://localhost:8080/'), 'http://localhost:8080');
assert.throws(() => api.normalizeDashboardOrigin('http://example.test/'));
assert.throws(() => api.normalizeDashboardOrigin('https://example.test/'));
assert.throws(() => api.normalizeDashboardOrigin('https://user:password@example.test/'));
assert.throws(() => api.normalizeDashboardOrigin('https://example.test/dashboard'));

const safeUrl = ['https://video.dmm.co.jp/av/content/?id=item1'];
const syncSummary = {
  checkOnly: true,
  receivedCount: 1,
  uniqueProductCount: 1,
  matchedProductCount: 1,
  saveCandidateCount: 0,
  invalidCount: 0,
  metadataUnavailableCount: 0,
  apiNotListedCount: 0,
  metadataIdMismatchCount: 0,
  invalidMetadataCount: 0,
  metadataFailedCount: 0,
  vrExcludedCount: 0,
  failedProductCount: 0
};
assert.equal(api.canPersist(syncSummary, 1), true);
assert.equal(api.canPersist({ ...syncSummary, vrExcludedCount: 1 }, 1), false);
assert.equal(api.canPersist({ ...syncSummary, metadataUnavailableCount: 1, apiNotListedCount: 1 }, 1), false);
assert.equal(api.canPersist({ ...syncSummary, checkOnly: false }, 1), false);
assert.throws(() => api.createSyncPayload([], false));
assert.throws(() => api.createSyncPayload(Array.from({ length: 21 }, () => safeUrl[0]), false));
assert.deepEqual(JSON.parse(JSON.stringify(api.createSyncPayload(safeUrl, false))), { urls: safeUrl, persist: false });
const hash = 'a'.repeat(64);
const checkToken = 'b'.repeat(43);
assert.deepEqual(JSON.parse(JSON.stringify(api.createSaleSyncPayload(safeUrl, false, true))), { urls: safeUrl, persist: false, snapshotComplete: true });
assert.deepEqual(JSON.parse(JSON.stringify(api.createSaleSyncPayload(safeUrl, true, true, hash, checkToken))), { urls: safeUrl, persist: true, snapshotComplete: true, expectedHash: hash, checkToken });
assert.throws(() => api.createSaleSyncPayload(safeUrl, true, true));
assert.throws(() => api.createSaleSyncPayload(safeUrl, true, true, hash, 'short'));
const saleSummary = { checkOnly: true, schemaReady: true, snapshotComplete: true, snapshotHash: hash, checkToken, receivedCount: 1, uniqueProductCount: 1, metadataAvailableCount: 1, invalidCount: 0, apiNotListedCount: 0, metadataIdMismatchCount: 0, invalidMetadataCount: 0, vrExcludedCount: 0, failedCount: 0 };
assert.equal(api.canPersistSale(saleSummary, 1, true), true);
assert.equal(api.canPersistSale({ ...saleSummary, schemaReady: false }, 1, true), false);
assert.equal(api.canPersistSale({ ...saleSummary, vrExcludedCount: 1 }, 1, true), false);
assert.equal(api.canPersistSale(saleSummary, 1, false), false);
assert.equal(api.canPersistSale({ ...saleSummary, checkToken: '' }, 1, true), false);
const clientSnapshot = api.createSaleSnapshot('https://video.dmm.co.jp/av/list/?sort=date#ignored', saleExtracted);
assert.equal(clientSnapshot, api.createSaleSnapshot('https://video.dmm.co.jp/av/list/?sort=date', saleExtracted));
assert.notEqual(clientSnapshot, api.createSaleSnapshot('https://video.dmm.co.jp/av/list/?sort=popular', saleExtracted));
assert.notEqual(clientSnapshot, api.createSaleSnapshot('https://video.dmm.co.jp/av/list/?sort=date', { ...saleExtracted, duplicateCount: saleExtracted.duplicateCount + 1 }));

let capturedUrl = '';
let capturedInit: RequestInit | undefined;
const result = await api.sendFavoriteSync(async (input, init) => {
  capturedUrl = String(input);
  capturedInit = init;
  return new Response(JSON.stringify({ result: syncSummary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}, 'https://example.up.railway.app', safeUrl, false);
assert.equal(result.checkOnly, true);
assert.equal(capturedUrl, 'https://example.up.railway.app/api/favorites/sync');
assert.equal(capturedInit?.credentials, 'include');
assert.equal(capturedInit?.redirect, 'error');
assert.deepEqual(JSON.parse(String(capturedInit?.body)), { urls: safeUrl, persist: false });
const sentHeaders = capturedInit?.headers as Record<string, string>;
assert.deepEqual(JSON.parse(JSON.stringify(sentHeaders)), { 'Content-Type': 'application/json' });
assert.equal('Authorization' in sentHeaders, false);
await assert.rejects(api.sendFavoriteSync(async () => new Response('', { status: 401 }), 'https://example.up.railway.app', safeUrl, false));
const persistedSummary = { ...syncSummary, checkOnly: false, currentCount: 1 };
const persisted = await api.sendFavoriteSync(async (_input, init) => {
  assert.equal(JSON.parse(String(init?.body)).persist, true);
  return new Response(JSON.stringify({ result: persistedSummary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}, 'https://example.up.railway.app', safeUrl, true);
assert.equal(persisted.checkOnly, false);
assert.equal(persisted.currentCount, 1);

const saleChecked = await api.sendManualSaleSync(async (input, init) => {
  assert.equal(String(input), 'https://example.up.railway.app/api/sales/manual-sync');
  assert.deepEqual(JSON.parse(String(init?.body)), { urls: safeUrl, persist: false, snapshotComplete: true });
  return new Response(JSON.stringify({ result: saleSummary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}, 'https://example.up.railway.app', safeUrl, false, true);
assert.equal(saleChecked.checkOnly, true);
await api.sendManualSaleSync(async (_input, init) => {
  assert.deepEqual(JSON.parse(String(init?.body)), { urls: safeUrl, persist: true, snapshotComplete: true, expectedHash: hash, checkToken });
  return new Response(JSON.stringify({ result: { ...saleSummary, checkOnly: false } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}, 'https://example.up.railway.app', safeUrl, true, true, hash, checkToken);

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
assert.equal('background' in manifest, false);
assert.equal('content_scripts' in manifest, false);
for (const forbidden of ['chrome.cookies', 'chrome.storage', 'localStorage', 'sessionStorage', 'Authorization', 'setInterval', 'chrome.alarms', 'document.cookie', 'innerHTML', 'outerHTML']) {
  assert.equal(`${coreSource}\n${popupSource}`.includes(forbidden), false, `${forbidden} must not be used`);
}
const popupHtml = readFileSync(new URL('popup.html', extensionRoot), 'utf8');
assert.ok(popupHtml.includes('id="open-sale"'));
assert.ok(popupHtml.includes('FANZAセール一覧を開く'));
assert.ok(popupHtml.includes('セール商品を抽出してcheck-only'));
assert.ok(popupSource.includes('chrome.tabs.create({ url: sync.SALE_PAGE_URL })'));

console.log('chrome favorite sync extension: ok');
