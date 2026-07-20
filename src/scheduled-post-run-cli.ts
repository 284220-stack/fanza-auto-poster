import type { ScheduledPostRunResult } from './scheduled-post-run.js';

export function parseScheduledPostRunArguments(args: string[]) {
  const execute = args.includes('--execute');
  const equals = args.find((arg) => arg.startsWith('--limit='));
  const separateIndex = args.indexOf('--limit');
  const value = equals?.slice('--limit='.length) ?? (separateIndex >= 0 ? args[separateIndex + 1] : undefined);
  const parsed = value === undefined ? 5 : Number(value);
  return { mode: execute ? 'execute' as const : 'preview' as const, limit: Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 5) : 5 };
}

export function scheduledPostRunExitCode(result: ScheduledPostRunResult) {
  if (result.alreadyRunning || result.failedCount > 0) return 1;
  if (result.mode === 'execute' && (result.partialSuccessCount > 0 || result.blockedCount > 0)) return 1;
  return 0;
}
