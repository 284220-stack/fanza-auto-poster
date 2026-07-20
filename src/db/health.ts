import { getDatabasePool } from './pool.js';

export type DatabaseQueryExecutor = {
  query(statement: string): Promise<unknown>;
};

export class DatabaseConnectionError extends Error {
  constructor() {
    super('Database connection check failed.');
    this.name = 'DatabaseConnectionError';
  }
}

export async function checkDatabaseConnection(pool: DatabaseQueryExecutor = getDatabasePool()) {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new DatabaseConnectionError();
  }
}
