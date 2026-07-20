import type { Queryable } from './actresses.js';

export type Product = {
  id: number;
  fanzaProductId: string;
  title: string;
  productUrl: string;
  affiliateUrl: string | null;
  sampleVideoUrl: string | null;
  thumbnailUrl: string | null;
  price: string | null;
  salePrice: string | null;
  isSale: boolean;
  releaseDate: string | null;
  status: 'unknown' | 'available' | 'unavailable' | 'ended';
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  fanzaProductId: string;
  title: string;
  productUrl: string;
  affiliateUrl?: string | null;
  sampleVideoUrl?: string | null;
  thumbnailUrl?: string | null;
  price?: number | null;
  salePrice?: number | null;
  isSale?: boolean;
  releaseDate?: string | null;
  status?: Product['status'];
};

export class ProductError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'ProductError';
  }
}

const fields = 'id, fanza_product_id AS "fanzaProductId", title, product_url AS "productUrl", affiliate_url AS "affiliateUrl", sample_video_url AS "sampleVideoUrl", thumbnail_url AS "thumbnailUrl", price::text AS price, sale_price::text AS "salePrice", is_sale AS "isSale", release_date::text AS "releaseDate", status, created_at AS "createdAt", updated_at AS "updatedAt"';

export class ProductRepository {
  constructor(private readonly db: Queryable) {}

  async list() { return (await this.db.query<Product>(`SELECT ${fields} FROM products ORDER BY updated_at DESC, id DESC`)).rows; }
  async find(id: number) { return (await this.db.query<Product>(`SELECT ${fields} FROM products WHERE id = $1`, [id])).rows[0]; }
  async findByFanzaProductId(fanzaProductId: string) { return (await this.db.query<Product>(`SELECT ${fields} FROM products WHERE fanza_product_id = $1`, [fanzaProductId])).rows[0]; }
  async findByProductUrl(productUrl: string) { return (await this.db.query<Product>(`SELECT ${fields} FROM products WHERE product_url = $1`, [productUrl])).rows[0]; }
  async exists(fanzaProductId: string) { return (await this.db.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM products WHERE fanza_product_id = $1) AS exists', [fanzaProductId])).rows[0]?.exists ?? false; }
  async create(value: Required<ProductInput>) { return (await this.db.query<Product>(`INSERT INTO products (fanza_product_id, title, product_url, affiliate_url, sample_video_url, thumbnail_url, price, sale_price, is_sale, release_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${fields}`, [value.fanzaProductId, value.title, value.productUrl, value.affiliateUrl, value.sampleVideoUrl, value.thumbnailUrl, value.price, value.salePrice, value.isSale, value.releaseDate, value.status])).rows[0]; }
  async update(id: number, value: Required<ProductInput>) { return (await this.db.query<Product>(`UPDATE products SET fanza_product_id = $2, title = $3, product_url = $4, affiliate_url = $5, sample_video_url = $6, thumbnail_url = $7, price = $8, sale_price = $9, is_sale = $10, release_date = $11, status = $12 WHERE id = $1 RETURNING ${fields}`, [id, value.fanzaProductId, value.title, value.productUrl, value.affiliateUrl, value.sampleVideoUrl, value.thumbnailUrl, value.price, value.salePrice, value.isSale, value.releaseDate, value.status])).rows[0]; }
  async updateSale(id: number, salePrice: number | null, isSale: boolean) { return (await this.db.query<Product>(`UPDATE products SET sale_price = $2, is_sale = $3 WHERE id = $1 RETURNING ${fields}`, [id, salePrice, isSale])).rows[0]; }
  async updateSampleVideo(id: number, sampleVideoUrl: string | null) { return (await this.db.query<Product>(`UPDATE products SET sample_video_url = $2 WHERE id = $1 RETURNING ${fields}`, [id, sampleVideoUrl])).rows[0]; }
  async remove(id: number) { return (await this.db.query<{ id: number }>('DELETE FROM products WHERE id = $1 RETURNING id', [id])).rows[0]; }
}

type NormalizedProductInput = Required<ProductInput>;
const statuses = new Set<Product['status']>(['unknown', 'available', 'unavailable', 'ended']);

export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  private normalize(value: ProductInput): NormalizedProductInput {
    const fanzaProductId = value.fanzaProductId?.trim();
    const title = value.title?.trim();
    if (!fanzaProductId) throw new ProductError('FANZA商品IDを入力してください。');
    if (!title) throw new ProductError('商品タイトルを入力してください。');
    const productUrl = normalizeUrl(value.productUrl, '商品URL');
    const affiliateUrl = normalizeOptionalUrl(value.affiliateUrl, 'アフィリエイトURL');
    const sampleVideoUrl = normalizeOptionalUrl(value.sampleVideoUrl, 'サンプル動画URL');
    const thumbnailUrl = normalizeOptionalUrl(value.thumbnailUrl, 'サムネイルURL');
    const price = normalizePrice(value.price, '通常価格');
    const salePrice = normalizePrice(value.salePrice, 'セール価格');
    if (price !== null && salePrice !== null && salePrice > price) throw new ProductError('セール価格は通常価格以下にしてください。');
    const releaseDate = value.releaseDate?.trim() || null;
    if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new ProductError('発売日はYYYY-MM-DD形式で入力してください。');
    const status = value.status ?? 'unknown';
    if (!statuses.has(status)) throw new ProductError('商品状態が不正です。');
    return { fanzaProductId, title, productUrl, affiliateUrl, sampleVideoUrl, thumbnailUrl, price, salePrice, isSale: value.isSale ?? false, releaseDate, status };
  }

  async list() { return this.repo.list(); }
  async get(id: number) { const product = await this.repo.find(id); if (!product) throw new ProductError('商品が見つかりません。', 404); return product; }
  async getByFanzaProductId(fanzaProductId: string) { return this.repo.findByFanzaProductId(fanzaProductId.trim()); }
  async getByProductUrl(productUrl: string) { return this.repo.findByProductUrl(productUrl.trim()); }
  async exists(fanzaProductId: string) { return this.repo.exists(fanzaProductId.trim()); }

  async create(value: ProductInput) {
    const normalized = this.normalize(value);
    try { return await this.repo.create(normalized); }
    catch (error) { if (databaseCode(error) === '23505') throw new ProductError('同じ商品IDまたは商品URLが既に登録されています。', 409); throw error; }
  }

  async update(id: number, value: ProductInput) {
    await this.get(id);
    const normalized = this.normalize(value);
    try { return await this.repo.update(id, normalized); }
    catch (error) { if (databaseCode(error) === '23505') throw new ProductError('同じ商品IDまたは商品URLが既に登録されています。', 409); throw error; }
  }

  async updateSale(id: number, salePrice: number | null, isSale: boolean) {
    const product = await this.get(id);
    const normalizedSalePrice = normalizePrice(salePrice, 'セール価格');
    const price = product.price === null ? null : Number(product.price);
    if (price !== null && normalizedSalePrice !== null && normalizedSalePrice > price) throw new ProductError('セール価格は通常価格以下にしてください。');
    const updated = await this.repo.updateSale(id, normalizedSalePrice, isSale);
    if (!updated) throw new ProductError('商品が見つかりません。', 404);
    return updated;
  }

  async updateSampleVideo(id: number, sampleVideoUrl: string | null) {
    await this.get(id);
    const updated = await this.repo.updateSampleVideo(id, normalizeOptionalUrl(sampleVideoUrl, 'サンプル動画URL'));
    if (!updated) throw new ProductError('商品が見つかりません。', 404);
    return updated;
  }

  async remove(id: number) { if (!await this.repo.remove(id)) throw new ProductError('商品が見つかりません。', 404); }
}

function normalizeUrl(value: string, label: string) { if (!value?.trim()) throw new ProductError(`${label}を入力してください。`); return validateUrl(value.trim(), label); }
function normalizeOptionalUrl(value: string | null | undefined, label: string) { return value?.trim() ? validateUrl(value.trim(), label) : null; }
function validateUrl(value: string, label: string) { try { const url = new URL(value); if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(); return url.toString(); } catch { throw new ProductError(`${label}はhttpまたはhttpsのURLで入力してください。`); } }
function normalizePrice(value: number | null | undefined, label: string) { if (value === null || value === undefined) return null; if (!Number.isFinite(value) || value < 0) throw new ProductError(`${label}は0以上の数値で入力してください。`); return value; }
function databaseCode(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined; }
