import assert from 'node:assert/strict';
import { DatabaseConfigurationError } from './db/pool.js';
import { handleFavoriteSyncApiRequest, type FavoriteSyncApiService } from './favorite-sync-api.js';
import { FavoriteSyncError, type FavoriteSyncResult } from './favorites.js';

const result: FavoriteSyncResult = {
  checkOnly: true,
  receivedCount: 1,
  validCount: 1,
  invalidCount: 0,
  uniqueProductCount: 1,
  matchedProductCount: 1,
  unmatchedProductCount: 0,
  saveCandidateCount: 0,
  metadataUnavailableCount: 0,
  apiNotListedCount: 0,
  metadataIdMismatchCount: 0,
  invalidMetadataCount: 0,
  metadataFailedCount: 0,
  vrExcludedCount: 0,
  createdProductCount: 0,
  updatedProductCount: 0,
  failedProductCount: 0,
  currentCount: 0,
  createdCount: 1,
  refreshedCount: 0,
  removedCount: 0
};
let received: { urls: readonly string[]; persist?: boolean } | undefined;
const service: FavoriteSyncApiService = {
  async sync(urls, persist) { received = { urls, persist }; return { ...result, checkOnly: !persist }; }
};
const create = () => service;

assert.equal(await handleFavoriteSyncApiRequest('GET', '/not-favorites', {}, create), undefined);
assert.equal((await handleFavoriteSyncApiRequest('GET', '/api/favorites/sync', {}, create))?.status, 400);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/other', {}, create))?.status, 400);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', {}, create))?.status, 400);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: [1] }, create))?.status, 400);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: [], persist: 'yes' }, create))?.status, 400);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: [], secret: true }, create))?.status, 400);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: Array.from({ length: 21 }, () => 'https://video.dmm.co.jp/av/content/?id=a') }, create))?.status, 400);

const checked = await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: ['https://video.dmm.co.jp/av/content/?id=known'] }, create);
assert.equal(checked?.status, 200);
assert.equal((checked?.body.result as FavoriteSyncResult).checkOnly, true);
assert.deepEqual(received, { urls: ['https://video.dmm.co.jp/av/content/?id=known'], persist: false });

const persisted = await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: ['https://video.dmm.co.jp/av/content/?id=known'], persist: true }, create);
assert.equal(persisted?.status, 200);
assert.equal((persisted?.body.result as FavoriteSyncResult).checkOnly, false);
assert.equal(received?.persist, true);

assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: [] }, () => ({ sync: async () => { throw new FavoriteSyncError('safe', 409); } })))?.status, 409);
assert.equal((await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: [] }, () => { throw new DatabaseConfigurationError(); }))?.status, 500);
const secret = 'postgres://user:password@example.test/private';
const failure = await handleFavoriteSyncApiRequest('POST', '/api/favorites/sync', { urls: [] }, () => ({ sync: async () => { throw new Error(secret); } }));
assert.equal(failure?.status, 500);
assert.doesNotMatch(JSON.stringify(failure?.body), /password|postgres/i);

console.log('favorite sync api: ok');
