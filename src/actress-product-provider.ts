import type { Actress } from './actresses.js';
import { parseOptionalDmmPrice } from './dmm-price.js';
import type { ProductProvider, ProviderItem, ProviderQuery, ProviderResult } from './providers.js';

export type DmmHttpClient = { get(url: string, signal: AbortSignal): Promise<{ status: number; json(): Promise<unknown> }> };
export type ActressProductProviderResult = ProviderResult & { registeredActressCount: number; searchedActressCount: number; verifiedMatchCount: number; unmatchedCount: number; uniqueProductCount: number; perActress: Array<{ actressId: number; fetchedCount: number; verifiedMatchCount: number }> };
type ApiItem = Record<string, unknown>;

export class ProductMetadataProvider {
  constructor(private readonly http: DmmHttpClient, private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async fetch(contentId: string): Promise<ProviderItem | undefined> {
    const body = await this.request({ cid: contentId, hits: '1', offset: '1' });
    const item = items(body)[0];
    return item ? toProduct(item) : undefined;
  }

  private async request(extra: Record<string, string>) {
    const apiId = this.environment.DMM_API_ID;
    const affiliateId = this.environment.DMM_AFFILIATE_ID;
    if (!apiId || !affiliateId) throw new Error('configuration_missing');
    const query = new URLSearchParams({ api_id: apiId, affiliate_id: affiliateId, site: 'FANZA', service: 'digital', floor: 'videoa', output: 'json', ...extra });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
    try { const response = await this.http.get(`https://api.dmm.com/affiliate/v3/ItemList?${query}`, controller.signal); if (response.status < 200 || response.status >= 300) throw new Error('metadata_failed'); return response.json() as Promise<unknown>; }
    finally { clearTimeout(timer); }
  }
}

export class ActressProductProvider implements ProductProvider {
  readonly source = 'actress' as const;
  constructor(private readonly actresses: readonly Actress[], private readonly http: DmmHttpClient, private readonly metadata: ProductMetadataProvider, private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async fetch(_query: ProviderQuery = {}): Promise<ActressProductProviderResult> {
    const targets = this.actresses.filter((actress) => actress.enabled && actress.targetNewReleases);
    const result: ActressProductProviderResult = { source: 'actress', items: [], fetchedAt: new Date().toISOString(), warnings: [], hasMore: false, registeredActressCount: targets.length, searchedActressCount: 0, verifiedMatchCount: 0, unmatchedCount: 0, uniqueProductCount: 0, perActress: [] };
    const candidates = new Map<string, Set<string>>();
    for (const actress of targets) {
      const terms = [...new Set([actress.name, ...actress.aliases].map((value) => value.trim()).filter(Boolean))];
      let fetchedCount = 0; let verifiedMatchCount = 0;
      for (const term of terms) {
        result.searchedActressCount++;
        try {
          const body = await this.search(term);
          for (const raw of items(body)) {
            fetchedCount++;
            const candidate = toProduct(raw);
            if (!candidate || !matches(candidate.actressNames ?? [], terms)) { result.unmatchedCount++; continue; }
            verifiedMatchCount++;
            const names = candidates.get(candidate.externalProductId) ?? new Set<string>(); terms.forEach((name) => names.add(name)); candidates.set(candidate.externalProductId, names);
          }
        } catch { result.warnings.push('actress_search_failed'); }
      }
      result.verifiedMatchCount += verifiedMatchCount;
      result.perActress.push({ actressId: actress.id, fetchedCount, verifiedMatchCount });
    }
    for (const [contentId, expectedNames] of candidates) {
      try {
        const item = await this.metadata.fetch(contentId);
        if (!item || !matches(item.actressNames ?? [], [...expectedNames])) { result.unmatchedCount++; continue; }
        result.items.push(item);
      } catch { result.warnings.push('metadata_failed'); }
    }
    result.uniqueProductCount = result.items.length;
    return result;
  }

  private async search(keyword: string): Promise<unknown> {
    const apiId = this.environment.DMM_API_ID; const affiliateId = this.environment.DMM_AFFILIATE_ID;
    if (!apiId || !affiliateId) throw new Error('configuration_missing');
    const query = new URLSearchParams({ api_id: apiId, affiliate_id: affiliateId, site: 'FANZA', service: 'digital', floor: 'videoa', keyword, sort: 'date', hits: '5', offset: '1', output: 'json' });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
    try { const response = await this.http.get(`https://api.dmm.com/affiliate/v3/ItemList?${query}`, controller.signal); if (response.status < 200 || response.status >= 300) throw new Error('search_failed'); return response.json(); }
    finally { clearTimeout(timer); }
  }
}

function items(value: unknown): ApiItem[] { return typeof value === 'object' && value !== null && 'result' in value && typeof value.result === 'object' && value.result !== null && 'items' in value.result && Array.isArray(value.result.items) ? value.result.items.filter((item): item is ApiItem => object(item) !== undefined) : []; }
function object(value: unknown): ApiItem | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as ApiItem : undefined; }
function string(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function toProduct(raw: ApiItem): ProviderItem | undefined { const id = string(raw.content_id) ?? string(raw.product_id); const title = string(raw.title); const productUrl = string(raw.URL); if (!id || !title || !productUrl) return undefined; const info = object(raw.iteminfo); const group = [info?.actress, raw.actress, raw.actresses].find(Array.isArray) as unknown[] | undefined ?? []; const movie = object(raw.sampleMovieURL); const image = object(raw.imageURL); const prices = object(raw.prices); const price = parseOptionalDmmPrice(prices?.list_price); const salePrice = parseOptionalDmmPrice(prices?.price); return { source: 'actress', externalProductId: id, title, productUrl, affiliateUrl: string(raw.affiliateURL), thumbnailUrl: string(image?.large) ?? string(image?.list), sampleVideoUrl: ['size_720_480', 'size_644_414', 'size_560_360'].map((key) => string(movie?.[key])).find(Boolean), price, salePrice, isSale: false, releaseDate: string(raw.date)?.slice(0, 10), actressNames: [...new Set(group.map((value) => string(object(value)?.name)).filter((name): name is string => Boolean(name)))], fetchedAt: new Date().toISOString() }; }
function matches(responseNames: readonly string[], terms: readonly string[]) { return responseNames.some((name) => terms.includes(name)); }
