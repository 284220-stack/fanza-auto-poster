export type ProductSource = 'sale' | 'new_release' | 'favorite' | (string & {});
export type ProviderItem = {
  source: ProductSource; externalProductId: string; title: string; productUrl: string;
  affiliateUrl?: string; thumbnailUrl?: string; sampleVideoUrl?: string;
  price: number | null; salePrice: number | null; isSale?: boolean; releaseDate?: string;
  actressNames?: string[]; fetchedAt: string; rawData?: Record<string, unknown>;
};
export type ProviderQuery = { limit?: number; page?: number; actressName?: string; saleOnly?: boolean; releasedAfter?: string; releasedBefore?: string };
export type ProviderResult = { source: ProductSource; items: ProviderItem[]; fetchedAt: string; warnings: string[]; error?: string; nextPage?: number; hasMore: boolean; responseItemCount?: number; saveCandidateCount?: number; priceAvailableCount?: number; priceUnavailableCount?: number; saleEligibleCount?: number; saleIneligibleCount?: number };
export interface ProductProvider { readonly source: ProductSource; fetch(query: ProviderQuery): Promise<ProviderResult>; }
export type NormalizedProviderResult = ProviderResult;

export class ProviderError extends Error { constructor(message: string) { super(message); this.name = 'ProviderError'; } }
const forbiddenRawKeys = /password|token|secret|cookie|authorization/i;

export class ProviderRegistry {
  private readonly providers = new Map<ProductSource, ProductProvider>();
  register(provider: ProductProvider) { if (this.providers.has(provider.source)) throw new ProviderError('同じsourceのProviderは既に登録されています。'); this.providers.set(provider.source, provider); }
  get(source: ProductSource) { const provider = this.providers.get(source); if (!provider) throw new ProviderError('指定されたsourceのProviderは登録されていません。'); return provider; }
  list() { return [...this.providers.keys()]; }
}

export function normalizeProviderResult(result: ProviderResult): NormalizedProviderResult {
  const warnings = [...result.warnings]; const items: ProviderItem[] = [];
  for (const item of result.items) {
    try { items.push(normalizeItem(item)); } catch { warnings.push('不正な商品候補を除外しました。'); }
  }
  return { ...result, source: normalizeSource(result.source), fetchedAt: normalizeDateTime(result.fetchedAt), items, warnings, error: result.error ? '商品候補の取得に失敗しました。' : undefined };
}

function normalizeItem(item: ProviderItem): ProviderItem {
  const source = normalizeSource(item.source); const externalProductId = required(item.externalProductId, '商品ID'); const title = required(item.title, 'タイトル');
  const productUrl = url(required(item.productUrl, '商品URL')); const price = number(item.price); const salePrice = number(item.salePrice);
  if (price !== null && salePrice !== null && salePrice > price) throw new ProviderError('価格不正');
  const releaseDate = item.releaseDate === undefined ? undefined : normalizeDate(item.releaseDate);
  return { source, externalProductId, title, productUrl, affiliateUrl: optionalUrl(item.affiliateUrl), thumbnailUrl: optionalUrl(item.thumbnailUrl), sampleVideoUrl: optionalUrl(item.sampleVideoUrl), price, salePrice, isSale: item.isSale ?? false, releaseDate, actressNames: [...new Set((item.actressNames ?? []).map((name) => name.trim()).filter(Boolean))], fetchedAt: normalizeDateTime(item.fetchedAt), rawData: sanitizeRawData(item.rawData) };
}
function normalizeSource(value: string) { if (!value.trim()) throw new ProviderError('sourceが不正です。'); return value.trim() as ProductSource; }
function required(value: string, label: string) { const normalized = value?.trim(); if (!normalized) throw new ProviderError(`${label}が不正です。`); return normalized; }
function url(value: string) { try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); return parsed.toString(); } catch { throw new ProviderError('URLが不正です。'); } }
function optionalUrl(value: string | undefined) { return value?.trim() ? url(value.trim()) : undefined; }
function number(value: number | null) { if (value === null) return null; if (!Number.isFinite(value) || value < 0) throw new ProviderError('価格が不正です。'); return value; }
function normalizeDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) throw new ProviderError('日付が不正です。'); return value.trim(); }
function normalizeDateTime(value: string) { const parsed = new Date(value); if (Number.isNaN(parsed.valueOf())) throw new ProviderError('取得日時が不正です。'); return parsed.toISOString(); }
function sanitizeRawData(value: Record<string, unknown> | undefined) { if (!value) return undefined; return Object.fromEntries(Object.entries(value).filter(([key]) => !forbiddenRawKeys.test(key))); }
