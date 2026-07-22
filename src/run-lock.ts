export type AdvisoryLockClient = {
  query<T>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
  release(destroy?: boolean): void;
};

export type AdvisoryLockPool = { connect(): Promise<AdvisoryLockClient> };

export class PostgresAdvisoryRunLock {
  private client?: AdvisoryLockClient;

  constructor(private readonly pool: AdvisoryLockPool, private readonly key: number) {}

  async acquire() {
    if (this.client) return false;
    const client = await this.pool.connect();
    try {
      const acquired = (await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
        [this.key]
      )).rows[0]?.acquired ?? false;
      if (!acquired) {
        client.release();
        return false;
      }
      this.client = client;
      return true;
    } catch (error) {
      client.release(true);
      throw error;
    }
  }

  async release() {
    const client = this.client;
    if (!client) return;
    this.client = undefined;
    try {
      const released = (await client.query<{ released: boolean }>(
        'SELECT pg_advisory_unlock($1::bigint) AS released',
        [this.key]
      )).rows[0]?.released ?? false;
      if (!released) throw new Error('advisory_lock_release_failed');
      client.release();
    } catch (error) {
      client.release(true);
      throw error;
    }
  }
}

export const SCHEDULER_RUN_LOCK_KEY = 7_104_225_001;
export const LIVE_ONE_RUN_LOCK_KEY = 7_104_225_002;
