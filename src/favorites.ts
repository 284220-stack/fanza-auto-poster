import type { Queryable } from './actresses.js';

export type FavoriteSyncPlan = {
  currentCount: number;
  createdCount: number;
  refreshedCount: number;
  removedCount: number;
};

export type FavoriteSyncResult = FavoriteSyncPlan & {
  checkOnly: boolean;
  receivedCount: number;
  validCount: number;
  invalidCount: number;
  uniqueProductCount: number;
  matchedProductCount: number;
  unmatchedProductCount: number;
};

export type FavoriteSyncStore = {
  resolveProductIds(contentIds: readonly string[]): Promise<Array<{ productId: string; contentId: string }>>;
  planReplacement(productIds: readonly string[]): Promise<FavoriteSyncPlan>;
  replace(productIds: readonly string[]): Promise<FavoriteSyncPlan>;
};

export class FavoriteSyncError extends Error {
  constructor(message: string, public readonly status: 400 | 409 = 400) {
    super(message);
    this.name = 'FavoriteSyncError';
  }
}

export class FavoriteRepository implements FavoriteSyncStore {
  constructor(private readonly db: Queryable) {}

  async resolveProductIds(contentIds: readonly string[]) {
    if (contentIds.length === 0) return [];
    return (await this.db.query<{ productId: string; contentId: string }>(
      'SELECT id::text AS "productId", lower(fanza_product_id) AS "contentId" FROM products WHERE lower(fanza_product_id) = ANY($1::text[]) ORDER BY id',
      [contentIds]
    )).rows;
  }

  async planReplacement(productIds: readonly string[]): Promise<FavoriteSyncPlan> {
    const row = (await this.db.query<FavoriteSyncPlan>(
      `SELECT
        count(*)::int AS "currentCount",
        (cardinality($1::bigint[]) - count(*) FILTER (WHERE product_id = ANY($1::bigint[])))::int AS "createdCount",
        count(*) FILTER (WHERE product_id = ANY($1::bigint[]))::int AS "refreshedCount",
        count(*) FILTER (WHERE NOT (product_id = ANY($1::bigint[])))::int AS "removedCount"
       FROM favorites`,
      [productIds]
    )).rows[0];
    return row ?? { currentCount: 0, createdCount: productIds.length, refreshedCount: 0, removedCount: 0 };
  }

  async replace(productIds: readonly string[]): Promise<FavoriteSyncPlan> {
    const row = (await this.db.query<FavoriteSyncPlan>(
      `WITH desired AS (
         SELECT unnest($1::bigint[]) AS product_id
       ), removed AS (
         DELETE FROM favorites current
         WHERE NOT EXISTS (SELECT 1 FROM desired WHERE desired.product_id = current.product_id)
         RETURNING 1
       ), upserted AS (
         INSERT INTO favorites (product_id, synced_at)
         SELECT product_id, current_timestamp FROM desired
         ON CONFLICT (product_id) DO UPDATE SET synced_at = EXCLUDED.synced_at
         RETURNING (xmax = 0) AS created
       )
       SELECT
         cardinality($1::bigint[])::int AS "currentCount",
         count(*) FILTER (WHERE created)::int AS "createdCount",
         count(*) FILTER (WHERE NOT created)::int AS "refreshedCount",
         (SELECT count(*) FROM removed)::int AS "removedCount"
       FROM upserted`,
      [productIds]
    )).rows[0];
    return row ?? { currentCount: productIds.length, createdCount: 0, refreshedCount: 0, removedCount: 0 };
  }
}

export class FavoriteSyncService {
  constructor(private readonly store: FavoriteSyncStore) {}

  async sync(urls: readonly string[], persist = false): Promise<FavoriteSyncResult> {
    const extracted = urls.map(extractFanzaContentId);
    const contentIds = [...new Set(extracted.filter((value): value is string => value !== undefined))];
    const invalidCount = extracted.length - extracted.filter(Boolean).length;
    const matched = await this.store.resolveProductIds(contentIds);
    const matchedContentIds = new Set(matched.map((value) => value.contentId.toLowerCase()));
    const unmatchedProductCount = contentIds.filter((value) => !matchedContentIds.has(value)).length;
    const productIds = [...new Set(matched.map((value) => value.productId))];
    const plan = await this.store.planReplacement(productIds);

    if (persist) {
      if (urls.length === 0 || contentIds.length === 0) throw new FavoriteSyncError('空のお気に入り集合は同期できません。');
      if (invalidCount > 0) throw new FavoriteSyncError('公式商品URLとして確認できない入力が含まれています。');
      if (unmatchedProductCount > 0) throw new FavoriteSyncError('商品管理に未登録の商品が含まれています。', 409);
      const persisted = await this.store.replace(productIds);
      return summary(false, urls.length, contentIds.length, invalidCount, matched.length, unmatchedProductCount, persisted);
    }

    return summary(true, urls.length, contentIds.length, invalidCount, matched.length, unmatchedProductCount, plan);
  }
}

function summary(checkOnly: boolean, receivedCount: number, uniqueProductCount: number, invalidCount: number, matchedProductCount: number, unmatchedProductCount: number, plan: FavoriteSyncPlan): FavoriteSyncResult {
  return {
    checkOnly,
    receivedCount,
    validCount: receivedCount - invalidCount,
    invalidCount,
    uniqueProductCount,
    matchedProductCount,
    unmatchedProductCount,
    ...plan
  };
}

export function extractFanzaContentId(value: string): string | undefined {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return undefined; }
  if (url.protocol !== 'https:' || !isOfficialHost(url.hostname)) return undefined;

  const queryKeys = url.hostname.toLowerCase() === 'video.dmm.co.jp'
    ? ['id', 'cid', 'content_id']
    : ['cid', 'content_id'];
  for (const key of queryKeys) {
    const id = normalizeContentId(url.searchParams.get(key));
    if (id) return id;
  }
  const pathMatch = url.pathname.match(/(?:^|\/)cid=([^/]+)(?:\/|$)/i);
  return normalizeContentId(pathMatch?.[1]);
}

function isOfficialHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'dmm.co.jp' || host.endsWith('.dmm.co.jp') || host === 'dmm.com' || host.endsWith('.dmm.com') || host === 'fanza.com' || host.endsWith('.fanza.com');
}

function normalizeContentId(value: string | null | undefined) {
  const decoded = value?.trim();
  return decoded && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(decoded) ? decoded.toLowerCase() : undefined;
}
