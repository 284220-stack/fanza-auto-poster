import { normalizeProviderResult, type ProductProvider, type ProviderItem, type ProviderQuery, type ProviderResult } from './providers.js';

export type HttpClient = { get(url: string, signal: AbortSignal): Promise<{ status: number; json(): Promise<unknown> }> };
type ApiItem = Record<string, unknown>;
export class FanzaSaleProvider implements ProductProvider {
  readonly source = 'sale' as const;
  constructor(private readonly client: HttpClient, private readonly environment: NodeJS.ProcessEnv = process.env) {}
  async fetch(query: ProviderQuery): Promise<ProviderResult> {
    const apiId = this.environment.DMM_API_ID; const affiliateId = this.environment.DMM_AFFILIATE_ID;
    if (!apiId || !affiliateId) return failure('DMM Webサービスの認証設定がありません。');
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100); const page = Math.max(query.page ?? 1, 1); const offset = (page - 1) * limit + 1;
    const params = new URLSearchParams({ api_id: apiId, affiliate_id: affiliateId, site: 'FANZA', service: 'digital', floor: 'videoa', hits: String(limit), offset: String(offset), output: 'json' });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.client.get(`https://api.dmm.com/affiliate/v3/ItemList?${params}`, controller.signal);
      if (!response.status.toString().startsWith('2')) return failure('DMM Webサービスから商品候補を取得できませんでした。');
      const body = await response.json() as { result?: { items?: ApiItem[]; total_count?: number; result_count?: number; first_position?: number } };
      if (!body.result || !Array.isArray(body.result.items)) return failure('DMM Webサービスの応答形式が不正です。');
      const warnings: string[] = []; const fetchedAt = new Date().toISOString(); const items: ProviderItem[] = [];
      for (const raw of body.result.items) { const item = convert(raw, fetchedAt); if (item) items.push(item); else warnings.push('セール条件を満たさない商品候補を除外しました。'); }
      const count = body.result.result_count ?? items.length; const first = body.result.first_position ?? offset; const total = body.result.total_count ?? first - 1 + count;
      return normalizeProviderResult({ source: 'sale', items, fetchedAt, warnings, hasMore: first - 1 + count < total, nextPage: first - 1 + count < total ? page + 1 : undefined });
    } catch { return failure('DMM Webサービスから商品候補を取得できませんでした。'); } finally { clearTimeout(timer); }
  }
}
function convert(raw: ApiItem, fetchedAt: string): ProviderItem | undefined {
  const prices = object(raw.prices); const price = decimal(prices?.price); const list = decimal(prices?.list_price); const campaign = Array.isArray(raw.campaign) ? object(raw.campaign[0]) : undefined;
  const active = campaign ? activeCampaign(campaign) : false; if (!active || price === undefined || list === undefined || list <= price) return undefined;
  const id = string(raw.content_id) ?? string(raw.product_id); const title = string(raw.title); const productUrl = string(raw.URL); if (!id || !title || !productUrl) return undefined;
  const movie = object(raw.sampleMovieURL); const sampleVideoUrl = ['size_720_480','size_644_414','size_560_360','size_476_306'].map(k=>string(movie?.[k])).find(Boolean);
  const image = object(raw.imageURL); const actresses = Array.isArray(object(raw.iteminfo)?.actress) ? object(raw.iteminfo)?.actress as unknown[] : [];
  return { source:'sale', externalProductId:id, title, productUrl, affiliateUrl:string(raw.affiliateURL), thumbnailUrl:string(image?.large) ?? string(image?.list) ?? string(image?.small), sampleVideoUrl, price:list, salePrice:price, isSale:true, releaseDate:string(raw.date)?.slice(0,10), actressNames:actresses.map(x=>string(object(x)?.name)).filter((x):x is string=>Boolean(x)), fetchedAt, rawData:{ campaign:true } };
}
function failure(error:string): ProviderResult { return { source:'sale', items:[], fetchedAt:new Date().toISOString(), warnings:[], error, hasMore:false }; }
function object(v:unknown): Record<string,unknown>|undefined { return typeof v==='object'&&v!==null&&!Array.isArray(v)?v as Record<string,unknown>:undefined; }
function string(v:unknown): string|undefined { return typeof v==='string'&&v.trim()?v.trim():undefined; }
function decimal(v:unknown): number|undefined { const n=typeof v==='string'||typeof v==='number'?Number(v):NaN; return Number.isFinite(n)&&n>=0?n:undefined; }
function activeCampaign(c:Record<string,unknown>) { const b=Date.parse(string(c.date_begin)??''); const e=Date.parse(string(c.date_end)??''); const n=Date.now(); return Number.isFinite(b)&&Number.isFinite(e)&&b<=n&&n<=e; }
