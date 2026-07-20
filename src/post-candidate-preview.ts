import { analyzeProductTitle } from './product-title-analysis.js';
import { generateKillerMessages } from './killer-message-generation.js';
import { generatePostTemplates } from './post-template-generation.js';
import type { CandidateSelectionResult, PostCandidate } from './post-candidate-selection.js';
import type { PostExecutionOrchestrator } from './post-execution-orchestrator.js';
import type { XPostClient } from './thread-post-execution.js';

export type PostCandidatePreviewInput = { limits?: unknown; preferredTemplateStyle?: 'sale_first' | 'actress_first' | 'campaign_first' | 'balanced'; client: XPostClient };
export type PostCandidatePreviewItem = { productId: number; category: string; action: string; status: string; selectedOrder: number; parentPostCharacterCount: number; replyCharacterCount: number; killerMessageStyle?: string; warnings: string[]; errors: string[] };
export type PostCandidatePreviewResult = { requestedCount: number; selectedCount: number; previewedCount: number; blockedCount: number; retryReplyCount: number; failedCount: number; items: PostCandidatePreviewItem[]; warnings: string[]; generatedAt: string };
export class PostCandidatePreviewService {
  constructor(private readonly select: () => Promise<CandidateSelectionResult>, private readonly orchestrator: PostExecutionOrchestrator) {}
  async preview(input: PostCandidatePreviewInput): Promise<PostCandidatePreviewResult> {
    const selection = await this.select(); const candidates = selection.selected.slice(0, 5); const items: PostCandidatePreviewItem[] = [];
    for (const [index, candidate] of candidates.entries()) items.push(await this.previewOne(candidate, index + 1, input));
    return { requestedCount: 5, selectedCount: candidates.length, previewedCount: items.length, blockedCount: items.filter((item) => item.status === 'blocked').length, retryReplyCount: items.filter((item) => item.action === 'retry_reply').length, failedCount: items.filter((item) => item.status === 'failed').length, items, warnings: selection.warnings, generatedAt: new Date().toISOString() };
  }
  private async previewOne(candidate: PostCandidate, selectedOrder: number, input: PostCandidatePreviewInput): Promise<PostCandidatePreviewItem> {
    try {
      const analysis = analyzeProductTitle(candidate.title); const killer = generateKillerMessages({ analysis, actressNames: candidate.actressNames }).primary;
      const post = generatePostTemplates({ titleAnalysis: analysis, killerMessage: killer, actressNames: candidate.actressNames, preferredStyle: input.preferredTemplateStyle }).primary;
      if (!post) return { productId: candidate.productId, category: candidate.category, action: 'blocked', status: 'failed', selectedOrder, parentPostCharacterCount: 0, replyCharacterCount: 0, warnings: [], errors: ['template_unavailable'] };
      const result = await this.orchestrator.run({ productId: candidate.productId, parentPostText: post.text, affiliateUrl: candidate.affiliateUrl, dryRun: true, client: input.client });
      return { productId: candidate.productId, category: candidate.category, action: result.action, status: result.status, selectedOrder, parentPostCharacterCount: post.characterCount, replyCharacterCount: Array.from(`作品はこちら\n${candidate.affiliateUrl}`).length, killerMessageStyle: killer?.style, warnings: [...analysis.warnings, ...result.warnings], errors: result.errors };
    } catch { return { productId: candidate.productId, category: candidate.category, action: 'blocked', status: 'failed', selectedOrder, parentPostCharacterCount: 0, replyCharacterCount: 0, warnings: [], errors: ['preview_failed'] }; }
  }
}
