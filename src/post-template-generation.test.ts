import assert from 'node:assert/strict';
import { generateKillerMessages } from './killer-message-generation.js';
import { generatePostTemplates } from './post-template-generation.js';
import { analyzeProductTitle } from './product-title-analysis.js';

function generate(title: string, actressNames?: string[], maxLength?: number) {
  const titleAnalysis = analyzeProductTitle(title);
  const killerMessage = generateKillerMessages({ analysis: titleAnalysis, actressNames }).primary;
  return generatePostTemplates({ titleAnalysis, killerMessage, actressNames, productTitle: title, maxLength });
}

const sale = generate('【30%OFF】【ポイント還元】架空作品', ['架空女優']);
assert.match(sale.primary?.text ?? '', /^【PR】/m);
assert.match(sale.primary?.text ?? '', /架空作品/);
assert.match(sale.primary?.text ?? '', /30%OFF|ポイント還元/);
assert.match(sale.primary?.text ?? '', /架空女優出演/);
assert.ok(!/https?:\/\//.test(sale.primary?.text ?? ''));
assert.ok((sale.primary?.hashtags.length ?? 0) <= 2);
assert.ok((sale.primary?.characterCount ?? 999) <= 240);
assert.match(sale.primary?.text ?? '', /出演作をチェック|お得な対象作品|注目作品をチェック/);
const campaign = generate('【架空キャンペーン】架空作品');
assert.match(campaign.primary?.text ?? '', /架空キャンペーン/);
const noActress = generate('【半額】架空作品');
assert.ok(noActress.primary);
const noMessage = generatePostTemplates({ titleAnalysis: analyzeProductTitle('【ポイント還元】架空作品') });
assert.ok(noMessage.primary?.text.includes('ポイント還元対象'));
const short = generate('【30%OFF】架空作品', ['架空女優'], 5);
assert.equal(short.primary, undefined);
assert.ok(short.warnings.includes('post_too_long'));
for (const post of [sale.primary, ...sale.alternatives]) assert.doesNotMatch(post?.text ?? '', /最安|絶対|神作|ランキング1位|露骨/u);
const longTitle = generatePostTemplates({ titleAnalysis: analyzeProductTitle('一般作品'), productTitle: '長'.repeat(120), actressNames: ['架空女優'] });
assert.match(longTitle.primary?.text ?? '', /長{79}…/u);
console.log('post template generation: ok');
