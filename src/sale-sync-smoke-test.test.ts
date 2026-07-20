import assert from 'node:assert/strict';
import { formatSaleSyncSmokeTestResult, runSaleSyncSmokeTest, summarizeWarningReasons, type SaleSyncSmokeTestResult } from './sale-sync-smoke-test.js';
import { executeSaleSyncSmokeTestCli, smokeTestMode } from './sync-sales-check.js';
import type { ProductProvider, ProviderResult } from './providers.js';
import type { SyncResult } from './sale-sync-runner.js';

const environment = { DATABASE_URL: 'postgres://hidden', DMM_API_ID: 'hidden-api-id', DMM_AFFILIATE_ID: 'hidden-affiliate-id' };

function provider(overrides: Partial<ProviderResult> = {}): ProductProvider {
  return {
    source: 'sale',
    async fetch() {
      return { source: 'sale', items: [], fetchedAt: '2026-07-20T00:00:00.000Z', warnings: [], hasMore: false, ...overrides };
    }
  };
}

function syncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    startedAt: '2026-07-20T00:00:00.000Z', completedAt: '2026-07-20T00:00:01.000Z', durationMs: 1000,
    fetchedCount: 1, createdCount: 1, updatedCount: 0, skippedCount: 0, failedCount: 0,
    warnings: [], errors: [], status: 'success', ...overrides
  };
}

let closeCount = 0;
const closePool = async () => { closeCount += 1; };
const missing = await runSaleSyncSmokeTest({ environment: {}, closePool });
assert.equal(missing.configuration, 'failed');
assert.equal(missing.exitCode, 1);

const databaseFailure = await runSaleSyncSmokeTest({ environment, checkDatabase: async () => { throw new Error('postgres://hidden'); }, closePool });
assert.equal(databaseFailure.database, 'failed');
assert.equal(databaseFailure.provider, 'not_run');

const providerFailure = await runSaleSyncSmokeTest({ environment, checkDatabase: async () => {}, provider: provider({ error: 'https://api.example.test/?secret=hidden' }), closePool });
assert.equal(providerFailure.provider, 'failed');
assert.equal(providerFailure.exitCode, 1);

let persisted = false;
const checkOnly = await runSaleSyncSmokeTest({
  environment, checkDatabase: async () => {}, provider: provider(),
  executeSync: async () => { persisted = true; return { started: true, result: syncResult() }; }, closePool
});
assert.equal(checkOnly.exitCode, 0);
assert.equal(checkOnly.persistence, 'not_run');
assert.equal(persisted, false);

const persist = await runSaleSyncSmokeTest({
  mode: 'persist', environment, checkDatabase: async () => {}, provider: provider({ warnings: ['campaign_missing'] }),
  executeSync: async () => ({ started: true, result: syncResult({ warnings: ['campaign_missing'], errors: [{ productId: 'safe', message: 'safe' }] }) }), closePool
});
assert.equal(persist.persistence, 'ok');
assert.equal(persist.exitCode, 0);
assert.equal(persist.createdCount, 1);
assert.equal(persist.warningsCount, 2);
assert.deepEqual(persist.warningReasons, { campaign_missing: 2 });
assert.equal(persist.errorsCount, 1);

const partial = await runSaleSyncSmokeTest({
  mode: 'persist', environment, checkDatabase: async () => {}, provider: provider(),
  executeSync: async () => ({ started: true, result: syncResult({ status: 'partial_success', failedCount: 1 }) }), closePool
});
assert.equal(partial.persistence, 'failed');
assert.equal(partial.exitCode, 1);
assert.ok(closeCount >= 5);

const rendered = formatSaleSyncSmokeTestResult(providerFailure);
assert.doesNotMatch(rendered, /hidden|postgres|https|secret/);
assert.equal(smokeTestMode([]), 'check-only');
assert.equal(smokeTestMode(['--persist']), 'persist');
assert.equal(smokeTestMode(['--unexpected']), undefined);
const output: string[] = [];
const cliResult: SaleSyncSmokeTestResult = { ...checkOnly, exitCode: 0 };
assert.equal(await executeSaleSyncSmokeTestCli([], async () => cliResult, (message) => output.push(message)), 0);
assert.equal(await executeSaleSyncSmokeTestCli(['--unexpected'], async () => cliResult, (message) => output.push(message)), 1);
assert.doesNotMatch(output.join('\n'), /hidden|postgres|https|secret/);
assert.deepEqual(summarizeWarningReasons(['campaign_missing', 'campaign_missing', 'untrusted warning']), { campaign_missing: 2, normalization_failed: 1 });
console.log('sale sync smoke test: ok');
