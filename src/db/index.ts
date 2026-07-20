export { checkDatabaseConnection, DatabaseConnectionError } from './health.js';
export {
  closeDatabasePool,
  createDatabasePool,
  databasePoolConfig,
  DatabaseConfigurationError,
  DatabasePoolClosedError,
  DatabasePoolCloseError,
  getDatabasePool,
  registerDatabaseShutdownHandlers
} from './pool.js';
