import assert from 'node:assert/strict';
import { handleActressApiRequest, type ActressApiService } from './actress-api.js';
import { ActressError, type Actress, type ActressInput } from './actresses.js';
import { DatabaseConfigurationError } from './db/pool.js';

const actress = (id = 1): Actress => ({ id, name: '北岡果林', aliases: [], enabled: true, priority: 100, targetNewReleases: true, targetSales: true, minimumPostIntervalHours: 24, weeklyPostLimit: 2, createdAt: '', updatedAt: '' });
const calls: Array<{ name: string; values: unknown[] }> = [];

const service: ActressApiService = {
  async list(search, enabled) { calls.push({ name: 'list', values: [search, enabled] }); return [actress()]; },
  async get(id) { calls.push({ name: 'get', values: [id] }); if (id === 404) throw new ActressError('女優が見つかりません。', 404); return actress(id); },
  async create(value) { calls.push({ name: 'create', values: [value] }); if (value.name === '重複') throw new ActressError('同名の女優が既に登録されています。', 409); return { ...actress(), ...value }; },
  async update(id, value) { calls.push({ name: 'update', values: [id, value] }); return { ...actress(id), ...value }; },
  async enabled(id, value) { if (typeof value !== 'boolean') throw new ActressError('有効状態が不正です。'); calls.push({ name: 'enabled', values: [id, value] }); return { ...actress(id), enabled: value }; },
  async remove(id) { calls.push({ name: 'remove', values: [id] }); if (id === 409) throw new ActressError('関連する商品があるため削除できません。無効化を利用してください。', 409); }
};

const call = (method: string, path: string, body: Record<string, unknown> = {}, search = '') => handleActressApiRequest(method, path, new URLSearchParams(search), body, () => service);

assert.equal((await call('GET', '/api/actresses', {}, 'search=%E6%9E%9C%E6%9E%97&enabled=true'))?.status, 200);
assert.deepEqual(calls.at(-1), { name: 'list', values: ['果林', true] });
assert.equal((await call('GET', '/api/actresses/2'))?.status, 200);
assert.equal((await call('GET', '/api/actresses/0'))?.status, 400);
assert.equal((await call('GET', '/api/actresses/not-a-number'))?.status, 400);
assert.equal((await call('GET', '/api/actresses/404'))?.status, 404);
assert.equal((await call('POST', '/api/actresses', { name: '依本しおり', aliases: [' しおり '], enabled: true, priority: 50, target_new_releases: true, target_sales: false, minimum_post_interval_hours: 0, weekly_post_limit: 1 }))?.status, 201);
assert.equal((await call('POST', '/api/actresses', { name: 1 }))?.status, 400);
assert.equal((await call('POST', '/api/actresses', { name: '重複', priority: 1, minimum_post_interval_hours: 0, weekly_post_limit: 0 }))?.status, 409);
const patch = await call('PATCH', '/api/actresses/2', { priority: 90 });
assert.equal(patch?.status, 200);
assert.deepEqual(calls.at(-1), { name: 'update', values: [2, { priority: 90 }] });
assert.equal((await call('PATCH', '/api/actresses/2'))?.status, 400);
assert.equal((await call('PATCH', '/api/actresses/2/enabled', { enabled: false }))?.status, 200);
assert.equal((await call('DELETE', '/api/actresses/2'))?.status, 200);
assert.equal((await call('DELETE', '/api/actresses/409'))?.status, 409);

const missingDatabase = await handleActressApiRequest('GET', '/api/actresses', new URLSearchParams(), {}, () => { throw new DatabaseConfigurationError(); });
assert.equal(missingDatabase?.status, 500);
assert.doesNotMatch(JSON.stringify(missingDatabase?.body), /DATABASE_URL/);
const secret = 'postgres://user:password@example.test/db';
const databaseFailure = await handleActressApiRequest('GET', '/api/actresses', new URLSearchParams(), {}, () => { throw new Error(`${secret} SELECT * FROM actresses\nstack`); });
assert.equal(databaseFailure?.status, 500);
assert.doesNotMatch(JSON.stringify(databaseFailure?.body), /postgres|SELECT|stack/i);
console.log('actress-api: ok');
