import type { ProviderItem } from './providers.js';

export const MANUAL_SALE_SOURCE_REFERENCE = 'manual:video.dmm.co.jp/av/list';

export type ProductSourcePlan = {
  matchedProductCount: number;
  favoriteSaleCandidateCount: number;
  currentSaleCount: number;
  activateCount: number;
  deactivateCount: number;
};

export type ProductSourcePersistResult = ProductSourcePlan & {
  createdProductCount: number;
  updatedProductCount: number;
};

export type ProductSourceSummary = {
  productId: number;
  sources: Array<'actress' | 'favorite' | 'sale'>;
  currentSale: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

type QueryResult<T> = Promise<{ rows: T[] }>;
type TransactionClient = {
  query<T>(sql: string, values?: readonly unknown[]): QueryResult<T>;
  release(): void;
};
export type TransactionPool = {
  query<T>(sql: string, values?: readonly unknown[]): QueryResult<T>;
  connect(): Promise<TransactionClient>;
};

export class ProductSourceRepository {
  constructor(private readonly db: TransactionPool) {}

  async schemaReady() {
    return (await this.db.query<{ ready: boolean }>(
      "SELECT to_regclass('public.product_sources') IS NOT NULL AS ready"
    )).rows[0]?.ready ?? false;
  }

  async listSummaries(): Promise<ProductSourceSummary[]> {
    if (!await this.schemaReady()) return [];
    return (await this.db.query<ProductSourceSummary>(
      `SELECT
         product_id::int AS "productId",
         array_agg(DISTINCT source_type ORDER BY source_type) AS sources,
         bool_or(source_type = 'sale' AND active) AS "currentSale",
         min(first_seen_at)::text AS "firstSeenAt",
         max(last_seen_at)::text AS "lastSeenAt"
       FROM product_sources
       GROUP BY product_id
       ORDER BY product_id`
    )).rows;
  }

  async planSaleSnapshot(contentIds: readonly string[], sourceReference = MANUAL_SALE_SOURCE_REFERENCE): Promise<ProductSourcePlan> {
    const row = (await this.db.query<ProductSourcePlan>(
      `WITH desired AS (
         SELECT lower(unnest($1::text[])) AS content_id
       ), matched AS (
         SELECT p.id, lower(p.fanza_product_id) AS content_id
         FROM products p JOIN desired d ON d.content_id = lower(p.fanza_product_id)
       ), current_sale AS (
         SELECT ps.product_id
         FROM product_sources ps
         WHERE ps.source_type = 'sale' AND ps.source_reference = $2 AND ps.active
       )
       SELECT
         (SELECT count(*) FROM matched)::int AS "matchedProductCount",
         (SELECT count(*) FROM matched m JOIN favorites f ON f.product_id = m.id)::int AS "favoriteSaleCandidateCount",
         (SELECT count(*) FROM current_sale)::int AS "currentSaleCount",
         (SELECT count(*) FROM matched m WHERE NOT EXISTS (
           SELECT 1 FROM current_sale c WHERE c.product_id = m.id
         ))::int AS "activateCount",
         (SELECT count(*) FROM current_sale c WHERE NOT EXISTS (
           SELECT 1 FROM matched m WHERE m.id = c.product_id
         ))::int AS "deactivateCount"`,
      [contentIds, sourceReference]
    )).rows[0];
    return row ?? { matchedProductCount: 0, favoriteSaleCandidateCount: 0, currentSaleCount: 0, activateCount: 0, deactivateCount: 0 };
  }

  async persistSaleSnapshot(items: readonly ProviderItem[], sourceReference = MANUAL_SALE_SOURCE_REFERENCE): Promise<ProductSourcePersistResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const before = await planWith(client, items.map((item) => item.externalProductId), sourceReference);
      const productIds: number[] = [];
      let createdProductCount = 0;
      let updatedProductCount = 0;

      for (const item of items) {
        const saved = (await client.query<{ id: number; created: boolean }>(
          `INSERT INTO products (
             fanza_product_id, title, product_url, affiliate_url, sample_video_url,
             thumbnail_url, price, sale_price, is_sale, release_date, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,'available')
           ON CONFLICT (fanza_product_id) DO UPDATE SET
             title = EXCLUDED.title,
             product_url = EXCLUDED.product_url,
             affiliate_url = COALESCE(EXCLUDED.affiliate_url, products.affiliate_url),
             sample_video_url = COALESCE(EXCLUDED.sample_video_url, products.sample_video_url),
             thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, products.thumbnail_url),
             price = COALESCE(EXCLUDED.price, products.price),
             sale_price = COALESCE(EXCLUDED.sale_price, products.sale_price),
             is_sale = true,
             release_date = COALESCE(EXCLUDED.release_date, products.release_date),
             status = 'available'
           RETURNING id::int, (xmax = 0) AS created`,
          [item.externalProductId, item.title, item.productUrl, item.affiliateUrl ?? null,
            item.sampleVideoUrl ?? null, item.thumbnailUrl ?? null, item.price,
            item.salePrice, item.releaseDate ?? null]
        )).rows[0];
        if (!saved) throw new Error('product_upsert_failed');
        productIds.push(saved.id);
        if (saved.created) createdProductCount += 1;
        else updatedProductCount += 1;
      }

      const deactivated = (await client.query<{ productId: number }>(
        `UPDATE product_sources
         SET active = false
         WHERE source_type = 'sale' AND source_reference = $1 AND active
           AND NOT (product_id = ANY($2::bigint[]))
         RETURNING product_id::int AS "productId"`,
        [sourceReference, productIds]
      )).rows.map((row) => row.productId);

      await client.query(
        `INSERT INTO product_sources (
           product_id, source_type, source_reference, first_seen_at, last_seen_at, active
         )
         SELECT unnest($1::bigint[]), 'sale', $2, current_timestamp, current_timestamp, true
         ON CONFLICT (product_id, source_type, source_reference) DO UPDATE SET
           last_seen_at = EXCLUDED.last_seen_at,
           active = true`,
        [productIds, sourceReference]
      );

      const affected = [...new Set([...productIds, ...deactivated])];
      if (affected.length > 0) {
        await client.query(
          `UPDATE products p
           SET is_sale = EXISTS (
             SELECT 1 FROM product_sources ps
             WHERE ps.product_id = p.id AND ps.source_type = 'sale' AND ps.active
           )
           WHERE p.id = ANY($1::bigint[])`,
          [affected]
        );
      }
      await client.query('COMMIT');
      return {
        ...before,
        activateCount: before.activateCount + (items.length - before.matchedProductCount),
        createdProductCount,
        updatedProductCount
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function planWith(client: Pick<TransactionClient, 'query'>, contentIds: readonly string[], sourceReference: string) {
  const row = (await client.query<ProductSourcePlan>(
    `WITH desired AS (
       SELECT lower(unnest($1::text[])) AS content_id
     ), matched AS (
       SELECT p.id, lower(p.fanza_product_id) AS content_id
       FROM products p JOIN desired d ON d.content_id = lower(p.fanza_product_id)
     ), current_sale AS (
       SELECT ps.product_id
       FROM product_sources ps
       WHERE ps.source_type = 'sale' AND ps.source_reference = $2 AND ps.active
     )
     SELECT
       (SELECT count(*) FROM matched)::int AS "matchedProductCount",
       (SELECT count(*) FROM matched m JOIN favorites f ON f.product_id = m.id)::int AS "favoriteSaleCandidateCount",
       (SELECT count(*) FROM current_sale)::int AS "currentSaleCount",
       (SELECT count(*) FROM matched m WHERE NOT EXISTS (
         SELECT 1 FROM current_sale c WHERE c.product_id = m.id
       ))::int AS "activateCount",
       (SELECT count(*) FROM current_sale c WHERE NOT EXISTS (
         SELECT 1 FROM matched m WHERE m.id = c.product_id
       ))::int AS "deactivateCount"`,
    [contentIds, sourceReference]
  )).rows[0];
  return row ?? { matchedProductCount: 0, favoriteSaleCandidateCount: 0, currentSaleCount: 0, activateCount: 0, deactivateCount: 0 };
}
