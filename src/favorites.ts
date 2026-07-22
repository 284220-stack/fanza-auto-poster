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
  saveCandidateCount: number;
  metadataUnavailableCount: number;
  apiNotListedCount: number;
  metadataIdMismatchCount: number;
  invalidMetadataCount: number;
  metadataFailedCount: number;
  vrExcludedCount: number;
  createdProductCount: number;
  updatedProductCount: number;
  failedProductCount: number;
};

export type FavoriteImportPreview = {
  items: import('./providers.js').ProviderItem[];
  saveCandidateCount: number;
  metadataUnavailableCount: number;
  apiNotListedCount: number;
  metadataIdMismatchCount: number;
  invalidMetadataCount: number;
  failedCount: number;
  vrExcludedCount: number;
};

export type FavoriteProductImporter = {
  preview(urls: readonly string[]): Promise<FavoriteImportPreview>;
  persist(preview: FavoriteImportPreview): Promise<{ createdCount: number; updatedCount: number; skippedCount: number; failedCount: number }>;
};

export type FavoriteSyncStore = {
  resolveProductIds(contentIds: readonly string[]): Promise<Array<{ productId: string; contentId: string }>>;
  planReplacement(productIds: readonly string[]): Promise<FavoriteSyncPlan>;
  replace(productIds: readonly string[]): Promise<FavoriteSyncPlan>;
};

export class FavoriteSyncError extends Error {
  constructor(message: string, public readonly status: 400 | 409 | 500 = 400) {
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
    const sourceSchemaReady = (await this.db.query<{ ready: boolean }>(
      "SELECT to_regclass('public.product_sources') IS NOT NULL AS ready"
    )).rows[0]?.ready ?? false;
    const row = (await this.db.query<FavoriteSyncPlan>(
      sourceSchemaReady ? `WITH desired AS (
         SELECT unnest($1::bigint[]) AS product_id
       ), removed AS (
         DELETE FROM favorites current
         WHERE NOT EXISTS (SELECT 1 FROM desired WHERE desired.product_id = current.product_id)
         RETURNING product_id
       ), upserted AS (
         INSERT INTO favorites (product_id, synced_at)
         SELECT product_id, current_timestamp FROM desired
         ON CONFLICT (product_id) DO UPDATE SET synced_at = EXCLUDED.synced_at
         RETURNING product_id, (xmax = 0) AS created
       ), deactivated_sources AS (
         UPDATE product_sources current
         SET active = false
         WHERE current.source_type = 'favorite'
           AND current.source_reference = 'manual-favorite-sync'
           AND NOT EXISTS (SELECT 1 FROM desired WHERE desired.product_id = current.product_id)
         RETURNING 1
       ), observed_sources AS (
         INSERT INTO product_sources (product_id, source_type, source_reference, first_seen_at, last_seen_at, active)
         SELECT product_id, 'favorite', 'manual-favorite-sync', current_timestamp, current_timestamp, true
         FROM desired
         ON CONFLICT (product_id, source_type, source_reference) DO UPDATE SET
           last_seen_at = EXCLUDED.last_seen_at,
           active = true
         RETURNING 1
       )
       SELECT
         cardinality($1::bigint[])::int AS "currentCount",
         count(*) FILTER (WHERE created)::int AS "createdCount",
         count(*) FILTER (WHERE NOT created)::int AS "refreshedCount",
         (SELECT count(*) FROM removed)::int AS "removedCount"
       FROM upserted`
      : `WITH desired AS (
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
  constructor(private readonly store: FavoriteSyncStore, private readonly importer?: FavoriteProductImporter) {}

  async sync(urls: readonly string[], persist = false): Promise<FavoriteSyncResult> {
    const extracted = urls.map(extractFanzaContentId);
    const contentIds = [...new Set(extracted.filter((value): value is string => value !== undefined))];
    const invalidCount = extracted.length - extracted.filter(Boolean).length;
    if (persist && (urls.length === 0 || contentIds.length === 0)) throw new FavoriteSyncError('空のお気に入り集合は同期できません。');
    if (persist && invalidCount > 0) throw new FavoriteSyncError('公式商品URLとして確認できない入力が含まれています。');
    const matched = await this.store.resolveProductIds(contentIds);
    const matchedContentIds = new Set(matched.map((value) => value.contentId.toLowerCase()));
    const unmatchedContentIds = contentIds.filter((value) => !matchedContentIds.has(value));
    const unmatchedProductCount = unmatchedContentIds.length;
    const unmatchedSet = new Set(unmatchedContentIds);
    const unmatchedUrls = urls.filter((url, index) => {
      const id = extracted[index];
      if (!id || !unmatchedSet.has(id)) return false;
      unmatchedSet.delete(id);
      return true;
    });
    const preview = unmatchedUrls.length > 0 && this.importer
      ? await this.importer.preview(unmatchedUrls)
      : emptyImportPreview();
    const productIds = [...new Set(matched.map((value) => value.productId))];
    const basePlan = await this.store.planReplacement(productIds);
    const plan = { ...basePlan, createdCount: basePlan.createdCount + preview.saveCandidateCount };

    if (persist) {
      if (unmatchedProductCount > 0 && !this.importer) throw new FavoriteSyncError('商品管理に未登録の商品が含まれています。', 409);
      if (preview.saveCandidateCount !== unmatchedProductCount || preview.metadataUnavailableCount > 0 || preview.failedCount > 0 || preview.vrExcludedCount > 0) throw new FavoriteSyncError('安全に補完できないお気に入り商品が含まれています。', 409);
      const imported = await this.importer?.persist(preview) ?? { createdCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 };
      if (imported.failedCount > 0 || imported.skippedCount > 0 || imported.createdCount + imported.updatedCount !== preview.saveCandidateCount) throw new FavoriteSyncError('お気に入り商品の保存に失敗しました。', 500);
      const resolved = await this.store.resolveProductIds(contentIds);
      if (resolved.length !== contentIds.length) throw new FavoriteSyncError('保存後の商品照合に失敗しました。', 500);
      const persisted = await this.store.replace([...new Set(resolved.map((value) => value.productId))]);
      return summary(false, urls.length, contentIds.length, invalidCount, resolved.length, 0, preview, imported, persisted);
    }

    return summary(true, urls.length, contentIds.length, invalidCount, matched.length, unmatchedProductCount, preview, undefined, plan);
  }
}

function emptyImportPreview(): FavoriteImportPreview { return { items: [], saveCandidateCount: 0, metadataUnavailableCount: 0, apiNotListedCount: 0, metadataIdMismatchCount: 0, invalidMetadataCount: 0, failedCount: 0, vrExcludedCount: 0 }; }

function summary(checkOnly: boolean, receivedCount: number, uniqueProductCount: number, invalidCount: number, matchedProductCount: number, unmatchedProductCount: number, preview: FavoriteImportPreview, imported: { createdCount: number; updatedCount: number; failedCount: number } | undefined, plan: FavoriteSyncPlan): FavoriteSyncResult {
  return {
    checkOnly,
    receivedCount,
    validCount: receivedCount - invalidCount,
    invalidCount,
    uniqueProductCount,
    matchedProductCount,
    unmatchedProductCount,
    saveCandidateCount: preview.saveCandidateCount,
    metadataUnavailableCount: preview.metadataUnavailableCount,
    apiNotListedCount: preview.apiNotListedCount,
    metadataIdMismatchCount: preview.metadataIdMismatchCount,
    invalidMetadataCount: preview.invalidMetadataCount,
    metadataFailedCount: preview.failedCount,
    vrExcludedCount: preview.vrExcludedCount,
    createdProductCount: imported?.createdCount ?? 0,
    updatedProductCount: imported?.updatedCount ?? 0,
    failedProductCount: imported?.failedCount ?? 0,
    ...plan
  };
}

export function extractFanzaContentId(value: string): string | undefined {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return undefined; }
  if (url.protocol !== 'https:' || !isOfficialHost(url.hostname)) return undefined;

  const modernVideo = url.hostname.toLowerCase() === 'video.dmm.co.jp' && /^\/av\/content\/?$/i.test(url.pathname);
  const legacyVideoa = /^\/digital\/videoa\/-\/detail\/=\/cid=[^/]+\/?$/i.test(url.pathname);
  if (!modernVideo && !legacyVideoa) return undefined;

  const queryKeys = modernVideo
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
