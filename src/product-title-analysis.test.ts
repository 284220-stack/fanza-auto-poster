import assert from 'node:assert/strict';
import { analyzeProductTitle } from './product-title-analysis.js';

for (const title of ['【春30%OFF】架空作品', '【春３０％OFF】架空作品', '【春30％オフ】架空作品', '【春30パーセントOFF】架空作品']) {
  assert.equal(analyzeProductTitle(title).discountPercent, 30);
}
assert.equal(analyzeProductTitle('【半額セール】架空作品').discountPercent, 50);
const halfAndPercent = analyzeProductTitle('【半額50%OFF】架空作品');
assert.equal(halfAndPercent.discountPercent, 50);
assert.deepEqual(halfAndPercent.warnings, []);
const conflicting = analyzeProductTitle('【30%OFF 50%OFF】架空作品');
assert.equal(conflicting.discountPercent, undefined);
assert.deepEqual(conflicting.warnings, ['conflicting_discount_percentages']);
for (const title of ['【ポイント還元】架空作品', '【ポイントバック】架空作品', '【ポイント増量】架空作品']) {
  const result = analyzeProductTitle(title);
  assert.equal(result.hasPointBack, true);
  assert.ok(result.saleSignals.includes('point_back'));
}
assert.equal(analyzeProductTitle('【夏セール第１弾】架空作品').campaignRound, 1);
assert.equal(analyzeProductTitle('【夏セール第１０弾】架空作品').campaignRound, 10);
const result = analyzeProductTitle('【売れ筋！ビデオ30％OFF第1弾】【ポイント還元】架空作品名（通常版）');
assert.deepEqual(result.campaignLabels, ['売れ筋！ビデオ30％OFF第1弾', 'ポイント還元']);
assert.equal(result.cleanTitle, '架空作品名（通常版）');
assert.equal(result.campaignName, '売れ筋！ビデオ');
assert.deepEqual(result.appealCandidates, ['30%OFF', '売れ筋！ビデオ', 'ポイント還元', '売れ筋', '第1弾']);
assert.deepEqual(analyzeProductTitle('架空作品（通常版）2').campaignLabels, []);
const empty = analyzeProductTitle('【ポイント還元】');
assert.equal(empty.cleanTitle, '');
assert.ok(empty.warnings.includes('empty_clean_title'));
const plain = analyzeProductTitle('架空作品');
assert.deepEqual(plain.appealCandidates, []);
console.log('product title analysis: ok');
