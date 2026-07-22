import type { AdvisoryLockPool } from './run-lock.js';

export function jstDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export class SchedulerDailyGuardRepository {
  constructor(private readonly pool: AdvisoryLockPool) {}

  async reserve(now = new Date()) {
    const client = await this.pool.connect();
    try {
      const key = `scheduler_live_run:${jstDateKey(now)}`;
      const result = await client.query<{ key: string }>(
        "INSERT INTO settings (key, value) VALUES ($1, jsonb_build_object('reservedAt',current_timestamp,'timezone','Asia/Tokyo')) ON CONFLICT (key) DO NOTHING RETURNING key",
        [key]
      );
      return result.rows.length === 1;
    } finally { client.release(); }
  }
}
