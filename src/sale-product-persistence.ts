import type { Product, ProductInput } from './products.js';
import type { ProductProvider, ProviderItem } from './providers.js';
import { isVrProduct } from './vr-product.js';

export type ProductWriter = { getByFanzaProductId(id: string): Promise<Product | undefined>; create(input: ProductInput): Promise<Product>; update(id: number, input: ProductInput): Promise<Product>; replaceActressRelations?(productId: number, names: readonly string[]): Promise<number> };
export type PersistenceResult = { fetchedCount:number; createdCount:number; updatedCount:number; skippedCount:number; failedCount:number; warnings:string[]; errors:Array<{productId:string;message:string}>; startedAt:string; completedAt:string };

export async function persistSaleProducts(provider: ProductProvider, writer: ProductWriter): Promise<PersistenceResult> {
  const startedAt = new Date().toISOString(); const fetched = await provider.fetch({ saleOnly: true });
  const result: PersistenceResult = { fetchedCount: fetched.items.length, createdCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0, warnings: [...fetched.warnings], errors: [], startedAt, completedAt: startedAt };
  const seen = new Set<string>();
  for (const item of fetched.items) {
    if (seen.has(item.externalProductId)) { result.skippedCount++; continue; }
    seen.add(item.externalProductId);
    if (isVrProduct(item)) { result.skippedCount++; result.warnings.push('vr_excluded'); continue; }
    if (!item.externalProductId || !item.title || !item.affiliateUrl) { result.skippedCount++; result.warnings.push('保存に必要な商品情報が不足しています。'); continue; }
    try {
      const current = await writer.getByFanzaProductId(item.externalProductId);
      const input = merge(current, item);
      const saved = current ? await writer.update(current.id, input) : await writer.create(input);
      if (current) result.updatedCount++; else result.createdCount++;
      await writer.replaceActressRelations?.(saved.id, item.actressNames ?? []);
    } catch {
      result.failedCount++; result.errors.push({ productId: item.externalProductId || 'unknown', message: '商品を保存できませんでした。' });
    }
  }
  result.completedAt = new Date().toISOString(); return result;
}

function merge(current: Product | undefined, item: ProviderItem): ProductInput {
  const price = pickPrice(item.price, current?.price); const salePrice = pickPrice(item.salePrice, current?.salePrice); const hasIncomingPrice = item.price !== null || item.salePrice !== null;
  return { fanzaProductId: item.externalProductId, title: item.title, productUrl: pick(item.productUrl, current?.productUrl)!, affiliateUrl: pick(item.affiliateUrl, current?.affiliateUrl), sampleVideoUrl: pick(item.sampleVideoUrl, current?.sampleVideoUrl), thumbnailUrl: pick(item.thumbnailUrl, current?.thumbnailUrl), price, salePrice, isSale: item.source === 'favorite' ? (current?.isSale ?? false) : (hasIncomingPrice ? item.isSale : (current?.isSale ?? false)), releaseDate: pick(item.releaseDate, current?.releaseDate), status: 'available' };
}
function pick<T>(value: T | undefined, current: T | undefined | null) { return typeof value === 'string' && !value.trim() ? current : value ?? current; }
function pickPrice(value: number | null, current: string | null | undefined) { return value ?? (current === null || current === undefined ? null : Number(current)); }
