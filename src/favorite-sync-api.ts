import { DatabaseConfigurationError } from './db/pool.js';
import { FavoriteSyncError, type FavoriteSyncResult } from './favorites.js';

export type FavoriteSyncApiService = { sync(urls: readonly string[], persist?: boolean): Promise<FavoriteSyncResult> };
export type FavoriteSyncApiResponse = { status: number; body: Record<string, unknown> };

export async function handleFavoriteSyncApiRequest(method: string | undefined, pathname: string, body: Record<string, unknown>, create: () => FavoriteSyncApiService): Promise<FavoriteSyncApiResponse | undefined> {
  if (!pathname.startsWith('/api/favorites')) return undefined;
  if (pathname !== '/api/favorites/sync' || method !== 'POST') return { status: 400, body: { message: 'APIの呼び出し方法が不正です。' } };
  try {
    const unknownKey = Object.keys(body).find((key) => key !== 'urls' && key !== 'persist');
    if (unknownKey) throw new FavoriteSyncError('指定できない項目が含まれています。');
    if (!Array.isArray(body.urls) || !body.urls.every((value) => typeof value === 'string')) throw new FavoriteSyncError('urlsは文字列の配列で指定してください。');
    if (body.urls.length > 20) throw new FavoriteSyncError('一度に同期できるURLは20件までです。');
    if (body.persist !== undefined && typeof body.persist !== 'boolean') throw new FavoriteSyncError('persistはbooleanで指定してください。');
    const result = await create().sync(body.urls, body.persist === true);
    return { status: 200, body: { result } };
  } catch (error) {
    if (error instanceof FavoriteSyncError) return { status: error.status, body: { message: error.message } };
    if (error instanceof DatabaseConfigurationError) return { status: 500, body: { message: 'データベースが設定されていません。' } };
    return { status: 500, body: { message: 'お気に入り同期に失敗しました。' } };
  }
}
