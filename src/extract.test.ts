import assert from 'node:assert/strict';
import { extractCandidates } from './extract.js';

const html = `
  <p>FANZA夏の同人祭 期間限定キャンペーン</p>
  <a href="https://affiliate.dmm.com/?lurl=https%3A%2F%2Fwww.dmm.co.jp%2Fcampaign">詳細はこちら</a>
  <p>話題の新作リリース情報</p>
  <a href="https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=example/">新着作品の詳細</a>
`;

const candidates = extractCandidates('週末のおすすめ情報', 'FANZA セール 新作', html);
assert.equal(candidates.length, 2);
assert.deepEqual(candidates.map((candidate) => candidate.type), ['sale', 'newRelease']);
assert.match(candidates[0].title, /期間限定キャンペーン/);
assert.match(candidates[1].title, /新作リリース情報/);
console.log('extractCandidates: ok');
