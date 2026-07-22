import { DatabaseConfigurationError } from './db/pool.js';
import { ManualSaleSyncError, type ManualSaleSyncResult } from './manual-sale-sync.js';

export type ManualSaleSyncApiService = {
  sync(urls: readonly string[], options: { persist?: boolean; snapshotComplete?: boolean; expectedHash?: string }): Promise<ManualSaleSyncResult>;
};

export async function handleManualSaleSyncApiRequest(
  method: string | undefined,
  pathname: string,
  body: Record<string, unknown>,
  create: () => ManualSaleSyncApiService
) {
  if (!pathname.startsWith('/api/sales/manual')) return undefined;
  if (pathname !== '/api/sales/manual-sync' || method !== 'POST') return { status: 400, body: { message: 'APIの呼び出し方法が不正です。' } };
  try {
    const allowed = new Set(['urls', 'persist', 'snapshotComplete', 'expectedHash']);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new ManualSaleSyncError('指定できない項目が含まれています。');
    if (!Array.isArray(body.urls) || !body.urls.every((value) => typeof value === 'string')) throw new ManualSaleSyncError('urlsは文字列の配列で指定してください。');
    if (body.persist !== undefined && typeof body.persist !== 'boolean') throw new ManualSaleSyncError('persistはbooleanで指定してください。');
    if (body.snapshotComplete !== undefined && typeof body.snapshotComplete !== 'boolean') throw new ManualSaleSyncError('snapshotCompleteはbooleanで指定してください。');
    if (body.expectedHash !== undefined && typeof body.expectedHash !== 'string') throw new ManualSaleSyncError('expectedHashは文字列で指定してください。');
    const result = await create().sync(body.urls, {
      persist: body.persist === true,
      snapshotComplete: body.snapshotComplete === true,
      expectedHash: typeof body.expectedHash === 'string' ? body.expectedHash : undefined
    });
    return { status: 200, body: { result } };
  } catch (error) {
    if (error instanceof ManualSaleSyncError) return { status: error.status, body: { message: error.message } };
    if (error instanceof DatabaseConfigurationError) return { status: 500, body: { message: 'データベースが設定されていません。' } };
    return { status: 500, body: { message: 'セール掲載同期に失敗しました。' } };
  }
}
