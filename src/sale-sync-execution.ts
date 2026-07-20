import type { Queryable } from './actresses.js';
import { getDatabasePool } from './db/pool.js';
import { FanzaSaleProvider, type HttpClient } from './fanza-sale-provider.js';
import { ProductRepository, ProductService } from './products.js';
import type { ProductWriter } from './sale-product-persistence.js';
import { SaleSyncRunner, type Logger, type SyncResult } from './sale-sync-runner.js';

export type SaleSyncRunnable = {
  run(): Promise<SyncResult>;
};

export type SaleSyncExecutionResult =
  | { started: true; result: SyncResult }
  | { started: false; reason: 'already_running' };

export type SaleSyncExecutionOptions = {
  createRunner: () => SaleSyncRunnable;
  logger?: Logger;
};

export class SaleSyncExecutionError extends Error {
  constructor() {
    super('セール同期を開始できませんでした。');
    this.name = 'SaleSyncExecutionError';
  }
}

export class SaleSyncExecutionService {
  private running = false;

  constructor(private readonly options: SaleSyncExecutionOptions) {}

  async run(): Promise<SaleSyncExecutionResult> {
    if (this.running) return { started: false, reason: 'already_running' };

    this.running = true;
    try {
      return { started: true, result: await this.options.createRunner().run() };
    } catch {
      this.options.logger?.error('セール同期を開始できませんでした。');
      throw new SaleSyncExecutionError();
    } finally {
      this.running = false;
    }
  }
}

export type SaleSyncExecutor = Pick<SaleSyncExecutionService, 'run'>;

function fetchHttpClient(): HttpClient {
  return {
    async get(url, signal) {
      const response = await fetch(url, { signal });
      return { status: response.status, json: () => response.json() };
    }
  };
}

function requireConfiguration(environment: NodeJS.ProcessEnv) {
  if (!environment.DATABASE_URL?.trim() || !environment.DMM_API_ID?.trim() || !environment.DMM_AFFILIATE_ID?.trim()) {
    throw new SaleSyncExecutionError();
  }
}

function createProductWriter(environment: NodeJS.ProcessEnv): ProductWriter {
  const database = getDatabasePool(environment) as unknown as Queryable;
  return new ProductService(new ProductRepository(database));
}

export function createSaleSyncExecutionService(
  environment: NodeJS.ProcessEnv = process.env,
  logger?: Logger
): SaleSyncExecutionService {
  return new SaleSyncExecutionService({
    logger,
    createRunner: () => {
      requireConfiguration(environment);
      return new SaleSyncRunner({
        provider: new FanzaSaleProvider(fetchHttpClient(), environment),
        writer: createProductWriter(environment),
        logger
      });
    }
  });
}

let sharedService: SaleSyncExecutionService | undefined;

export function getSaleSyncExecutionService() {
  sharedService ??= createSaleSyncExecutionService();
  return sharedService;
}
