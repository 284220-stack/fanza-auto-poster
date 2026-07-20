import type { ProductTitleAnalysis, ProductTitleAnalysisWarning } from './product-title-analysis.js';

export type KillerMessageStyle = 'sale' | 'campaign' | 'point_back' | 'popular' | 'actress' | 'balanced';
export type KillerMessageWarning = ProductTitleAnalysisWarning | 'no_appeal_facts' | 'message_too_long' | 'campaign_name_too_long' | 'conflicting_discount' | 'no_candidate_generated' | 'actress_name_too_long';

export type KillerMessageInput = {
  analysis: ProductTitleAnalysis;
  actressNames?: string[];
  maxLength?: number;
  preferredStyle?: KillerMessageStyle;
};

export type KillerMessageCandidate = {
  text: string;
  style: KillerMessageStyle;
  priority: number;
  factsUsed: string[];
  warnings: KillerMessageWarning[];
};

export type KillerMessageResult = {
  primary?: KillerMessageCandidate;
  alternatives: KillerMessageCandidate[];
  warnings: KillerMessageWarning[];
};

const DEFAULT_MAX_LENGTH = 20;

export function generateKillerMessages(input: KillerMessageInput): KillerMessageResult {
  const maxLength = input.maxLength ?? DEFAULT_MAX_LENGTH;
  const warnings = inheritedWarnings(input.analysis.warnings);
  const candidates: KillerMessageCandidate[] = [];
  const pointLabel = pointBackLabel(input.analysis);
  const hasPopular = input.analysis.saleSignals.includes('popular');
  const hasDiscount = input.analysis.discountPercent !== undefined || input.analysis.isHalfPrice;

  if (input.analysis.warnings.includes('conflicting_discount_percentages')) warnings.push('conflicting_discount');

  if (input.analysis.isHalfPrice) {
    add(candidates, { text: '今だけ半額', style: 'sale', priority: 1, factsUsed: ['half_price'], warnings: [] }, maxLength, warnings);
  } else if (input.analysis.discountPercent !== undefined) {
    add(candidates, { text: `今だけ${input.analysis.discountPercent}%OFF`, style: 'sale', priority: 2, factsUsed: [`discount:${input.analysis.discountPercent}`], warnings: [] }, maxLength, warnings);
    add(candidates, { text: `${input.analysis.discountPercent}%OFF対象作品`, style: 'sale', priority: 2, factsUsed: [`discount:${input.analysis.discountPercent}`], warnings: [] }, maxLength, warnings);
  }

  if (input.analysis.campaignName) {
    if (lengthOf(input.analysis.campaignName) > maxLength) {
      warnings.push('campaign_name_too_long');
    } else {
      add(candidates, { text: `${input.analysis.campaignName}開催中`, style: 'campaign', priority: 3, factsUsed: ['campaign'], warnings: [] }, maxLength, warnings);
      add(candidates, { text: `${input.analysis.campaignName}対象作品`, style: 'campaign', priority: 3, factsUsed: ['campaign'], warnings: [] }, maxLength, warnings);
      if (input.analysis.isHalfPrice) add(candidates, { text: `半額＋${input.analysis.campaignName}`, style: 'balanced', priority: 0, factsUsed: ['half_price', 'campaign'], warnings: [] }, maxLength, warnings);
    }
  }

  if (input.analysis.hasPointBack) {
    add(candidates, { text: `${pointLabel}対象`, style: 'point_back', priority: 4, factsUsed: ['point_back'], warnings: [] }, maxLength, warnings);
    if (input.analysis.discountPercent !== undefined && !input.analysis.isHalfPrice) {
      add(candidates, { text: `${input.analysis.discountPercent}%OFF＋${pointLabel}`, style: 'balanced', priority: 0, factsUsed: [`discount:${input.analysis.discountPercent}`, 'point_back'], warnings: [] }, maxLength, warnings);
    }
  }

  if (hasPopular) add(candidates, { text: '売れ筋作品をチェック', style: 'popular', priority: 5, factsUsed: ['popular'], warnings: [] }, maxLength, warnings);
  addActressCandidate(candidates, input.actressNames, maxLength, warnings);

  if (!hasDiscount && !input.analysis.campaignName && !input.analysis.hasPointBack && !hasPopular && !(input.actressNames?.length)) warnings.push('no_appeal_facts');
  const unique = uniqueCandidates(candidates);
  const ordered = orderCandidates(unique, input.preferredStyle);
  if (!ordered.length) warnings.push('no_candidate_generated');
  return { primary: ordered[0], alternatives: ordered.slice(1, 4), warnings: uniqueWarnings(warnings) };
}

function addActressCandidate(candidates: KillerMessageCandidate[], actressNames: string[] | undefined, maxLength: number, warnings: KillerMessageWarning[]) {
  const actressName = actressNames?.map((name) => name.trim()).find(Boolean);
  if (!actressName) return;
  if (lengthOf(actressName) > maxLength) {
    warnings.push('actress_name_too_long');
    return;
  }
  add(candidates, { text: `${actressName}出演作をチェック`, style: 'actress', priority: 6, factsUsed: ['actress'], warnings: [] }, maxLength, warnings);
}

function add(candidates: KillerMessageCandidate[], candidate: KillerMessageCandidate, maxLength: number, warnings: KillerMessageWarning[]) {
  if (lengthOf(candidate.text) > maxLength) {
    warnings.push('message_too_long');
    return;
  }
  candidates.push(candidate);
}

function pointBackLabel(analysis: ProductTitleAnalysis) {
  const source = [analysis.originalTitle, ...analysis.campaignLabels].join(' ');
  if (source.includes('ポイントバック')) return 'ポイントバック';
  if (source.includes('ポイント増量')) return 'ポイント増量';
  return 'ポイント還元';
}

function inheritedWarnings(warnings: ProductTitleAnalysisWarning[]) {
  return [...warnings] as KillerMessageWarning[];
}

function uniqueCandidates(candidates: KillerMessageCandidate[]) {
  const texts = new Set<string>();
  return candidates.filter((candidate) => !texts.has(candidate.text) && texts.add(candidate.text));
}

function orderCandidates(candidates: KillerMessageCandidate[], preferredStyle: KillerMessageStyle | undefined) {
  return [...candidates].sort((left, right) => {
    const leftPriority = preferredStyle === left.style ? left.priority - 10 : left.priority;
    const rightPriority = preferredStyle === right.style ? right.priority - 10 : right.priority;
    return leftPriority - rightPriority;
  });
}

function uniqueWarnings(warnings: KillerMessageWarning[]) {
  return [...new Set(warnings)];
}

function lengthOf(value: string) {
  return Array.from(value).length;
}
