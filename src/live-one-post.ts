import { createHash } from 'node:crypto';
import type { CandidateSelectionResult, PostCandidate } from './post-candidate-selection.js';
import type { PostMediaResolverLike } from './post-media.js';
import type { PostExecutionInput, PostExecutionResult } from './post-execution-orchestrator.js';
import type { XPostClient } from './thread-post-execution.js';
import { composePostCandidate } from './post-candidate-content.js';
import { isVrTitle } from './vr-product.js';
import { generateReplyTemplate } from './reply-template.js';

export type LiveOnePreflight = {
  ready: boolean;
  productId?: number;
  title?: string;
  category?: 'actress';
  parentPostText?: string;
  parentCharacterCount?: number;
  mediaType?: 'video' | 'image';
  selfReply: boolean;
  executionCount: 1;
  confirmationToken?: string;
  warnings: string[];
  errors: string[];
};

export type LiveOneGuard = { reserve(productId: number, confirmationToken: string): Promise<boolean> };
type Orchestrator = { run(input: PostExecutionInput): Promise<PostExecutionResult> };

export class LiveOnePostService {
  constructor(
    private readonly select: () => Promise<CandidateSelectionResult>,
    private readonly orchestrator: Orchestrator,
    private readonly media: PostMediaResolverLike,
    private readonly guard: LiveOneGuard
  ) {}

  async preflight(): Promise<LiveOnePreflight> {
    const selection = await this.select();
    const candidate = selection.actressCandidates[0];
    if (!candidate) return failed(['actress_candidate_unavailable'], selection.warnings);
    return this.prepare(candidate, selection.warnings);
  }

  async execute(confirmationToken: string, client: XPostClient) {
    const preflight = await this.preflight();
    if (!preflight.ready || !preflight.productId || !preflight.confirmationToken || !preflight.parentPostText) {
      return { preflight, executed: false, result: undefined, errors: preflight.errors };
    }
    if (!confirmationToken || !safeEqual(confirmationToken, preflight.confirmationToken)) {
      return { preflight, executed: false, result: undefined, errors: ['confirmation_token_mismatch'] };
    }
    if (!await this.guard.reserve(preflight.productId, confirmationToken)) {
      return { preflight, executed: false, result: undefined, errors: ['live_one_already_attempted'] };
    }
    const candidate = (await this.select()).actressCandidates.find((item) => item.productId === preflight.productId);
    if (!candidate) return { preflight, executed: false, result: undefined, errors: ['candidate_changed_after_reservation'] };
    const prepared = await this.prepare(candidate, []);
    if (!prepared.ready || prepared.confirmationToken !== confirmationToken || !prepared.parentPostText) {
      return { preflight: prepared, executed: false, result: undefined, errors: ['candidate_changed_after_reservation'] };
    }
    const resolved = await this.media.resolve(candidate.sampleVideoUrl, candidate.thumbnailUrl);
    if (!resolved.media) return { preflight: prepared, executed: false, result: undefined, errors: ['media_unavailable_after_reservation'] };
    const result = await this.orchestrator.run({ productId: candidate.productId, parentPostText: prepared.parentPostText, affiliateUrl: candidate.affiliateUrl, media: resolved.media, dryRun: false, client });
    return { preflight: prepared, executed: true, result, errors: result.errors };
  }

  private async prepare(candidate: PostCandidate, selectionWarnings: string[]): Promise<LiveOnePreflight> {
    if (candidate.category !== 'actress') return failed(['category_not_actress'], selectionWarnings);
    if (isVrTitle(candidate.title)) return failed(['vr_excluded'], selectionWarnings);
    const reply = generateReplyTemplate({ affiliateUrl: candidate.affiliateUrl });
    if (!reply.reply) return failed(['affiliate_url_invalid'], [...selectionWarnings, ...reply.warnings]);
    const content = composePostCandidate(candidate);
    if (!content.post || !content.post.text.startsWith('【PR】\n') || /https?:\/\//iu.test(content.post.text)) return failed(['parent_post_invalid'], [...selectionWarnings, ...content.analysis.warnings]);
    const resolved = await this.media.resolve(candidate.sampleVideoUrl, candidate.thumbnailUrl);
    if (!resolved.media) return failed(['media_unavailable'], [...selectionWarnings, ...resolved.warnings]);
    const token = createHash('sha256').update(JSON.stringify({ productId: candidate.productId, category: candidate.category, parentPostText: content.post.text, mediaType: resolved.media.kind })).digest('hex');
    return {
      ready: true,
      productId: candidate.productId,
      title: candidate.title,
      category: 'actress',
      parentPostText: content.post.text,
      parentCharacterCount: content.post.characterCount,
      mediaType: resolved.media.kind,
      selfReply: true,
      executionCount: 1,
      confirmationToken: token,
      warnings: [...new Set([...selectionWarnings, ...content.analysis.warnings, ...resolved.warnings])],
      errors: []
    };
  }
}

function failed(errors: string[], warnings: string[]): LiveOnePreflight {
  return { ready: false, selfReply: true, executionCount: 1, warnings: [...new Set(warnings)], errors };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && leftBuffer.equals(rightBuffer);
}
