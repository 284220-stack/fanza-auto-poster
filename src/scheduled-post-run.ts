import { analyzeProductTitle } from './product-title-analysis.js';
import { generateKillerMessages } from './killer-message-generation.js';
import { generatePostTemplates } from './post-template-generation.js';
import type { CandidateCategory, CandidateSelectionResult, PostCandidate } from './post-candidate-selection.js';
import { PostCandidatePreviewService } from './post-candidate-preview.js';
import type { PostExecutionAction, PostExecutionOrchestrator, PostExecutionStatus } from './post-execution-orchestrator.js';
import type { XPostClient } from './thread-post-execution.js';
import { isVrTitle } from './vr-product.js';
import type { PostMediaResolverLike } from './post-media.js';

export type ScheduledPostRunMode = 'preview' | 'execute';
export type ScheduledPostRunOptions = { mode?: ScheduledPostRunMode; limit?: number; client: XPostClient };
export type ScheduledPostRunItem = { productId: number; category: CandidateCategory; action: PostExecutionAction; status: PostExecutionStatus; selectedOrder: number; warnings: string[]; errors: string[] };
export type ScheduledPostRunResult = { mode: ScheduledPostRunMode; startedAt: string; completedAt: string; selectedCount: number; attemptedCount: number; successCount: number; partialSuccessCount: number; blockedCount: number; retryReplyCount: number; dryRunCount: number; failedCount: number; warnings: string[]; errors: string[]; items: ScheduledPostRunItem[]; alreadyRunning: boolean };

export class ScheduledPostRunService {
  private running = false;

  constructor(private readonly select: () => Promise<CandidateSelectionResult>, private readonly orchestrator: PostExecutionOrchestrator, private readonly media: PostMediaResolverLike) {}

  async run(options: ScheduledPostRunOptions): Promise<ScheduledPostRunResult> {
    const startedAt = new Date().toISOString();
    const mode = options.mode ?? 'preview';
    const finish = (items: ScheduledPostRunItem[], warnings: string[], alreadyRunning = false): ScheduledPostRunResult => ({
      mode, startedAt, completedAt: new Date().toISOString(), selectedCount: items.length, attemptedCount: items.length,
      successCount: items.filter((item) => item.status === 'success').length,
      partialSuccessCount: items.filter((item) => item.status === 'partial_success').length,
      blockedCount: items.filter((item) => item.status === 'blocked').length,
      retryReplyCount: items.filter((item) => item.action === 'retry_reply').length,
      dryRunCount: items.filter((item) => item.status === 'dry_run').length,
      failedCount: items.filter((item) => item.status === 'failed').length,
      warnings, errors: items.flatMap((item) => item.errors), items, alreadyRunning
    });
    if (this.running) return finish([], ['already_running'], true);

    this.running = true;
    try {
      const selection = await this.select();
      const limit = Number.isInteger(options.limit) && options.limit! > 0 ? Math.min(options.limit!, 5) : 5;
      if (mode === 'preview') return this.preview(selection, limit, options.client, finish);
      const seen = new Set<number>();
      const items: ScheduledPostRunItem[] = [];
      for (const candidate of selection.selected.slice(0, limit)) {
        if (seen.has(candidate.productId)) continue;
        seen.add(candidate.productId);
        items.push(await this.runOne(candidate, items.length + 1, mode, options.client));
      }
      return finish(items, selection.warnings);
    } catch {
      return finish([], ['scheduled_run_failed']);
    } finally {
      this.running = false;
    }
  }

  private async preview(selection: CandidateSelectionResult, limit: number, client: XPostClient, finish: (items: ScheduledPostRunItem[], warnings: string[], alreadyRunning?: boolean) => ScheduledPostRunResult) {
    const selected = selection.selected.slice(0, limit);
    const preview = await new PostCandidatePreviewService(async () => ({ ...selection, selected }), this.orchestrator, this.media).preview({ client });
    const seen = new Set<number>();
    const items = preview.items.filter((item) => !seen.has(item.productId) && Boolean(seen.add(item.productId))).map((item, index) => ({
      productId: item.productId, category: item.category as CandidateCategory, action: item.action as PostExecutionAction, status: item.status as PostExecutionStatus,
      selectedOrder: index + 1, warnings: item.warnings, errors: item.errors
    }));
    return finish(items, preview.warnings);
  }

  private async runOne(candidate: PostCandidate, selectedOrder: number, mode: ScheduledPostRunMode, client: XPostClient): Promise<ScheduledPostRunItem> {
    if (isVrTitle(candidate.title)) return { productId: candidate.productId, category: candidate.category, action: 'blocked', status: 'blocked', selectedOrder, warnings: ['vr_excluded'], errors: [] };
    try {
      const analysis = analyzeProductTitle(candidate.title);
      const killer = generateKillerMessages({ analysis, actressNames: candidate.actressNames }).primary;
      const post = generatePostTemplates({ titleAnalysis: analysis, killerMessage: killer, actressNames: candidate.actressNames }).primary;
      if (!post) return { productId: candidate.productId, category: candidate.category, action: 'blocked', status: 'failed', selectedOrder, warnings: [], errors: ['template_unavailable'] };
      const resolved = await this.media.resolve(candidate.sampleVideoUrl, candidate.thumbnailUrl);
      if (!resolved.media) return { productId: candidate.productId, category: candidate.category, action: 'blocked', status: 'failed', selectedOrder, warnings: resolved.warnings, errors: ['media_unavailable'] };
      const result = await this.orchestrator.run({ productId: candidate.productId, parentPostText: post.text, affiliateUrl: candidate.affiliateUrl, media: resolved.media, dryRun: mode === 'preview' ? true : undefined, client });
      return { productId: candidate.productId, category: candidate.category, action: result.action, status: result.status, selectedOrder, warnings: [...analysis.warnings, ...resolved.warnings, ...result.warnings], errors: result.errors };
    } catch {
      return { productId: candidate.productId, category: candidate.category, action: 'blocked', status: 'failed', selectedOrder, warnings: [], errors: ['scheduled_item_failed'] };
    }
  }
}
