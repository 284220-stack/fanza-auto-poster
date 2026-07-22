import assert from 'node:assert/strict';
import { PostgresAdvisoryRunLock } from './run-lock.js';

function fake(acquired = true, releaseResult = true) {
  const queries: string[] = [];
  const releases: boolean[] = [];
  const client = {
    query: async <T>(sql: string) => {
      queries.push(sql);
      return { rows: [{ [sql.includes('try_') ? 'acquired' : 'released']: sql.includes('try_') ? acquired : releaseResult }] as T[] };
    },
    release: (destroy = false) => { releases.push(destroy); }
  };
  return { pool: { connect: async () => client }, queries, releases };
}

const success = fake();
const lock = new PostgresAdvisoryRunLock(success.pool, 123);
assert.equal(await lock.acquire(), true);
assert.equal(await lock.acquire(), false);
await lock.release();
assert.equal(success.queries.length, 2);
assert.deepEqual(success.releases, [false]);

const busy = fake(false);
assert.equal(await new PostgresAdvisoryRunLock(busy.pool, 123).acquire(), false);
assert.deepEqual(busy.releases, [false]);

const brokenRelease = fake(true, false);
const broken = new PostgresAdvisoryRunLock(brokenRelease.pool, 123);
assert.equal(await broken.acquire(), true);
await assert.rejects(() => broken.release(), /advisory_lock_release_failed/);
assert.deepEqual(brokenRelease.releases, [true]);

console.log('run lock: ok');
