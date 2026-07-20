import assert from 'node:assert/strict';
import { ActressRepository, ActressService, type Actress, type Queryable } from './actresses.js';

const actress = (id = 1): Actress => ({ id, name: '北岡果林', aliases: [], enabled: true, priority: 100, targetNewReleases: true, targetSales: true, minimumPostIntervalHours: 24, weeklyPostLimit: 2, createdAt: '', updatedAt: '' });
const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
const db: Queryable = { async query<T>(sql: string, values?: readonly unknown[]) { calls.push({ sql, values }); return { rows: [actress()] as unknown as T[] }; } };
const repo = new ActressRepository(db);
assert.equal((await repo.list())[0].id, 1); await repo.find(1); await repo.search('果林'); await repo.create({ ...actress(), aliases: ['別名'] }); await repo.update(1, { ...actress(), aliases: [] }); await repo.setEnabled(1, false); await repo.remove(1);
assert.ok(calls.every((call) => !/\$\{/.test(call.sql))); assert.ok(calls.filter((call) => call.values).length >= 6);
const service = new ActressService(repo);
const created = await service.create({ name: ' 北岡果林 ', aliases: [' 別名 ', '', '別名'], priority: 100, minimumPostIntervalHours: 0, weeklyPostLimit: 0 });
assert.deepEqual(created.aliases, []);
await assert.rejects(service.create({ name: ' ', priority: 1, minimumPostIntervalHours: 0, weeklyPostLimit: 0 }));
await assert.rejects(service.create({ name: 'x', priority: 101, minimumPostIntervalHours: 0, weeklyPostLimit: 0 }));
console.log('actresses: ok');
