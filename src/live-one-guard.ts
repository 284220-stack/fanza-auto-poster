import { createHash } from 'node:crypto';
import type { AdvisoryLockPool } from './run-lock.js';

export class LiveOneGuardRepository {
  constructor(private readonly pool: AdvisoryLockPool) {}

  async reserve(productId: number, confirmationToken: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [7_104_225_003]);
      const existing = (await client.query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM settings WHERE key='live_one_post_attempt') AS exists")).rows[0]?.exists ?? false;
      if (existing) {
        await client.query('ROLLBACK');
        return false;
      }
      const tokenHash = createHash('sha256').update(confirmationToken).digest('hex');
      await client.query("INSERT INTO settings (key, value) VALUES ('live_one_post_attempt', jsonb_build_object('productId',$1::int,'tokenHash',$2::text,'attemptedAt',current_timestamp))", [productId, tokenHash]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
