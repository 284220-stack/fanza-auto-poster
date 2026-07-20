import type { KillerMessageCandidate } from './killer-message-generation.js';
import type { ProductTitleAnalysis } from './product-title-analysis.js';

export type PostTemplateStyle = 'sale_first' | 'actress_first' | 'campaign_first' | 'balanced';
export type PostTemplateWarning = 'post_too_long' | 'no_post_facts' | 'no_post_generated';

export type PostTemplateInput = {
  titleAnalysis: ProductTitleAnalysis;
  killerMessage?: KillerMessageCandidate;
  actressNames?: string[];
  productTitle?: string;
  campaignName?: string;
  maxLength?: number;
  preferredStyle?: PostTemplateStyle;
};

export type GeneratedPost = {
  text: string;
  style: PostTemplateStyle;
  factsUsed: string[];
  hashtags: string[];
  warnings: PostTemplateWarning[];
  characterCount: number;
};

export type PostTemplateResult = {
  primary?: GeneratedPost;
  alternatives: GeneratedPost[];
  warnings: PostTemplateWarning[];
};

const DEFAULT_MAX_LENGTH = 240;

export function generatePostTemplates(input: PostTemplateInput): PostTemplateResult {
  const maxLength = input.maxLength ?? DEFAULT_MAX_LENGTH;
  const warnings: PostTemplateWarning[] = [];
  const actress = input.actressNames?.map((name) => name.trim()).find(Boolean);
  const campaign = input.campaignName ?? input.titleAnalysis.campaignName;
  const message = input.killerMessage?.text;
  const facts = input.titleAnalysis;
  const styles: PostTemplateStyle[] = ['sale_first', 'actress_first', 'campaign_first', 'balanced'];
  const posts = styles.map((style) => createPost(style, { message, actress, campaign, facts }, maxLength, warnings)).filter((post): post is GeneratedPost => post !== undefined);
  const unique = posts.filter((post, index) => posts.findIndex((other) => other.text === post.text) === index);
  if (!unique.length) {
    if (!message && !actress && !campaign && !facts.hasPointBack && !facts.discountPercent && !facts.isHalfPrice && !facts.saleSignals.includes('popular')) warnings.push('no_post_facts');
    warnings.push('no_post_generated');
  }
  const ordered = [...unique].sort((left, right) => (input.preferredStyle === left.style ? -1 : input.preferredStyle === right.style ? 1 : 0));
  return { primary: ordered[0], alternatives: ordered.slice(1, 4), warnings: [...new Set(warnings)] };
}

function createPost(style: PostTemplateStyle, context: { message?: string; actress?: string; campaign?: string; facts: ProductTitleAnalysis }, maxLength: number, warnings: PostTemplateWarning[]): GeneratedPost | undefined {
  const feature = featureLine(context);
  const offer = offerLine(context);
  const actressLine = context.actress ? `${context.actress}出演` : undefined;
  const hashtags = hashtagsFor(context.actress);
  const lines = style === 'actress_first'
    ? ['PR', actressLine, context.message, feature, offer, hashtags.join(' ') ]
    : style === 'campaign_first'
      ? ['PR', context.campaign ? `${context.campaign}対象作品` : context.message, actressLine, feature, offer, hashtags.join(' ')]
      : style === 'balanced'
        ? ['PR', context.message, feature, actressLine, offer, hashtags.join(' ')]
        : ['PR', context.message, offer, actressLine, feature, hashtags.join(' ')];
  const text = lines.filter((line): line is string => Boolean(line)).filter((line, index, all) => all.indexOf(line) === index).join('\n\n');
  if (!text || containsUrl(text) || lengthOf(text) > maxLength) {
    if (lengthOf(text) > maxLength) warnings.push('post_too_long');
    return undefined;
  }
  return { text, style, factsUsed: usedFacts(context), hashtags, warnings: [], characterCount: lengthOf(text) };
}

function featureLine(context: { actress?: string; campaign?: string; facts: ProductTitleAnalysis }) {
  if (context.facts.saleSignals.includes('popular')) return '注目作品をチェック';
  if (context.campaign) return 'キャンペーン対象作品';
  if (context.actress) return '出演作をチェック';
  if (context.facts.discountPercent !== undefined || context.facts.isHalfPrice || context.facts.hasPointBack) return 'お得な対象作品';
  return '注目作品をチェック';
}

function offerLine(context: { message?: string; campaign?: string; facts: ProductTitleAnalysis }) {
  const message = context.message ?? '';
  if (context.facts.isHalfPrice && !message.includes('半額')) return '半額対象をチェック';
  if (context.facts.discountPercent !== undefined && !message.includes(`${context.facts.discountPercent}%OFF`)) return `${context.facts.discountPercent}%OFF対象`;
  if (context.facts.hasPointBack && !/ポイント(?:還元|バック|増量)/u.test(message)) return 'ポイント還元対象';
  if (context.campaign && !message.includes(context.campaign)) return `${context.campaign}開催中`;
  return undefined;
}

function hashtagsFor(actress: string | undefined) {
  const tags = ['#FANZA'];
  if (actress && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]+$/u.test(actress)) tags.unshift(`#${actress}`);
  return tags.slice(0, 2);
}

function usedFacts(context: { message?: string; actress?: string; campaign?: string; facts: ProductTitleAnalysis }) {
  const facts = [...(context.message ? ['killer_message'] : [])];
  if (context.actress) facts.push('actress');
  if (context.campaign) facts.push('campaign');
  if (context.facts.discountPercent !== undefined || context.facts.isHalfPrice) facts.push('discount');
  if (context.facts.hasPointBack) facts.push('point_back');
  if (context.facts.saleSignals.includes('popular')) facts.push('popular');
  return facts;
}

function containsUrl(value: string) { return /https?:\/\//iu.test(value); }
function lengthOf(value: string) { return Array.from(value).length; }
