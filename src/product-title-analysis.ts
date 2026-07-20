export type SaleSignal = 'discount' | 'half_price' | 'point_back' | 'campaign' | 'popular' | 'limited' | 'new_release';
export type ProductTitleAnalysisWarning = 'conflicting_discount_percentages' | 'empty_clean_title';

export type ProductTitleAnalysis = {
  originalTitle: string;
  cleanTitle: string;
  campaignLabels: string[];
  campaignName?: string;
  discountPercent?: number;
  isHalfPrice: boolean;
  hasPointBack: boolean;
  campaignRound?: number;
  saleSignals: SaleSignal[];
  appealCandidates: string[];
  warnings: ProductTitleAnalysisWarning[];
};

export function analyzeProductTitle(title: string): ProductTitleAnalysis {
  const originalTitle = title;
  const { campaignLabels, cleanTitle } = extractLeadingCampaignLabels(title);
  const normalizedTitle = normalizeTitleText(title);
  const discountPercents = extractDiscountPercents(normalizedTitle);
  const isHalfPrice = normalizedTitle.includes('半額');
  if (isHalfPrice) discountPercents.add(50);

  const warnings: ProductTitleAnalysisWarning[] = [];
  const discountPercent = discountPercents.size === 1 ? [...discountPercents][0] : undefined;
  if (discountPercents.size > 1) warnings.push('conflicting_discount_percentages');
  if (!cleanTitle) warnings.push('empty_clean_title');

  const hasPointBack = /ポイント(?:還元|バック|増量)/u.test(normalizedTitle);
  const campaignRound = extractCampaignRound(normalizedTitle);
  const campaignName = extractCampaignName(campaignLabels[0]);
  const saleSignals = extractSaleSignals({ campaignLabels, normalizedTitle, discountPercents, isHalfPrice, hasPointBack });
  const appealCandidates = createAppealCandidates({ discountPercents, isHalfPrice, campaignName, hasPointBack, normalizedTitle, campaignRound });

  return { originalTitle, cleanTitle, campaignLabels, campaignName, discountPercent, isHalfPrice, hasPointBack, campaignRound, saleSignals, appealCandidates, warnings };
}

function extractLeadingCampaignLabels(title: string) {
  const campaignLabels: string[] = [];
  let remaining = title.trimStart();
  while (remaining.startsWith('【')) {
    const closingIndex = remaining.indexOf('】');
    if (closingIndex < 0) break;
    const label = remaining.slice(1, closingIndex).trim();
    if (label) campaignLabels.push(label);
    remaining = remaining.slice(closingIndex + 1).trimStart();
  }
  return { campaignLabels, cleanTitle: remaining.trim() };
}

function normalizeTitleText(value: string) {
  return value
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .replaceAll('％', '%')
    .replaceAll('Ｏ', 'O').replaceAll('Ｆ', 'F').replaceAll('オフ', 'オフ');
}

function extractDiscountPercents(title: string) {
  const percents = new Set<number>();
  for (const match of title.matchAll(/(\d+)\s*(?:%|パーセント)\s*(?:OFF|オフ)/giu)) {
    const percent = Number(match[1]);
    if (Number.isInteger(percent) && percent >= 0 && percent <= 100) percents.add(percent);
  }
  return percents;
}

function extractCampaignRound(title: string) {
  const match = /第\s*(\d+)\s*弾/u.exec(title);
  return match ? Number(match[1]) : undefined;
}

function extractCampaignName(label: string | undefined) {
  if (!label) return undefined;
  const withoutFacts = normalizeTitleText(label)
    .replace(/\d+\s*(?:%|パーセント)\s*(?:OFF|オフ)/giu, '')
    .replace(/半額/gu, '')
    .replace(/ポイント(?:還元|バック|増量)/gu, '')
    .replace(/第\s*\d+\s*弾/gu, '')
    .trim();
  return withoutFacts || undefined;
}

function extractSaleSignals(input: { campaignLabels: string[]; normalizedTitle: string; discountPercents: Set<number>; isHalfPrice: boolean; hasPointBack: boolean }) {
  const signals: SaleSignal[] = [];
  if (input.discountPercents.size > 0) signals.push('discount');
  if (input.isHalfPrice) signals.push('half_price');
  if (input.hasPointBack) signals.push('point_back');
  if (input.campaignLabels.length > 0) signals.push('campaign');
  if (/売れ筋|人気/u.test(input.normalizedTitle)) signals.push('popular');
  if (/限定/u.test(input.normalizedTitle)) signals.push('limited');
  if (/新作/u.test(input.normalizedTitle)) signals.push('new_release');
  return signals;
}

function createAppealCandidates(input: { discountPercents: Set<number>; isHalfPrice: boolean; campaignName?: string; hasPointBack: boolean; normalizedTitle: string; campaignRound?: number }) {
  const candidates: string[] = [];
  const sortedPercents = [...input.discountPercents].sort((left, right) => right - left);
  if (input.isHalfPrice) candidates.push('半額');
  for (const percent of sortedPercents) {
    if (input.isHalfPrice && percent === 50) continue;
    candidates.push(`${percent}%OFF`);
  }
  if (input.campaignName) candidates.push(input.campaignName);
  if (input.hasPointBack) candidates.push('ポイント還元');
  if (/売れ筋|人気/u.test(input.normalizedTitle)) candidates.push(/売れ筋/u.test(input.normalizedTitle) ? '売れ筋' : '人気');
  if (input.campaignRound !== undefined) candidates.push(`第${input.campaignRound}弾`);
  return candidates;
}
