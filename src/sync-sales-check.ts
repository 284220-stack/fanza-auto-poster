import { formatSaleSyncSmokeTestResult, runSaleSyncSmokeTest, type SaleSyncSmokeTestResult, type SmokeTestMode } from './sale-sync-smoke-test.js';

export function smokeTestMode(args: readonly string[]): SmokeTestMode | undefined {
  if (args.length === 0) return 'check-only';
  if (args.length === 1 && args[0] === '--persist') return 'persist';
  return undefined;
}

export async function executeSaleSyncSmokeTestCli(
  args: readonly string[],
  run: (mode: SmokeTestMode) => Promise<SaleSyncSmokeTestResult> = (mode) => runSaleSyncSmokeTest({ mode }),
  output: (message: string) => void = console.log
): Promise<0 | 1> {
  const mode = smokeTestMode(args);
  if (!mode) {
    output('使用方法: npm run sync:sales:check [-- --persist]');
    return 1;
  }
  const result = await run(mode);
  output(formatSaleSyncSmokeTestResult(result));
  return result.exitCode;
}

async function main() {
  process.exitCode = await executeSaleSyncSmokeTestCli(process.argv.slice(2));
}

if (process.argv[1]?.endsWith('sync-sales-check.js')) {
  void main();
}
