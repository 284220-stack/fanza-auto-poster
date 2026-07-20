import { DatabaseConfigurationError } from './db/pool.js';
import type { PostHistoryListItem } from './post-history.js';

export type PostHistoryFilters = { page: number; limit: number; status?: string; actress?: string; product?: string; dateFrom?: string; dateTo?: string; pendingReply?: boolean };
export type PostHistoryApiRepository = { list(options: PostHistoryFilters): Promise<{ items: PostHistoryListItem[]; total: number }>; getDetail(id: number): Promise<PostHistoryListItem | undefined> };
const safe = (message: string) => ({ status: 500, body: { message } });
const positive = (value: string | null, fallback: number, max: number) => value === null ? fallback : /^[1-9]\d*$/.test(value) ? Math.min(Number(value), max) : undefined;
const dateOnly = (value: string | null) => value === null || value === '' ? undefined : /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;

export async function handlePostHistoryApiRequest(method: string | undefined, pathname: string, search: URLSearchParams, create: () => PostHistoryApiRepository) {
  if (!pathname.startsWith('/api/post-history')) return undefined;
  try {
    const detail = pathname.match(/^\/api\/post-history\/(\d+)$/);
    if (method !== 'GET') return { status: 400, body: { message: 'GET メソッドで取得してください。' } };
    const repo = create();
    if (detail) {
      const history = await repo.getDetail(Number(detail[1]));
      return history ? { status: 200, body: { history } } : { status: 404, body: { message: '投稿履歴が見つかりません。' } };
    }
    if (pathname !== '/api/post-history') return { status: 400, body: { message: 'APIの呼び出し方法が不正です。' } };
    const page = positive(search.get('page'), 1, 100000); const limit = positive(search.get('limit'), 20, 100);
    const pending = search.get('pendingReply'), dateFrom=dateOnly(search.get('dateFrom')), dateTo=dateOnly(search.get('dateTo'));
    if (!page || !limit || dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo) || (pending !== null && pending !== '' && pending !== 'true' && pending !== 'false')) return { status: 400, body: { message: '検索条件が不正です。' } };
    const result = await repo.list({ page, limit, status: search.get('status') || undefined, actress: search.get('actress') || undefined, product: search.get('product') || undefined, dateFrom, dateTo, pendingReply: !pending ? undefined : pending === 'true' });
    return { status: 200, body: { ...result, page, limit } };
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) return safe('データベースが設定されていません。');
    return safe('投稿履歴を取得できませんでした。');
  }
}
