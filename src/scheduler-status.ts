export type SchedulerStatus = {
  enabled: boolean;
  timeJst: string | null;
  timeConfigured: boolean;
  timezone: 'Asia/Tokyo';
  executionMode: 'disabled' | 'dry_run' | 'live';
  lock: 'postgres_advisory';
  categoryLimits: { sale: 2; actress: 2; favoriteSale: 1; total: 5 };
};

export function schedulerStatus(values: Record<string, string>): SchedulerStatus {
  const rawTime = values.SCHEDULER_TIME_JST?.trim() ?? '';
  const timeJst = /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(rawTime) ? rawTime : null;
  const enabled = (values.SCHEDULER_ENABLED ?? 'false').toLowerCase() === 'true';
  const dryRun = (values.DRY_RUN ?? 'true').toLowerCase() !== 'false';
  return {
    enabled,
    timeJst,
    timeConfigured: timeJst !== null,
    timezone: 'Asia/Tokyo',
    executionMode: enabled ? (dryRun ? 'dry_run' : 'live') : 'disabled',
    lock: 'postgres_advisory',
    categoryLimits: { sale: 2, actress: 2, favoriteSale: 1, total: 5 }
  };
}

export function canRunSchedulerLive(values: Record<string, string>) {
  const status = schedulerStatus(values);
  return status.enabled && status.timeConfigured && status.executionMode === 'live';
}
