import { checkDatabaseConnection, type DatabaseQueryExecutor } from './db/health.js';
import { closeDatabasePool, getDatabasePool } from './db/pool.js';
import { FanzaSaleProvider, type HttpClient } from './fanza-sale-provider.js';
import type { ProductProvider, ProviderResult } from './providers.js';
import { createSaleSyncExecutionService, type SaleSyncExecutionResult } from './sale-sync-execution.js';

export type SmokeTestMode = 'check-only' | 'persist';
export type SmokeCheckState = 'ok' | 'failed' | 'not_run';

export type SaleSyncSmokeTestResult = {
  configuration: SmokeCheckState;
  database: SmokeCheckState;
  provider: SmokeCheckState;
  persistence: SmokeCheckState;
  syncStatus?: 'success' | 'partial_success' | 'failed';
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  warningsCount: number;
  warningReasons: Record<string, number>;
  priceFormats: Record<string, number>;
  priceDiagnostics: Record<string, number>;
  priceCharacterPatterns: Record<string, number>;
  priceCharacterCounts: Record<string, number>;
  unknownPriceCodePoints: Record<string, number>;
  errorsCount: number;
  exitCode: 0 | 1;
};

export type SaleSyncSmokeTestOptions = {
  mode?: SmokeTestMode;
  environment?: NodeJS.ProcessEnv;
  checkDatabase?: () => Promise<void>;
  provider?: ProductProvider;
  executeSync?: () => Promise<SaleSyncExecutionResult>;
  closePool?: () => Promise<void>;
};

function blankResult(): SaleSyncSmokeTestResult {
  return {
    configuration: 'not_run', database: 'not_run', provider: 'not_run', persistence: 'not_run',
    fetchedCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0,
    warningsCount: 0, warningReasons: {}, priceFormats: {}, priceDiagnostics: {}, priceCharacterPatterns: {}, priceCharacterCounts: {}, unknownPriceCodePoints: {}, errorsCount: 0, exitCode: 1
  };
}

function hasRequiredConfiguration(environment: NodeJS.ProcessEnv) {
  return Boolean(environment.DATABASE_URL?.trim() && environment.DMM_API_ID?.trim() && environment.DMM_AFFILIATE_ID?.trim());
}

function fetchHttpClient(): HttpClient {
  return {
    async get(url, signal) {
      const response = await fetch(url, { signal });
      return { status: response.status, json: () => response.json() };
    }
  };
}

function defaultDatabaseCheck(environment: NodeJS.ProcessEnv) {
  const pool = getDatabasePool(environment) as DatabaseQueryExecutor;
  return () => checkDatabaseConnection(pool);
}

function providerFailure(result: ProviderResult) {
  return Boolean(result.error);
}

const safeWarningCodes = new Set([
  'campaign_missing', 'campaign_out_of_period', 'price_missing', 'invalid_price',
  'price_not_discounted', 'required_field_missing', 'invalid_url', 'normalization_failed'
]);
const detailedPriceWarning = /^(invalid_price|price_missing):(current_price|list_price):(numeric_only|comma_separated|currency_symbol|yen_suffix|range|text_included|empty|unsupported_type|unknown_format):([a-z]+):(array|object|scalar):length_(\d+|na)(.*)$/;
const characterDetails = /^:pattern_([DYCSPRJX]*):ascii_digits_(\d+):full_width_digits_(\d+):whitespace_(\d+):commas_(\d+):periods_(\d+):currency_symbols_(\d+):japanese_(\d+):hyphens_(\d+):wave_dashes_(\d+):other_symbols_(\d+):unknown_(none|(?:U\+[0-9A-F]{4,6}=\d+)(?:,U\+[0-9A-F]{4,6}=\d+)*)$/;

type PriceCharacterDetails = { pattern: string; counts: Record<string, number>; unknownCodePoints: Record<string, number> };
type PriceWarningDetails = { reason: 'invalid_price' | 'price_missing'; field: string; format: string; javascriptType: string; shape: string; length: string; characters?: PriceCharacterDetails };

function priceWarningDetails(warning: string): PriceWarningDetails | undefined {
  const match = warning.match(detailedPriceWarning);
  if (!match) return undefined;
  const characterMatch = match[7].match(characterDetails);
  const unknownCodePoints: Record<string, number> = {};
  if (characterMatch && characterMatch[12] !== 'none') {
    for (const item of characterMatch[12].split(',')) {
      const [codePoint, count] = item.split('=');
      unknownCodePoints[codePoint] = Number(count);
    }
  }
  return {
    reason: match[1] as PriceWarningDetails['reason'], field: match[2], format: match[3], javascriptType: match[4], shape: match[5], length: match[6],
    characters: characterMatch ? {
      pattern: characterMatch[1],
      counts: {
        ascii_digits: Number(characterMatch[2]), full_width_digits: Number(characterMatch[3]), whitespace: Number(characterMatch[4]),
        commas: Number(characterMatch[5]), periods: Number(characterMatch[6]), currency_symbols: Number(characterMatch[7]),
        japanese: Number(characterMatch[8]), hyphens: Number(characterMatch[9]), wave_dashes: Number(characterMatch[10]), other_symbols: Number(characterMatch[11])
      },
      unknownCodePoints
    } : undefined
  };
}

export function summarizeWarningReasons(warnings: readonly string[]) {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    const details = priceWarningDetails(warning);
    const code = details?.reason ?? (warning.startsWith('price_missing:')
      ? 'price_missing'
      : safeWarningCodes.has(warning) ? warning : 'normalization_failed');
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
}

export function summarizePriceFormats(warnings: readonly string[]) {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    const details = priceWarningDetails(warning);
    if (!details) return counts;
    const key = `${details.field}:${details.format}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function summarizePriceDiagnostics(warnings: readonly string[]) {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    const details = priceWarningDetails(warning);
    if (!details) return counts;
    const key = `${details.field}:${details.javascriptType}:${details.shape}:length_${details.length}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function summarizePriceCharacterPatterns(warnings: readonly string[]) {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    const details = priceWarningDetails(warning);
    if (!details?.characters) return counts;
    const key = `${details.field}:${details.characters.pattern}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function summarizePriceCharacterCounts(warnings: readonly string[]) {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    const details = priceWarningDetails(warning);
    if (!details?.characters) return counts;
    for (const [name, count] of Object.entries(details.characters.counts)) {
      const key = `${details.field}:${name}`;
      counts[key] = (counts[key] ?? 0) + count;
    }
    return counts;
  }, {});
}

export function summarizeUnknownPriceCodePoints(warnings: readonly string[]) {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    const details = priceWarningDetails(warning);
    if (!details?.characters) return counts;
    for (const [codePoint, count] of Object.entries(details.characters.unknownCodePoints)) {
      const key = `${details.field}:${codePoint}`;
      counts[key] = (counts[key] ?? 0) + count;
    }
    return counts;
  }, {});
}

function addWarningReasons(target: Record<string, number>, warnings: readonly string[]) {
  for (const [code, count] of Object.entries(summarizeWarningReasons(warnings))) target[code] = (target[code] ?? 0) + count;
}

function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, count] of Object.entries(source)) target[key] = (target[key] ?? 0) + count;
}

function addPriceDiagnostics(result: SaleSyncSmokeTestResult, warnings: readonly string[]) {
  addCounts(result.priceFormats, summarizePriceFormats(warnings));
  addCounts(result.priceDiagnostics, summarizePriceDiagnostics(warnings));
  addCounts(result.priceCharacterPatterns, summarizePriceCharacterPatterns(warnings));
  addCounts(result.priceCharacterCounts, summarizePriceCharacterCounts(warnings));
  addCounts(result.unknownPriceCodePoints, summarizeUnknownPriceCodePoints(warnings));
}

export async function runSaleSyncSmokeTest(options: SaleSyncSmokeTestOptions = {}): Promise<SaleSyncSmokeTestResult> {
  const environment = options.environment ?? process.env;
  const mode = options.mode ?? 'check-only';
  const result = blankResult();
  const closePool = options.closePool ?? closeDatabasePool;

  try {
    if (!hasRequiredConfiguration(environment)) {
      result.configuration = 'failed';
      return result;
    }
    result.configuration = 'ok';

    try {
      await (options.checkDatabase ?? defaultDatabaseCheck(environment))();
      result.database = 'ok';
    } catch {
      result.database = 'failed';
      return result;
    }

    const provider = options.provider ?? new FanzaSaleProvider(fetchHttpClient(), environment);
    let providerResult: ProviderResult;
    try {
      providerResult = await provider.fetch({ limit: 1, page: 1, saleOnly: true });
    } catch {
      result.provider = 'failed';
      result.errorsCount = 1;
      return result;
    }
    result.warningsCount = providerResult.warnings.length;
    addWarningReasons(result.warningReasons, providerResult.warnings);
    addPriceDiagnostics(result, providerResult.warnings);
    if (providerFailure(providerResult)) {
      result.provider = 'failed';
      result.errorsCount = 1;
      return result;
    }
    result.provider = 'ok';

    if (mode === 'check-only') {
      result.exitCode = 0;
      return result;
    }

    try {
      const execution = await (options.executeSync ?? (() => createSaleSyncExecutionService(environment).run()))();
      if (!execution.started) {
        result.persistence = 'failed';
        result.errorsCount += 1;
        return result;
      }

      const sync = execution.result;
      result.persistence = sync.status === 'success' ? 'ok' : 'failed';
      result.syncStatus = sync.status;
      result.fetchedCount = sync.fetchedCount;
      result.createdCount = sync.createdCount;
      result.updatedCount = sync.updatedCount;
      result.skippedCount = sync.skippedCount;
      result.failedCount = sync.failedCount;
      result.warningsCount += sync.warnings.length;
      addWarningReasons(result.warningReasons, sync.warnings);
      addPriceDiagnostics(result, sync.warnings);
      result.errorsCount += sync.errors.length;
      result.exitCode = sync.status === 'success' ? 0 : 1;
      return result;
    } catch {
      result.persistence = 'failed';
      result.errorsCount += 1;
      return result;
    }
  } finally {
    try {
      await closePool();
    } catch {
      result.database = result.database === 'ok' ? 'failed' : result.database;
      result.errorsCount += 1;
      result.exitCode = 1;
    }
  }
}

export function formatSaleSyncSmokeTestResult(result: SaleSyncSmokeTestResult) {
  const warningReasons = Object.entries(result.warningReasons).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `${code}=${count}`).join(',') || 'none';
  const priceFormats = Object.entries(result.priceFormats).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `${code}=${count}`).join(',') || 'none';
  const priceDiagnostics = Object.entries(result.priceDiagnostics).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `${code}=${count}`).join(',') || 'none';
  const priceCharacterPatterns = Object.entries(result.priceCharacterPatterns).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `${code}=${count}`).join(',') || 'none';
  const priceCharacterCounts = Object.entries(result.priceCharacterCounts).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `${code}=${count}`).join(',') || 'none';
  const unknownPriceCodePoints = Object.entries(result.unknownPriceCodePoints).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `${code}=${count}`).join(',') || 'none';
  return [
    `configuration: ${result.configuration}`,
    `database: ${result.database}`,
    `provider: ${result.provider}`,
    `persistence: ${result.persistence}`,
    `syncStatus: ${result.syncStatus ?? 'not_run'}`,
    `fetchedCount: ${result.fetchedCount}`,
    `createdCount: ${result.createdCount}`,
    `updatedCount: ${result.updatedCount}`,
    `skippedCount: ${result.skippedCount}`,
    `failedCount: ${result.failedCount}`,
    `warningsCount: ${result.warningsCount}`,
    `warningReasons: ${warningReasons}`,
    `priceFormats: ${priceFormats}`,
    `priceDiagnostics: ${priceDiagnostics}`,
    `priceCharacterPatterns: ${priceCharacterPatterns}`,
    `priceCharacterCounts: ${priceCharacterCounts}`,
    `unknownPriceCodePoints: ${unknownPriceCodePoints}`,
    `errorsCount: ${result.errorsCount}`
  ].join('\n');
}
