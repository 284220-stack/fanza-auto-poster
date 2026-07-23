import { randomBytes } from 'node:crypto';
import { DatabaseConfigurationError } from './db/pool.js';
import { ManualSaleSyncError, type ManualSaleSyncResult } from './manual-sale-sync.js';

export type ManualSaleSyncApiService = {
  sync(urls: readonly string[], options: { persist?: boolean; snapshotComplete?: boolean; expectedHash?: string }): Promise<ManualSaleSyncResult>;
};

type CheckedSaleSnapshot = { snapshotHash: string; receivedCount: number; expiresAt: number };

export type ManualSaleCheckTokenRegistry = {
  issue(snapshotHash: string, receivedCount: number): string;
  consume(token: string, snapshotHash: string, receivedCount: number): boolean;
};

export function createManualSaleCheckTokenRegistry(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}): ManualSaleCheckTokenRegistry {
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const maxEntries = options.maxEntries ?? 100;
  const now = options.now ?? Date.now;
  const entries = new Map<string, CheckedSaleSnapshot>();
  const prune = () => {
    const current = now();
    for (const [token, entry] of entries) if (entry.expiresAt <= current) entries.delete(token);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
  };
  return {
    issue(snapshotHash, receivedCount) {
      prune();
      const token = randomBytes(32).toString('base64url');
      entries.set(token, { snapshotHash, receivedCount, expiresAt: now() + ttlMs });
      return token;
    },
    consume(token, snapshotHash, receivedCount) {
      const entry = entries.get(token);
      entries.delete(token);
      return Boolean(entry && entry.expiresAt > now() && entry.snapshotHash === snapshotHash && entry.receivedCount === receivedCount);
    }
  };
}

const defaultCheckTokens = createManualSaleCheckTokenRegistry();

export async function handleManualSaleSyncApiRequest(
  method: string | undefined,
  pathname: string,
  body: Record<string, unknown>,
  create: () => ManualSaleSyncApiService,
  checkTokens: ManualSaleCheckTokenRegistry = defaultCheckTokens
) {
  if (!pathname.startsWith('/api/sales/manual')) return undefined;
  if (pathname !== '/api/sales/manual-sync' || method !== 'POST') return { status: 400, body: { message: 'APIの呼び出し方法が不正です。' } };
  try {
    const allowed = new Set(['urls', 'persist', 'snapshotComplete', 'expectedHash', 'checkToken']);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new ManualSaleSyncError('指定できない項目が含まれています。');
    if (!Array.isArray(body.urls) || !body.urls.every((value) => typeof value === 'string')) throw new ManualSaleSyncError('urlsは文字列の配列で指定してください。');
    if (body.persist !== undefined && typeof body.persist !== 'boolean') throw new ManualSaleSyncError('persistはbooleanで指定してください。');
    if (body.snapshotComplete !== undefined && typeof body.snapshotComplete !== 'boolean') throw new ManualSaleSyncError('snapshotCompleteはbooleanで指定してください。');
    if (body.expectedHash !== undefined && typeof body.expectedHash !== 'string') throw new ManualSaleSyncError('expectedHashは文字列で指定してください。');
    if (body.checkToken !== undefined && typeof body.checkToken !== 'string') throw new ManualSaleSyncError('checkTokenは文字列で指定してください。');
    const persist = body.persist === true;
    const expectedHash = typeof body.expectedHash === 'string' ? body.expectedHash : undefined;
    if (persist) {
      if (!expectedHash || typeof body.checkToken !== 'string' || !checkTokens.consume(body.checkToken, expectedHash, body.urls.length)) {
        throw new ManualSaleSyncError('check-only結果が無効または使用済みです。もう一度確認してください。', 409);
      }
    } else if (body.checkToken !== undefined) {
      throw new ManualSaleSyncError('check-onlyではcheckTokenを指定できません。');
    }
    const result = await create().sync(body.urls, {
      persist,
      snapshotComplete: body.snapshotComplete === true,
      expectedHash
    });
    const checkToken = !persist && isPersistSafe(result)
      ? checkTokens.issue(result.snapshotHash, result.receivedCount)
      : undefined;
    return { status: 200, body: { result: checkToken ? { ...result, checkToken } : result } };
  } catch (error) {
    if (error instanceof ManualSaleSyncError) return { status: error.status, body: { message: error.message } };
    if (error instanceof DatabaseConfigurationError) return { status: 500, body: { message: 'データベースが設定されていません。' } };
    return { status: 500, body: { message: 'セール掲載同期に失敗しました。' } };
  }
}

function isPersistSafe(result: ManualSaleSyncResult) {
  return result.checkOnly && result.schemaReady && result.snapshotComplete && result.receivedCount > 0
    && result.validCount === result.receivedCount
    && result.uniqueProductCount === result.receivedCount
    && result.metadataAvailableCount === result.receivedCount
    && result.invalidCount === 0
    && result.apiNotListedCount === 0
    && result.metadataIdMismatchCount === 0
    && result.invalidMetadataCount === 0
    && result.vrExcludedCount === 0
    && result.failedCount === 0;
}
