import { FavoriteProductProvider } from './favorite-product-provider.js';
import type { FavoriteImportPreview, FavoriteProductImporter } from './favorites.js';
import { persistSaleProducts, type ProductWriter } from './sale-product-persistence.js';
import type { ProductMetadataProvider } from './actress-product-provider.js';

export class FavoriteProductImportService implements FavoriteProductImporter {
  constructor(private readonly metadata: Pick<ProductMetadataProvider, 'lookup'>, private readonly writer: ProductWriter) {}

  async preview(urls: readonly string[]): Promise<FavoriteImportPreview> {
    const result = await new FavoriteProductProvider(urls, this.metadata).fetch({ limit: 20, page: 1 });
    return {
      items: result.items,
      saveCandidateCount: result.saveCandidateCount ?? result.items.length,
      metadataUnavailableCount: result.metadataUnavailableCount,
      apiNotListedCount: result.apiNotListedCount,
      metadataIdMismatchCount: result.metadataIdMismatchCount,
      invalidMetadataCount: result.invalidMetadataCount,
      failedCount: result.failedCount,
      vrExcludedCount: result.vrExcludedCount
    };
  }

  async persist(preview: FavoriteImportPreview) {
    const productOnlyWriter: ProductWriter = {
      getByFanzaProductId: (id) => this.writer.getByFanzaProductId(id),
      create: (input) => this.writer.create(input),
      update: (id, input) => this.writer.update(id, input)
    };
    return persistSaleProducts(
      { source: 'favorite', fetch: async () => ({ source: 'favorite', items: preview.items, fetchedAt: new Date().toISOString(), warnings: [], hasMore: false }) },
      productOnlyWriter
    );
  }
}
