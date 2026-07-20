import { Pool, type PoolConfig } from 'pg';

export type DatabasePool = {
  query(statement: string): Promise<unknown>;
  end(): Promise<void>;
};
export type PoolFactory = (config: PoolConfig) => DatabasePool;
export type ShutdownSignalRegistrar = {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
};

export class DatabaseConfigurationError extends Error {
  constructor() {
    super('DATABASE_URL is required for database operations.');
    this.name = 'DatabaseConfigurationError';
  }
}

export class DatabasePoolClosedError extends Error {
  constructor() {
    super('Database pool is closed.');
    this.name = 'DatabasePoolClosedError';
  }
}

export class DatabasePoolCloseError extends Error {
  constructor() {
    super('Database pool close failed.');
    this.name = 'DatabasePoolCloseError';
  }
}

let pool: DatabasePool | undefined;
let poolState: 'open' | 'closing' | 'closed' = 'open';
let closePromise: Promise<void> | undefined;
let shutdownHandlersRegistered = false;

function databaseUrl(environment: NodeJS.ProcessEnv) {
  const value = environment.DATABASE_URL?.trim();
  if (!value) throw new DatabaseConfigurationError();
  return value;
}

function sslConfig(environment: NodeJS.ProcessEnv) {
  const sslMode = environment.PGSSLMODE?.toLowerCase();
  const sslEnabled = environment.DATABASE_SSL?.toLowerCase() === 'true'
    || ['require', 'no-verify', 'verify-ca', 'verify-full'].includes(sslMode ?? '');
  if (!sslEnabled) return undefined;
  const disablesVerification = environment.DATABASE_SSL_REJECT_UNAUTHORIZED?.toLowerCase() === 'false' || sslMode === 'no-verify';
  return { rejectUnauthorized: !disablesVerification };
}

function ensurePoolOpen() {
  if (poolState !== 'open') throw new DatabasePoolClosedError();
}

export function databasePoolConfig(environment: NodeJS.ProcessEnv = process.env): PoolConfig {
  const connectionString = databaseUrl(environment);
  const ssl = sslConfig(environment);
  return {
    connectionString,
    ...(ssl ? { ssl } : {})
  };
}

export function createDatabasePool(
  environment: NodeJS.ProcessEnv = process.env,
  createPool: PoolFactory = (config) => new Pool(config)
) {
  ensurePoolOpen();
  return createPool(databasePoolConfig(environment));
}

export function getDatabasePool(
  environment: NodeJS.ProcessEnv = process.env,
  createPool: PoolFactory = (config) => new Pool(config)
) {
  ensurePoolOpen();
  pool ??= createDatabasePool(environment, createPool);
  return pool;
}

export async function closeDatabasePool() {
  if (closePromise) return closePromise;
  poolState = 'closing';
  const activePool = pool;
  pool = undefined;
  closePromise = activePool
    ? activePool.end().then(
      () => undefined,
      () => { throw new DatabasePoolCloseError(); }
    )
    : Promise.resolve();
  closePromise = closePromise.finally(() => { poolState = 'closed'; });
  return closePromise;
}

export function registerDatabaseShutdownHandlers(registrar: ShutdownSignalRegistrar = process) {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;
  const close = () => {
    void closeDatabasePool().catch(() => undefined);
  };
  registrar.once('SIGINT', close);
  registrar.once('SIGTERM', close);
}
