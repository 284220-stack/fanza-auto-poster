import assert from 'node:assert/strict';
import { formatSaleSyncSmokeTestResult, runSaleSyncSmokeTest, summarizePriceCharacterCounts, summarizePriceCharacterPatterns, summarizePriceDiagnostics, summarizePriceFormats, summarizeUnknownPriceCodePoints, summarizeWarningReasons, type SaleSyncSmokeTestResult } from './sale-sync-smoke-test.js';
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
const characterWarning = 'invalid_price:current_price:unknown_format:string:scalar:length_4:pattern_DDDY:ascii_digits_3:full_width_digits_0:whitespace_0:commas_0:periods_0:currency_symbols_1:japanese_0:hyphens_0:wave_dashes_0:other_symbols_0:unknown_none';
const checkOnly = await runSaleSyncSmokeTest({
  environment, checkDatabase: async () => {}, provider: provider(),
  executeSync: async () => { persisted = true; return { started: true, result: syncResult() }; }, closePool
});
assert.equal(checkOnly.exitCode, 0);
assert.equal(checkOnly.persistence, 'not_run');
assert.equal(persisted, false);

const persist = await runSaleSyncSmokeTest({
  mode: 'persist', environment, checkDatabase: async () => {}, provider: provider({ warnings: [characterWarning] }),
  executeSync: async () => ({ started: true, result: syncResult({ warnings: [characterWarning], errors: [{ productId: 'safe', message: 'safe' }] }) }), closePool
});
assert.equal(persist.persistence, 'ok');
assert.equal(persist.exitCode, 0);
assert.equal(persist.createdCount, 1);
assert.equal(persist.warningsCount, 2);
assert.deepEqual(persist.warningReasons, { invalid_price: 2 });
assert.deepEqual(persist.priceFormats, { 'current_price:unknown_format': 2 });
assert.deepEqual(persist.priceDiagnostics, { 'current_price:string:scalar:length_4': 2 });
assert.deepEqual(persist.priceCharacterPatterns, { 'current_price:DDDY': 2 });
assert.deepEqual(persist.priceCharacterCounts, { 'current_price:ascii_digits': 6, 'current_price:full_width_digits': 0, 'current_price:whitespace': 0, 'current_price:commas': 0, 'current_price:periods': 0, 'current_price:currency_symbols': 2, 'current_price:japanese': 0, 'current_price:hyphens': 0, 'current_price:wave_dashes': 0, 'current_price:other_symbols': 0 });
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
assert.deepEqual(summarizeWarningReasons(['price_missing:list_price:unsupported_type:undefined:scalar:length_na']), { price_missing: 1 });
assert.deepEqual(summarizePriceFormats(['invalid_price:list_price:yen_suffix:string:scalar:length_5']), { 'list_price:yen_suffix': 1 });
assert.deepEqual(summarizePriceDiagnostics(['invalid_price:list_price:yen_suffix:string:scalar:length_5']), { 'list_price:string:scalar:length_5': 1 });
assert.deepEqual(summarizePriceCharacterPatterns([characterWarning]), { 'current_price:DDDY': 1 });
assert.deepEqual(summarizePriceCharacterCounts([characterWarning]), { 'current_price:ascii_digits': 3, 'current_price:full_width_digits': 0, 'current_price:whitespace': 0, 'current_price:commas': 0, 'current_price:periods': 0, 'current_price:currency_symbols': 1, 'current_price:japanese': 0, 'current_price:hyphens': 0, 'current_price:wave_dashes': 0, 'current_price:other_symbols': 0 });
const unknownWarning = 'invalid_price:list_price:unknown_format:string:scalar:length_1:pattern_X:ascii_digits_0:full_width_digits_0:whitespace_0:commas_0:periods_0:currency_symbols_0:japanese_0:hyphens_0:wave_dashes_0:other_symbols_0:unknown_U+1F600=1';
assert.deepEqual(summarizeUnknownPriceCodePoints([unknownWarning]), { 'list_price:U+1F600': 1 });
console.log('sale sync smoke test: ok');
