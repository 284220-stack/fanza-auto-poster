import assert from 'node:assert/strict';
import { handleSaleSyncApiRequest } from './sale-sync-api.js';
import { createSaleSyncExecutionService, SaleSyncExecutionError, SaleSyncExecutionService, type SaleSyncExecutor } from './sale-sync-execution.js';
import type { SyncResult } from './sale-sync-runner.js';
import { executeSaleSyncCli, runSaleSyncCli } from './sync-sales.js';

function result(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    startedAt: '2026-07-20T00:00:00.000Z',
    completedAt: '2026-07-20T00:00:01.000Z',
    durationMs: 1000,
    fetchedCount: 2,
    createdCount: 1,
    updatedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    warnings: [],
    errors: [],
    status: 'success',
    ...overrides
  };
}

function executor(value: SyncResult): SaleSyncExecutor {
  return { async run() { return { started: true, result: value }; } };
}

let release: (() => void) | undefined;
const logs: string[] = [];
let runnerCount = 0;
const locked = new SaleSyncExecutionService({
  logger: { info(message) { logs.push(message); }, error(message) { logs.push(message); } },
  createRunner: () => {
    runnerCount += 1;
    return runnerCount === 1
      ? { run: () => new Promise<SyncResult>((resolve) => { release = () => resolve(result()); }) }
      : { async run() { return result(); } };
  }
});
const firstRun = locked.run();
assert.deepEqual(await locked.run(), { started: false, reason: 'already_running' });
release?.();
assert.equal((await firstRun).started, true);
assert.equal((await locked.run()).started, true);

let failOnce = true;
const failureLogs: string[] = [];
const failing = new SaleSyncExecutionService({
  logger: { info() {}, error(message) { failureLogs.push(message); } },
  createRunner: () => ({
    async run() {
      if (failOnce) {
        failOnce = false;
        throw new Error('postgres://password SELECT * FROM products');
      }
      return result();
    }
  })
});
await assert.rejects(failing.run(), SaleSyncExecutionError);
assert.doesNotMatch(failureLogs.join('\n'), /postgres|SELECT|password/);
assert.equal((await failing.run()).started, true);
await assert.rejects(createSaleSyncExecutionService({}).run(), SaleSyncExecutionError);

const apiSuccess = await handleSaleSyncApiRequest('POST', executor(result()));
assert.equal(apiSuccess.status, 200);
assert.equal((apiSuccess.body.sync as { createdCount: number }).createdCount, 1);
assert.equal('warnings' in (apiSuccess.body.sync as Record<string, unknown>), false);
const apiConflict = await handleSaleSyncApiRequest('POST', { async run() { return { started: false, reason: 'already_running' } as const; } });
assert.equal(apiConflict.status, 409);
const apiFailure = await handleSaleSyncApiRequest('POST', executor(result({ status: 'failed', failedCount: 1, errors: [{ productId: 'safe-id', message: 'safe' } ] })));
assert.equal(apiFailure.status, 500);
const apiUnexpected = await handleSaleSyncApiRequest('POST', { async run() { throw new Error('DATABASE_URL=postgres://password SELECT https://example.test/?secret=1'); } });
assert.equal(apiUnexpected.status, 500);
assert.doesNotMatch(JSON.stringify(apiUnexpected), /DATABASE_URL|postgres|SELECT|secret/);
assert.equal((await handleSaleSyncApiRequest('GET', executor(result()))).status, 400);

const cliSuccess = await runSaleSyncCli(executor(result()));
assert.equal(cliSuccess.exitCode, 0);
const cliPartial = await runSaleSyncCli(executor(result({ status: 'partial_success', failedCount: 1 })));
assert.equal(cliPartial.exitCode, 1);
const cliFailure = await runSaleSyncCli({ async run() { throw new Error('DMM_API_ID=secret https://example.test/?affiliate=secret'); } });
assert.equal(cliFailure.exitCode, 1);
assert.doesNotMatch(cliFailure.output, /secret|https/);
let closeCount = 0;
const output: string[] = [];
assert.equal(await executeSaleSyncCli(executor(result()), async () => { closeCount += 1; }, (message) => output.push(message)), 0);
assert.equal(closeCount, 1);
assert.equal(output.length, 1);
assert.ok(logs.length >= 0);
console.log('sale sync execution: ok');
