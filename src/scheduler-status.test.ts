import assert from 'node:assert/strict';
import { canRunSchedulerLive, schedulerStatus } from './scheduler-status.js';

assert.deepEqual(schedulerStatus({ DRY_RUN: 'true' }), {
  enabled: false, timeJst: null, timeConfigured: false, timezone: 'Asia/Tokyo', executionMode: 'disabled', lock: 'postgres_advisory',
  categoryLimits: { sale: 2, actress: 2, favoriteSale: 1, total: 5 }
});
assert.equal(schedulerStatus({ SCHEDULER_ENABLED: 'true', SCHEDULER_TIME_JST: '09:30', DRY_RUN: 'true' }).executionMode, 'dry_run');
assert.equal(schedulerStatus({ SCHEDULER_ENABLED: 'true', SCHEDULER_TIME_JST: '25:00', DRY_RUN: 'false' }).timeConfigured, false);
assert.equal(canRunSchedulerLive({ SCHEDULER_ENABLED: 'true', SCHEDULER_TIME_JST: '09:30', DRY_RUN: 'false' }), true);
assert.equal(canRunSchedulerLive({ SCHEDULER_ENABLED: 'false', SCHEDULER_TIME_JST: '09:30', DRY_RUN: 'false' }), false);
assert.equal(canRunSchedulerLive({ SCHEDULER_ENABLED: 'true', SCHEDULER_TIME_JST: '09:30', DRY_RUN: 'true' }), false);

console.log('scheduler status: ok');
