import { createHash } from 'node:crypto';
import type { ProductMetadataProvider, ProductMetadataLookupResult } from './actress-product-provider.js';
import { extractFanzaContentId } from './favorites.js';
import type { ProviderItem } from './providers.js';
import type { ProductSourcePersistResult, ProductSourcePlan } from './product-sources.js';

export const MAX_MANUAL_SALE_PRODUCTS = 20;

export type ManualSaleSyncStore = {
  schemaReady(): Promise<boolean>;
  planSaleSnapshot(contentIds: readonly string[]): Promise<ProductSourcePlan>;
  persistSaleSnapshot(items: readonly ProviderItem[]): Promise<ProductSourcePersistResult>;
};

export type ManualSaleSyncResult = ProductSourcePlan & {
  checkOnly: boolean;
  schemaReady: boolean;
  snapshotComplete: boolean;
  snapshotHash: string;
  receivedCount: number;
  validCount: number;
  invalidCount: number;
  uniqueProductCount: number;
  saveCandidateCount: number;
  metadataAvailableCount: number;
  apiNotListedCount: number;
  metadataIdMismatchCount: number;
  invalidMetadataCount: number;
  vrExcludedCount: number;
  failedCount: number;
  createdProductCount: number;
  updatedProductCount: number;
};

export class ManualSaleSyncError extends Error {
  constructor(message: string, public readonly status: 400 | 409 | 500 = 400) {
    super(message);
    this.name = 'ManualSaleSyncError';
  }
}

export class ManualSaleSyncService {
  constructor(
    private readonly store: ManualSaleSyncStore,
    private readonly metadata: Pick<ProductMetadataProvider, 'lookup'>
  ) {}

  async sync(urls: readonly string[], options: { persist?: boolean; snapshotComplete?: boolean; expectedHash?: string } = {}): Promise<ManualSaleSyncResult> {
    if (urls.length > MAX_MANUAL_SALE_PRODUCTS) throw new ManualSaleSyncError(`一度に確認できるセール商品は${MAX_MANUAL_SALE_PRODUCTS}件までです。`);
    const extracted = urls.map(extractFanzaContentId);
    const contentIds = [...new Set(extracted.filter((value): value is string => value !== undefined))];
    const invalidCount = extracted.length - extracted.filter(Boolean).length;
    const snapshotHash = hash(contentIds);
    const schemaReady = await this.store.schemaReady();
    const snapshotComplete = options.snapshotComplete === true;
    const counters = { apiNotListedCount: 0, metadataIdMismatchCount: 0, invalidMetadataCount: 0, vrExcludedCount: 0, failedCount: 0 };
    const items: ProviderItem[] = [];

    for (const contentId of contentIds) {
      try {
        const lookup = await this.metadata.lookup(contentId, 'sale');
        collectLookup(lookup, items, counters);
      } catch {
        counters.failedCount += 1;
      }
    }
    const safeItems = items.filter((item) => Boolean(item.affiliateUrl));
    counters.invalidMetadataCount += items.length - safeItems.length;
    const plan = schemaReady
      ? await this.store.planSaleSnapshot(contentIds)
      : { matchedProductCount: 0, currentSaleCount: 0, activateCount: 0, deactivateCount: 0 };
    const base: ManualSaleSyncResult = {
      ...plan,
      checkOnly: !options.persist,
      schemaReady,
      snapshotComplete,
      snapshotHash,
      receivedCount: urls.length,
      validCount: urls.length - invalidCount,
      invalidCount,
      uniqueProductCount: contentIds.length,
      saveCandidateCount: Math.max(0, safeItems.length - plan.matchedProductCount),
      metadataAvailableCount: safeItems.length,
      ...counters,
      createdProductCount: 0,
      updatedProductCount: 0
    };
    if (!options.persist) return base;

    if (!schemaReady) throw new ManualSaleSyncError('商品取得経路migrationが未適用です。', 409);
    if (!snapshotComplete) throw new ManualSaleSyncError('完全なセール掲載集合として確認できないため保存できません。', 409);
    if (!contentIds.length || invalidCount > 0 || safeItems.length !== contentIds.length || Object.values(counters).some((count) => count > 0)) {
      throw new ManualSaleSyncError('全商品を安全に確認できないため保存できません。', 409);
    }
    if (!options.expectedHash || options.expectedHash !== snapshotHash) {
      throw new ManualSaleSyncError('check-only後に商品集合が変わったため保存できません。', 409);
    }
    try {
      const persisted = await this.store.persistSaleSnapshot(safeItems.map((item) => ({ ...item, source: 'sale', isSale: true })));
      return { ...base, ...persisted, checkOnly: false };
    } catch {
      throw new ManualSaleSyncError('セール掲載集合を保存できませんでした。', 500);
    }
  }
}

function collectLookup(
  lookup: ProductMetadataLookupResult,
  items: ProviderItem[],
  counters: { apiNotListedCount: number; metadataIdMismatchCount: number; invalidMetadataCount: number; vrExcludedCount: number }
) {
  switch (lookup.status) {
    case 'available': items.push({ ...lookup.item, source: 'sale', isSale: true }); break;
    case 'api_not_listed': counters.apiNotListedCount += 1; break;
    case 'id_mismatch': counters.metadataIdMismatchCount += 1; break;
    case 'invalid_metadata': counters.invalidMetadataCount += 1; break;
    case 'vr_excluded': counters.vrExcludedCount += 1; break;
  }
}

function hash(contentIds: readonly string[]) {
  return createHash('sha256').update([...contentIds].sort().join('\n')).digest('hex');
}
