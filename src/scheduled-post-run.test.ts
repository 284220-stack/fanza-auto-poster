import assert from 'node:assert/strict';
import { ScheduledPostRunService } from './scheduled-post-run.js';
import { parseScheduledPostRunArguments, scheduledPostRunExitCode } from './scheduled-post-run-cli.js';
import type { CandidateSelectionResult, PostCandidate } from './post-candidate-selection.js';

const client = { createPost: async () => ({ postId: 'parent', textLength: 1, createdAt: 'now' }), createReply: async () => ({ postId: 'reply', textLength: 1, createdAt: 'now' }) };
const makeCandidate = (productId: number, category: PostCandidate['category'] = 'sale'): PostCandidate => ({ productId, category, title: '30%OFF Sample title', actressNames: [], affiliateUrl: 'https://example.invalid/item', selectionReasons: [], priorityScore: 1 });
const selection = (selected: PostCandidate[], warnings: string[] = []): CandidateSelectionResult => ({ saleCandidates: selected.filter((item) => item.category === 'sale'), actressCandidates: selected.filter((item) => item.category === 'actress'), favoriteSaleCandidates: selected.filter((item) => item.category === 'favorite_sale'), selected, excludedCount: 0, warnings, generatedAt: 'now' });

const inputs: Array<{ productId: number; dryRun?: boolean }> = [];
const orchestrator = { run: async (input: { productId: number; dryRun?: boolean }) => {
  inputs.push(input);
  if (input.productId === 3) throw new Error('expected test failure');
  if (input.productId === 4) return { action: 'blocked', status: 'blocked', warnings: [], errors: [] };
  if (input.productId === 5) return { action: 'retry_reply', status: 'dry_run', warnings: [], errors: [] };
  return { action: input.dryRun ? 'dry_run' : 'new_thread', status: input.dryRun ? 'dry_run' : 'success', warnings: [], errors: [] };
} } as never;

const candidates = [makeCandidate(1), makeCandidate(2, 'actress'), makeCandidate(3), makeCandidate(4), makeCandidate(5, 'favorite_sale'), makeCandidate(1)];
const service = new ScheduledPostRunService(async () => selection(candidates, ['category_shortage:actress']), orchestrator);
const preview = await service.run({ client });
assert.equal(preview.mode, 'preview');
assert.equal(preview.selectedCount, 5);
assert.equal(preview.dryRunCount, 3);
assert.equal(preview.failedCount, 1);
assert.equal(preview.blockedCount, 1);
assert.equal(preview.retryReplyCount, 1);
assert.deepEqual(preview.items.map((item) => item.productId), [1, 2, 3, 4, 5]);
assert.ok(preview.warnings.includes('category_shortage:actress'));
assert.deepEqual(inputs.slice(0, 2).map((input) => input.dryRun), [true, true]);

const execute = await service.run({ mode: 'execute', limit: 2, client });
assert.equal(execute.mode, 'execute');
assert.equal(execute.successCount, 2);
assert.deepEqual(inputs.slice(-2).map((input) => input.dryRun), [undefined, undefined]);

let release!: () => void;
const lockedService = new ScheduledPostRunService(() => new Promise((resolve) => { release = () => resolve(selection([])); }), orchestrator);
const firstRun = lockedService.run({ client });
const overlapping = await lockedService.run({ client });
assert.equal(overlapping.alreadyRunning, true);
assert.ok(overlapping.warnings.includes('already_running'));
release();
await firstRun;

let failed = false;
const recoveryService = new ScheduledPostRunService(async () => {
  if (!failed) { failed = true; throw new Error('selector failed'); }
  return selection([]);
}, orchestrator);
const failedRun = await recoveryService.run({ client });
assert.ok(failedRun.warnings.includes('scheduled_run_failed'));
const recovered = await recoveryService.run({ client });
assert.equal(recovered.alreadyRunning, false);
assert.equal(recovered.selectedCount, 0);

assert.deepEqual(parseScheduledPostRunArguments([]), { mode: 'preview', limit: 5 });
assert.deepEqual(parseScheduledPostRunArguments(['--execute', '--limit', '2']), { mode: 'execute', limit: 2 });
assert.deepEqual(parseScheduledPostRunArguments(['--limit=99']), { mode: 'preview', limit: 5 });
assert.equal(scheduledPostRunExitCode({ ...preview, failedCount: 0, blockedCount: 0, partialSuccessCount: 0, alreadyRunning: false }), 0);
assert.equal(scheduledPostRunExitCode({ ...execute, partialSuccessCount: 1 }), 1);
assert.equal(scheduledPostRunExitCode({ ...preview, alreadyRunning: true }), 1);

console.log('scheduled post run: ok');
