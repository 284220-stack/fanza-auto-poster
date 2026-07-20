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
    warningsCount: 0, errorsCount: 0, exitCode: 1
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
    `errorsCount: ${result.errorsCount}`
  ].join('\n');
}
