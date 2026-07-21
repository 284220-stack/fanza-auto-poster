import assert from 'node:assert/strict';
import { formatSaleSyncSmokeTestResult, runSaleSyncSmokeTest, summarizeWarningReasons } from './sale-sync-smoke-test.js';
import { executeSaleSyncSmokeTestCli, smokeTestMode } from './sync-sales-check.js';
import type { ProductProvider, ProviderResult } from './providers.js';
import type { SyncResult } from './sale-sync-runner.js';

const environment = { DATABASE_URL: 'postgres://hidden', DMM_API_ID: 'hidden-api-id', DMM_AFFILIATE_ID: 'hidden-affiliate-id' };
function provider(overrides: Partial<ProviderResult> = {}): ProductProvider { return { source: 'sale', async fetch() { return { source: 'sale', items: [], fetchedAt: '2026-07-20T00:00:00.000Z', warnings: [], hasMore: false, ...overrides }; } }; }
function syncResult(overrides: Partial<SyncResult> = {}): SyncResult { return { startedAt: '2026-07-20T00:00:00.000Z', completedAt: '2026-07-20T00:00:01.000Z', durationMs: 1000, fetchedCount: 1, createdCount: 1, updatedCount: 0, skippedCount: 0, failedCount: 0, warnings: [], errors: [], status: 'success', ...overrides }; }
let closeCount = 0;
const closePool = async () => { closeCount += 1; };
const missing = await runSaleSyncSmokeTest({ environment: {}, closePool });
assert.equal(missing.configuration, 'failed');
const checkOnly = await runSaleSyncSmokeTest({ environment, checkDatabase: async () => {}, provider: provider({ responseItemCount: 3, saveCandidateCount: 3, priceAvailableCount: 1, priceUnavailableCount: 2, saleEligibleCount: 1, saleIneligibleCount: 2, warnings: ['price_unavailable', 'price_unavailable'] }), closePool });
assert.equal(checkOnly.exitCode, 0);
assert.equal(checkOnly.priceUnavailableCount, 2);
assert.equal(checkOnly.errorsCount, 0);
const persist = await runSaleSyncSmokeTest({ mode: 'persist', environment, checkDatabase: async () => {}, provider: provider({ priceUnavailableCount: 1, warnings: ['price_unavailable'] }), executeSync: async () => ({ started: true, result: syncResult({ warnings: ['price_unavailable'] }) }), closePool });
assert.equal(persist.exitCode, 0);
assert.equal(persist.createdCount, 1);
assert.deepEqual(persist.warningReasons, { price_unavailable: 2 });
assert.ok(closeCount >= 3);
assert.doesNotMatch(formatSaleSyncSmokeTestResult(persist), /hidden|postgres/);
assert.deepEqual(summarizeWarningReasons(['price_unavailable', 'bad']), { price_unavailable: 1, normalization_failed: 1 });
assert.equal(smokeTestMode([]), 'check-only'); assert.equal(smokeTestMode(['--persist']), 'persist');
const output: string[] = [];
assert.equal(await executeSaleSyncSmokeTestCli([], async () => ({ ...checkOnly, exitCode: 0 }), (message) => output.push(message)), 0);
assert.doesNotMatch(output.join('\n'), /hidden|postgres/);
console.log('sale sync smoke test: ok');
