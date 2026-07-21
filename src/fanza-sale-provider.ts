import { normalizeProviderResult, type ProductProvider, type ProviderItem, type ProviderQuery, type ProviderResult } from './providers.js';
import { parseOptionalDmmPrice } from './dmm-price.js';

export type SaleWarningCode =
  | 'campaign_missing'
  | 'campaign_out_of_period'
  | 'price_unavailable'
  | 'price_not_discounted'
  | 'required_field_missing'
  | 'invalid_url'
  | 'normalization_failed';

export type HttpClient = { get(url: string, signal: AbortSignal): Promise<{ status: number; json(): Promise<unknown> }> };
type ApiItem = Record<string, unknown>;
type Conversion = { item: ProviderItem } | { warnings: string[] };

export class FanzaSaleProvider implements ProductProvider {
  readonly source = 'sale' as const;

  constructor(private readonly client: HttpClient, private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async fetch(query: ProviderQuery): Promise<ProviderResult> {
    const apiId = this.environment.DMM_API_ID;
    const affiliateId = this.environment.DMM_AFFILIATE_ID;
    if (!apiId || !affiliateId) return failure('DMM Webサービスの認証設定がありません。');

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const offset = (page - 1) * limit + 1;
    const params = new URLSearchParams({ api_id: apiId, affiliate_id: affiliateId, site: 'FANZA', service: 'digital', floor: 'videoa', hits: String(limit), offset: String(offset), output: 'json' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await this.client.get(`https://api.dmm.com/affiliate/v3/ItemList?${params}`, controller.signal);
      if (!response.status.toString().startsWith('2')) return failure('DMM Webサービスから商品情報を取得できませんでした。');
      const body = await response.json() as { result?: { items?: ApiItem[]; total_count?: number; result_count?: number; first_position?: number } };
      if (!body.result || !Array.isArray(body.result.items)) return failure('DMM Webサービスの応答形式が不正です。');

      const warnings: string[] = [];
      const fetchedAt = new Date().toISOString();
      const items: ProviderItem[] = [];
      for (const raw of body.result.items) {
        const converted = convert(raw, fetchedAt);
        if ('item' in converted) items.push(converted.item);
        else warnings.push(...converted.warnings);
      }
      const count = body.result.result_count ?? items.length;
      const first = body.result.first_position ?? offset;
      const hasMore = first - 1 + count < (body.result.total_count ?? first - 1 + count);
      const priceSummary = summarizePrices(body.result.items);
      warnings.push(...Array.from({ length: priceSummary.priceUnavailableCount }, () => 'price_unavailable'));
      const normalized = normalizeProviderResult({ source: 'sale', items, fetchedAt, warnings, hasMore, nextPage: hasMore ? page + 1 : undefined, responseItemCount: body.result.items.length, saveCandidateCount: items.length, ...priceSummary });
      return { ...normalized, warnings: normalized.warnings.map((warning) => isSafeWarning(warning) ? warning : 'normalization_failed') };
    } catch {
      return failure('DMM Webサービスから商品情報を取得できませんでした。');
    } finally {
      clearTimeout(timer);
    }
  }
}

function convert(raw: ApiItem, fetchedAt: string): Conversion {
  const campaign = Array.isArray(raw.campaign) ? object(raw.campaign[0]) : undefined;
  if (!campaign) return { warnings: ['campaign_missing'] };
  if (!activeCampaign(campaign)) return { warnings: ['campaign_out_of_period'] };

  const prices = object(raw.prices);
  const salePrice = parseOptionalDmmPrice(prices?.price);
  const price = parseOptionalDmmPrice(firstDefined(prices?.list_price, prices?.listPrice));

  const id = string(raw.content_id) ?? string(raw.product_id);
  const title = string(raw.title);
  const productUrl = string(raw.URL);
  if (!id || !title || !productUrl) return { warnings: ['required_field_missing'] };
  if (!httpUrl(productUrl)) return { warnings: ['invalid_url'] };

  const movie = object(raw.sampleMovieURL);
  const sampleVideoUrl = ['size_720_480', 'size_644_414', 'size_560_360', 'size_476_306'].map((key) => string(movie?.[key])).find(Boolean);
  const image = object(raw.imageURL);
  const itemInfo = object(raw.iteminfo);
  const actresses = [itemInfo?.actress, raw.actress, raw.actresses].find(Array.isArray) as unknown[] | undefined ?? [];
  return {
    item: {
      source: 'sale', externalProductId: id, title, productUrl, affiliateUrl: string(raw.affiliateURL),
      thumbnailUrl: string(image?.large) ?? string(image?.list) ?? string(image?.small), sampleVideoUrl,
      price, salePrice, isSale: price !== null && salePrice !== null && price > salePrice, releaseDate: string(raw.date)?.slice(0, 10),
      actressNames: [...new Set(actresses.map((value) => string(object(value)?.name)).filter((value): value is string => Boolean(value)))],
      fetchedAt, rawData: { campaign: true }
    }
  };
}

function summarizePrices(items: readonly ApiItem[]) {
  let priceAvailableCount = 0;
  let saleEligibleCount = 0;
  for (const raw of items) {
    const prices = object(raw.prices);
    const salePrice = parseOptionalDmmPrice(prices?.price);
    const price = parseOptionalDmmPrice(firstDefined(prices?.list_price, prices?.listPrice));
    if (price !== null && salePrice !== null) {
      priceAvailableCount += 1;
      if (price > salePrice) saleEligibleCount += 1;
    }
  }
  return { priceAvailableCount, priceUnavailableCount: items.length - priceAvailableCount, saleEligibleCount, saleIneligibleCount: items.length - saleEligibleCount };
}

function failure(error: string): ProviderResult { return { source: 'sale', items: [], fetchedAt: new Date().toISOString(), warnings: [], error, hasMore: false }; }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function string(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function firstDefined(...values: unknown[]) { return values.find((value) => value !== undefined); }
function httpUrl(value: string) { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
function activeCampaign(campaign: Record<string, unknown>) { const begin = Date.parse(string(campaign.date_begin) ?? ''); const end = Date.parse(string(campaign.date_end) ?? ''); const now = Date.now(); return Number.isFinite(begin) && Number.isFinite(end) && begin <= now && now <= end; }
function isSafeWarning(value: string) {
  return new Set<SaleWarningCode>(['campaign_missing', 'campaign_out_of_period', 'price_unavailable', 'price_not_discounted', 'required_field_missing', 'invalid_url', 'normalization_failed']).has(value as SaleWarningCode);
}
