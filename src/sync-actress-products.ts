import { ActressRepository, type Queryable } from './actresses.js';
import { ActressProductProvider, ProductMetadataProvider, type DmmHttpClient } from './actress-product-provider.js';
import { getDatabasePool, closeDatabasePool } from './db/pool.js';
import { ProductRepository, ProductService } from './products.js';
import { persistSaleProducts } from './sale-product-persistence.js';

type Mode = { persist: boolean; actressId?: number };
function parse(args: readonly string[]): Mode | undefined { const persist = args.includes('--persist'); const rest = args.filter((value) => value !== '--persist'); if (!rest.length) return { persist }; if (rest.length === 2 && rest[0] === '--actress' && /^\d+$/.test(rest[1])) return { persist, actressId: Number(rest[1]) }; return undefined; }
const http: DmmHttpClient = { async get(url, signal) { const response = await fetch(url, { signal }); return { status: response.status, json: () => response.json() }; } };
async function main() { const mode = parse(process.argv.slice(2)); if (!mode) { console.log('usage: sync:actresses [--persist] [--actress id]'); process.exitCode = 1; return; } const db = getDatabasePool() as unknown as Queryable; const actresses = (await new ActressRepository(db).list(true)).filter((value) => value.targetNewReleases && (!mode.actressId || value.id === mode.actressId)); const provider = new ActressProductProvider(actresses, http, new ProductMetadataProvider(http)); const preview = await provider.fetch(); const summary: Record<string, number | string> = { registeredActressCount: preview.registeredActressCount, searchedActressCount: preview.searchedActressCount, fetchedCount: preview.perActress.reduce((sum, value) => sum + value.fetchedCount, 0), verifiedMatchCount: preview.verifiedMatchCount, unmatchedCount: preview.unmatchedCount, uniqueProductCount: preview.uniqueProductCount, errorsCount: preview.warnings.length };
 if (mode.persist) { const saved = await persistSaleProducts({ source: provider.source, fetch: async () => preview }, new ProductService(new ProductRepository(db))); Object.assign(summary, { createdProductCount: saved.createdCount, updatedProductCount: saved.updatedCount, failedCount: saved.failedCount }); }
 console.log(Object.entries(summary).map(([key, value]) => `${key}: ${value}`).join('\n')); process.exitCode = preview.warnings.length ? 1 : 0; }
if (process.argv[1]?.endsWith('sync-actress-products.js')) void main().finally(() => closeDatabasePool());
