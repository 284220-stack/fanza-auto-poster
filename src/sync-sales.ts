import { closeDatabasePool } from './db/pool.js';
import { getSaleSyncExecutionService, type SaleSyncExecutor } from './sale-sync-execution.js';

export type SaleSyncCliResult = {
  exitCode: 0 | 1;
  output: string;
};

export async function runSaleSyncCli(executor: SaleSyncExecutor): Promise<SaleSyncCliResult> {
  try {
    const execution = await executor.run();
    if (!execution.started) return { exitCode: 1, output: 'セール同期はすでに実行中です。' };

    const result = execution.result;
    const exitCode: 0 | 1 = result.status === 'success' ? 0 : 1;
    return {
      exitCode,
      output: `セール同期: status=${result.status}, fetched=${result.fetchedCount}, created=${result.createdCount}, updated=${result.updatedCount}, skipped=${result.skippedCount}, failed=${result.failedCount}, warnings=${result.warnings.length}, errors=${result.errors.length}`
    };
  } catch {
    return { exitCode: 1, output: 'セール同期を開始できませんでした。' };
  }
}

export async function executeSaleSyncCli(
  executor: SaleSyncExecutor,
  closePool: () => Promise<void> = closeDatabasePool,
  output: (message: string) => void = console.log,
  errorOutput: (message: string) => void = console.error
): Promise<0 | 1> {
  const cliResult = await runSaleSyncCli(executor);
  output(cliResult.output);
  try {
    await closePool();
  } catch {
    errorOutput('データベース接続を終了できませんでした。');
    return 1;
  }
  return cliResult.exitCode;
}

async function main() {
  process.exitCode = await executeSaleSyncCli(getSaleSyncExecutionService());
}

if (process.argv[1]?.endsWith('sync-sales.js')) {
  void main();
}
