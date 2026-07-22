import assert from 'node:assert/strict';
import { LiveOneGuardRepository } from './live-one-guard.js';

function database(existing: boolean) {
  const statements: Array<{ sql: string; values?: readonly unknown[] }> = [];
  let released = 0;
  const client = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      statements.push({ sql, values });
      return { rows: sql.includes('EXISTS') ? [{ exists: existing }] as T[] : [] as T[] };
    },
    release: () => { released += 1; }
  };
  return { pool: { connect: async () => client }, statements, released: () => released };
}

const fresh = database(false);
assert.equal(await new LiveOneGuardRepository(fresh.pool).reserve(7, 'confirmation-token'), true);
assert.deepEqual(fresh.statements.map((item) => item.sql), ['BEGIN', 'SELECT pg_advisory_xact_lock($1::bigint)', "SELECT EXISTS(SELECT 1 FROM settings WHERE key='live_one_post_attempt') AS exists", "INSERT INTO settings (key, value) VALUES ('live_one_post_attempt', jsonb_build_object('productId',$1::int,'tokenHash',$2::text,'attemptedAt',current_timestamp))", 'COMMIT']);
assert.notEqual(fresh.statements[3].values?.[1], 'confirmation-token');
assert.equal(fresh.released(), 1);

const used = database(true);
assert.equal(await new LiveOneGuardRepository(used.pool).reserve(7, 'confirmation-token'), false);
assert.equal(used.statements.some((item) => item.sql.startsWith('INSERT')), false);
assert.equal(used.statements.at(-1)?.sql, 'ROLLBACK');

console.log('live one guard: ok');
