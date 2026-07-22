import { extractFanzaContentId } from './favorites.js';
import type { ProductMetadataProvider } from './actress-product-provider.js';
import type { ProductProvider, ProviderItem, ProviderQuery, ProviderResult } from './providers.js';
import { isVrProduct } from './vr-product.js';

export type FavoriteMetadataProvider = Pick<ProductMetadataProvider, 'lookup'>;
export type FavoriteProductProviderResult = ProviderResult & {
  receivedCount: number;
  validUrlCount: number;
  invalidUrlCount: number;
  uniqueContentIdCount: number;
  metadataAvailableCount: number;
  metadataUnavailableCount: number;
  apiNotListedCount: number;
  metadataIdMismatchCount: number;
  invalidMetadataCount: number;
  vrExcludedCount: number;
  failedCount: number;
};

export class FavoriteProductProvider implements ProductProvider {
  readonly source = 'favorite' as const;

  constructor(private readonly urls: readonly string[], private readonly metadata: FavoriteMetadataProvider) {}

  async fetch(query: ProviderQuery = {}): Promise<FavoriteProductProviderResult> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 20);
    const page = Math.max(query.page ?? 1, 1);
    const extracted = this.urls.map(extractFanzaContentId);
    const contentIds = [...new Set(extracted.filter((value): value is string => value !== undefined))];
    const selected = contentIds.slice((page - 1) * limit, page * limit);
    const items: ProviderItem[] = [];
    const warnings: string[] = [];
    let metadataUnavailableCount = 0;
    let apiNotListedCount = 0;
    let metadataIdMismatchCount = 0;
    let invalidMetadataCount = 0;
    let vrExcludedCount = 0;
    let failedCount = 0;

    for (const contentId of selected) {
      try {
        const lookup = await this.metadata.lookup(contentId, 'favorite');
        switch (lookup.status) {
          case 'api_not_listed': metadataUnavailableCount += 1; apiNotListedCount += 1; warnings.push('api_not_listed'); break;
          case 'id_mismatch': metadataUnavailableCount += 1; metadataIdMismatchCount += 1; warnings.push('metadata_id_mismatch'); break;
          case 'invalid_metadata': metadataUnavailableCount += 1; invalidMetadataCount += 1; warnings.push('invalid_metadata'); break;
          case 'vr_excluded': vrExcludedCount += 1; warnings.push('vr_excluded'); break;
          case 'available':
            if (isVrProduct(lookup.item)) { vrExcludedCount += 1; warnings.push('vr_excluded'); }
            else items.push({ ...lookup.item, source: 'favorite', isSale: false });
            break;
        }
      } catch {
        failedCount += 1;
        warnings.push('metadata_failed');
      }
    }

    const hasMore = page * limit < contentIds.length;
    return {
      source: 'favorite',
      items,
      fetchedAt: new Date().toISOString(),
      warnings,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
      responseItemCount: selected.length,
      saveCandidateCount: items.length,
      receivedCount: this.urls.length,
      validUrlCount: extracted.filter(Boolean).length,
      invalidUrlCount: extracted.filter((value) => value === undefined).length,
      uniqueContentIdCount: contentIds.length,
      metadataAvailableCount: items.length,
      metadataUnavailableCount,
      apiNotListedCount,
      metadataIdMismatchCount,
      invalidMetadataCount,
      vrExcludedCount,
      failedCount
    };
  }
}
