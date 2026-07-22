import assert from 'node:assert/strict';
import { jstDateKey, SchedulerDailyGuardRepository } from './scheduler-daily-guard.js';

assert.equal(jstDateKey(new Date('2026-07-22T15:01:00.000Z')), '2026-07-23');
let released = 0;
const values: Array<readonly unknown[]> = [];
const pool = { connect: async () => ({ query: async <T>(_sql: string, input?: readonly unknown[]) => { values.push(input ?? []); return { rows: [{ key: 'ok' }] as T[] }; }, release: () => { released += 1; } }) };
assert.equal(await new SchedulerDailyGuardRepository(pool).reserve(new Date('2026-07-22T15:01:00.000Z')), true);
assert.deepEqual(values[0], ['scheduler_live_run:2026-07-23']);
assert.equal(released, 1);
const duplicatePool = { connect: async () => ({ query: async <T>() => ({ rows: [] as T[] }), release: () => undefined }) };
assert.equal(await new SchedulerDailyGuardRepository(duplicatePool).reserve(), false);

console.log('scheduler daily guard: ok');
