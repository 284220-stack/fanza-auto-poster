import assert from 'node:assert/strict';
import { generateKillerMessages, type KillerMessageInput } from './killer-message-generation.js';
import { analyzeProductTitle } from './product-title-analysis.js';

function generate(title: string, options: Omit<KillerMessageInput, 'analysis'> = {}) {
  return generateKillerMessages({ analysis: analyzeProductTitle(title), ...options });
}

assert.equal(generate('【30%OFF】架空作品').primary?.text, '今だけ30%OFF');
assert.equal(generate('【半額50%OFF】架空作品').primary?.text, '今だけ半額');
assert.equal(generate('【ポイント還元】架空作品').primary?.text, 'ポイント還元対象');
assert.equal(generate('【ポイントバック】架空作品').primary?.text, 'ポイントバック対象');
assert.equal(generate('【架空キャンペーン】架空作品').primary?.text, '架空キャンペーン開催中');
assert.equal(generate('売れ筋の架空作品').primary?.text, '売れ筋作品をチェック');
assert.equal(generate('架空作品', { actressNames: ['架空女優'] }).primary?.text, '架空女優出演作をチェック');
assert.equal(generate('架空作品', { actressNames: ['架空女優', '別の女優'] }).primary?.text, '架空女優出演作をチェック');
assert.equal(generate('【30%OFF】【ポイント還元】架空作品').primary?.text, '30%OFF＋ポイント還元');
assert.equal(generate('【半額春キャンペーン】架空作品').primary?.text, '半額＋春キャンペーン');
const limited = generate('【長い名称のキャンペーン開催中です】架空作品', { maxLength: 10 });
assert.ok(limited.warnings.includes('campaign_name_too_long'));
assert.ok(limited.warnings.includes('no_candidate_generated'));
const longActress = generate('架空作品', { actressNames: ['とてもとてもとても長い架空女優名'], maxLength: 10 });
assert.ok(longActress.warnings.includes('actress_name_too_long'));
assert.equal(longActress.primary, undefined);
const noFacts = generate('架空作品');
assert.equal(noFacts.primary, undefined);
assert.ok(noFacts.warnings.includes('no_appeal_facts'));
assert.ok(noFacts.warnings.includes('no_candidate_generated'));
const duplicates = generate('【30%OFF】【ポイント還元】架空作品');
assert.equal(new Set([duplicates.primary?.text, ...duplicates.alternatives.map((candidate) => candidate.text)]).size, 1 + duplicates.alternatives.length);
assert.equal(duplicates.primary?.priority, 0);
for (const candidate of [duplicates.primary, ...duplicates.alternatives]) {
  assert.doesNotMatch(candidate?.text ?? '', /最安|絶対|神作|ランキング1位|成人向けの具体描写/u);
}
console.log('killer message generation: ok');
