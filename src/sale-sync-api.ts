import type { SyncResult } from './sale-sync-runner.js';
import type { SaleSyncExecutor } from './sale-sync-execution.js';

export type SaleSyncApiResponse = {
  status: 200 | 400 | 409 | 500;
  body: Record<string, unknown>;
};

function summary(result: SyncResult) {
  return {
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    fetchedCount: result.fetchedCount,
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    warningsCount: result.warnings.length,
    errorsCount: result.errors.length
  };
}

export async function handleSaleSyncApiRequest(method: string | undefined, executor: SaleSyncExecutor): Promise<SaleSyncApiResponse> {
  if (method !== 'POST') return { status: 400, body: { message: 'POST メソッドで実行してください。' } };

  try {
    const execution = await executor.run();
    if (!execution.started) return { status: 409, body: { message: 'セール同期はすでに実行中です。' } };

    const sync = summary(execution.result);
    if (execution.result.status === 'failed') {
      return { status: 500, body: { message: 'セール同期に失敗しました。', sync } };
    }
    return { status: 200, body: { sync } };
  } catch {
    return { status: 500, body: { message: 'セール同期を開始できませんでした。' } };
  }
}
