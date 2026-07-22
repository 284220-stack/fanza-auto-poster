import { analyzeProductTitle } from './product-title-analysis.js';
import { generateKillerMessages } from './killer-message-generation.js';
import { generatePostTemplates } from './post-template-generation.js';
import type { PostCandidate } from './post-candidate-selection.js';

export function composePostCandidate(candidate: PostCandidate, preferredStyle?: 'sale_first' | 'actress_first' | 'campaign_first' | 'balanced') {
  const analysis = analyzeProductTitle(candidate.title);
  const killer = generateKillerMessages({ analysis, actressNames: candidate.actressNames }).primary;
  const post = generatePostTemplates({
    titleAnalysis: analysis,
    killerMessage: killer,
    actressNames: candidate.actressNames,
    productTitle: candidate.title,
    campaignName: candidate.campaignName,
    preferredStyle: preferredStyle ?? (candidate.category === 'actress' ? 'actress_first' : candidate.category === 'sale' ? 'sale_first' : 'balanced')
  }).primary;
  return { analysis, killer, post };
}
