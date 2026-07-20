import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkDatabaseConnection, DatabaseConnectionError } from './health.js';
import {
  closeDatabasePool,
  createDatabasePool,
  databasePoolConfig,
  DatabaseConfigurationError,
  DatabasePoolClosedError,
  getDatabasePool,
  registerDatabaseShutdownHandlers
} from './pool.js';

const poolSource = await readFile(new URL('./pool.js', import.meta.url), 'utf8');
assert.equal(poolSource.includes('dotenv'), false);

assert.throws(() => createDatabasePool({}), DatabaseConfigurationError);

assert.deepEqual(databasePoolConfig({ DATABASE_URL: 'postgres://localhost/test' }), {
  connectionString: 'postgres://localhost/test'
});
assert.deepEqual(databasePoolConfig({ DATABASE_URL: 'postgres://localhost/test', DATABASE_SSL: 'true' }), {
  connectionString: 'postgres://localhost/test',
  ssl: { rejectUnauthorized: true }
});
assert.deepEqual(databasePoolConfig({ DATABASE_URL: 'postgres://localhost/test', PGSSLMODE: 'no-verify' }), {
  connectionString: 'postgres://localhost/test',
  ssl: { rejectUnauthorized: false }
});
assert.deepEqual(databasePoolConfig({ DATABASE_URL: 'postgres://localhost/test', DATABASE_SSL: 'true', DATABASE_SSL_REJECT_UNAUTHORIZED: 'false' }), {
  connectionString: 'postgres://localhost/test',
  ssl: { rejectUnauthorized: false }
});

const queries: string[] = [];
await checkDatabaseConnection({
  query: async (statement: string) => {
    queries.push(statement);
    return { rows: [{ '?column?': 1 }] };
  }
});
assert.deepEqual(queries, ['SELECT 1']);

const connectionString = 'postgres://user:secret@example.test:5432/app';
const logged: unknown[][] = [];
const originalError = console.error;
console.error = (...values: unknown[]) => { logged.push(values); };
try {
  await assert.rejects(
    checkDatabaseConnection({
      query: async () => {
        throw new Error(`could not connect to ${connectionString}`);
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof DatabaseConnectionError);
      assert.equal(String(error).includes(connectionString), false);
      return true;
    }
  );
} finally {
  console.error = originalError;
}
assert.deepEqual(logged, []);

const registeredHandlers: Array<{ signal: NodeJS.Signals; listener: () => void }> = [];
const registrar = { once: (signal: NodeJS.Signals, listener: () => void) => { registeredHandlers.push({ signal, listener }); } };
registerDatabaseShutdownHandlers(registrar);
registerDatabaseShutdownHandlers(registrar);
assert.equal(registeredHandlers.length, 2);

let releaseClose: (() => void) | undefined;
let endCalls = 0;
const sharedPool = getDatabasePool(
  { DATABASE_URL: 'postgres://localhost/test' },
  () => ({
    query: async () => ({ rows: [] }),
    end: async () => {
      endCalls += 1;
      await new Promise<void>((resolve) => { releaseClose = resolve; });
    }
  })
);
assert.equal(getDatabasePool(), sharedPool);
const firstClose = closeDatabasePool();
const secondClose = closeDatabasePool();
assert.throws(() => getDatabasePool(), DatabasePoolClosedError);
releaseClose?.();
await Promise.all([firstClose, secondClose]);
assert.equal(endCalls, 1);
assert.throws(() => getDatabasePool(), DatabasePoolClosedError);
assert.throws(() => createDatabasePool({ DATABASE_URL: 'postgres://localhost/test' }), DatabasePoolClosedError);

const originalExit = process.exit;
let exitCalls = 0;
process.exit = ((() => { exitCalls += 1; }) as typeof process.exit);
try {
  registeredHandlers[0].listener();
  await new Promise<void>((resolve) => setImmediate(resolve));
} finally {
  process.exit = originalExit;
}
assert.equal(exitCalls, 0);

console.log('database health: ok');
