import type { ProviderItem } from './providers.js';

/** Matches only explicit VR metadata or an explicit title prefix. */
export function isVrProduct(item: Pick<ProviderItem, 'title' | 'rawData'>): boolean {
  return structuredValues(item.rawData).some(isVrStructuredValue) || isVrTitle(item.title);
}

export function isVrTitle(title: string): boolean {
  return /^[\[【]\s*VR\s*[\]】]/i.test(title.normalize('NFKC').trim());
}

function structuredValues(raw: Record<string, unknown> | undefined): string[] {
  if (!raw) return [];
  return ['productType', 'product_type', 'category', 'floor', 'genre', 'genres'].flatMap((key) => {
    const value = raw[key];
    if (typeof value === 'string') return [value];
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => typeof entry === 'string' ? [entry] : typeof entry === 'object' && entry !== null && 'name' in entry && typeof entry.name === 'string' ? [entry.name] : []);
  });
}

function isVrStructuredValue(value: string): boolean {
  const normalized = value.normalize('NFKC').trim().toUpperCase();
  return normalized === 'VR' || normalized.startsWith('VR_') || normalized.startsWith('VR作品') || normalized.includes('バーチャルリアリティ');
}
