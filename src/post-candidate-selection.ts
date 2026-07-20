export type CandidateCategory = 'sale' | 'actress' | 'favorite_sale';
export type CandidateSource = { productId: number; title: string; affiliateUrl: string | null; sampleVideoUrl?: string | null; releaseDate?: string | null; isSale: boolean; status: string; favorite: boolean; actressNames: string[]; enabledActressNames: string[]; actressPriority: number; hasRecentParentPost: boolean; hasPendingReply: boolean; discountPercent?: number; campaignName?: string };
export type PostCandidate = { productId: number; category: CandidateCategory; title: string; actressNames: string[]; affiliateUrl: string; sampleVideoUrl?: string; releaseDate?: string; discountPercent?: number; campaignName?: string; selectionReasons: string[]; priorityScore: number };
export type CandidateSelectionOptions = { saleLimit?: number; actressLimit?: number; favoriteSaleLimit?: number };
export type CandidateSelectionResult = { saleCandidates: PostCandidate[]; actressCandidates: PostCandidate[]; favoriteSaleCandidates: PostCandidate[]; selected: PostCandidate[]; excludedCount: number; warnings: string[]; generatedAt: string };
export type PostCandidateRepository = { listSelectable(): Promise<CandidateSource[]> };
export class DatabasePostCandidateRepository implements PostCandidateRepository {
  constructor(private readonly db: { query<T>(sql: string): Promise<{ rows: T[] }> }) {}
  async listSelectable() {
    return (await this.db.query<CandidateSource>(`SELECT p.id AS "productId", p.title, p.affiliate_url AS "affiliateUrl", p.sample_video_url AS "sampleVideoUrl", p.release_date::text AS "releaseDate", p.is_sale AS "isSale", p.status, EXISTS(SELECT 1 FROM favorites f WHERE f.product_id=p.id) AS favorite, COALESCE(array_agg(DISTINCT a.name) FILTER (WHERE a.id IS NOT NULL), '{}') AS "actressNames", COALESCE(array_agg(DISTINCT a.name) FILTER (WHERE a.enabled), '{}') AS "enabledActressNames", COALESCE(MAX(a.priority) FILTER (WHERE a.enabled),0) AS "actressPriority", EXISTS(SELECT 1 FROM post_history h WHERE h.product_id=p.id AND h.post_type='parent' AND h.execution_status IN ('posted','pending_reply') AND h.posted_at >= current_timestamp - interval '30 days') AS "hasRecentParentPost", EXISTS(SELECT 1 FROM post_history h WHERE h.product_id=p.id AND h.post_type='parent' AND h.execution_status='pending_reply') AS "hasPendingReply" FROM products p LEFT JOIN product_actresses pa ON pa.product_id=p.id LEFT JOIN actresses a ON a.id=pa.actress_id GROUP BY p.id`)).rows;
  }
}
export class PostCandidateSelectionService {
  constructor(private readonly repository: PostCandidateRepository) {}
  async select(options: CandidateSelectionOptions = {}): Promise<CandidateSelectionResult> {
    const all = await this.repository.listSelectable(); const eligible = all.filter(isEligible); const used = new Set<number>();
    const take = (category: CandidateCategory, values: CandidateSource[], limit: number) => values.filter((value) => !used.has(value.productId)).sort(compare).slice(0, limit).map((value) => { used.add(value.productId); return candidate(value, category); });
    const saleCandidates = take('sale', eligible.filter((v) => v.isSale), options.saleLimit ?? 2);
    const actressCandidates = take('actress', eligible.filter((v) => v.enabledActressNames.length > 0), options.actressLimit ?? 2);
    const favoriteSaleCandidates = take('favorite_sale', eligible.filter((v) => v.favorite && v.isSale), options.favoriteSaleLimit ?? 1);
    const warnings = ([['sale', saleCandidates, options.saleLimit ?? 2], ['actress', actressCandidates, options.actressLimit ?? 2], ['favorite_sale', favoriteSaleCandidates, options.favoriteSaleLimit ?? 1]] as const).filter(([, values, limit]) => values.length < limit).map(([category]) => `category_shortage:${category}`);
    return { saleCandidates, actressCandidates, favoriteSaleCandidates, selected: [...saleCandidates, ...actressCandidates, ...favoriteSaleCandidates], excludedCount: all.length - eligible.length, warnings, generatedAt: new Date().toISOString() };
  }
}
function isEligible(v: CandidateSource) { return v.status === 'available' && Boolean(v.affiliateUrl) && Boolean(v.title.trim()) && !v.hasRecentParentPost && !v.hasPendingReply && (v.actressNames.length === 0 || v.enabledActressNames.length > 0); }
function compare(a: CandidateSource, b: CandidateSource) { return score(b) - score(a) || (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.productId - b.productId; }
function score(v: CandidateSource) { return v.actressPriority * 100 + (v.discountPercent ? 20 : 0) + (v.campaignName ? 10 : 0) + (v.sampleVideoUrl ? 5 : 0); }
function candidate(v: CandidateSource, category: CandidateCategory): PostCandidate { return { productId: v.productId, category, title: v.title, actressNames: v.enabledActressNames, affiliateUrl: v.affiliateUrl!, sampleVideoUrl: v.sampleVideoUrl ?? undefined, releaseDate: v.releaseDate ?? undefined, discountPercent: v.discountPercent, campaignName: v.campaignName, selectionReasons: [category, ...(v.discountPercent ? ['discount'] : []), ...(v.campaignName ? ['campaign'] : []), ...(v.sampleVideoUrl ? ['sample_video'] : [])], priorityScore: score(v) }; }
