import assert from 'node:assert/strict';
import { PostCandidatePreviewService } from './post-candidate-preview.js';
const candidate = { productId: 1, category: 'sale' as const, title: '【30%OFF】架空作品', actressNames: [], affiliateUrl: 'https://example.com/a', selectionReasons: [], priorityScore: 1 };
const selection = { saleCandidates: [candidate], actressCandidates: [], favoriteSaleCandidates: [], selected: [candidate], excludedCount: 0, warnings: ['category_shortage:actress'], generatedAt: 'now' };
const calls: boolean[] = []; const orchestrator = { run: async (input: { dryRun?: boolean }) => { calls.push(input.dryRun === true); return { action: 'dry_run', status: 'dry_run', warnings: [], errors: [], retryReplyPossible: false }; } } as never;
const result = await new PostCandidatePreviewService(async () => selection, orchestrator).preview({ client: { createPost: async () => { throw new Error(); }, createReply: async () => { throw new Error(); } } });
assert.equal(result.previewedCount, 1); assert.equal(result.items[0].status, 'dry_run'); assert.deepEqual(calls, [true]); assert.ok(result.warnings.includes('category_shortage:actress')); assert.equal(JSON.stringify(result).includes('example.com'), false);
console.log('post candidate preview: ok');
