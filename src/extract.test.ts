import assert from 'node:assert/strict';
import { extractCandidates } from './extract.js';
import { extractOfficialSaleCandidates, isOfficialSaleUrl, normalizeOfficialUrl } from './official.js';

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


const officialHtml = `
  <h2>夏のFANZAセール 50%OFFキャンペーン</h2>
  <a href="/campaign/sale/">キャンペーン詳細</a>
  <a href="https://example.com/campaign">外部セール</a>
  <a href="http://www.dmm.co.jp/not-secure">非HTTPS</a>
`;
const officialCandidates = extractOfficialSaleCandidates('https://www.fanza.co.jp/top/', officialHtml);
assert.equal(officialCandidates.length, 1);
assert.equal(officialCandidates[0].url, 'https://www.fanza.co.jp/campaign/sale/');
assert.equal(isOfficialSaleUrl('https://www.dmm.co.jp/campaign'), true);
assert.equal(isOfficialSaleUrl('https://affiliate.dmm.com/campaign'), false);
assert.equal(normalizeOfficialUrl('/campaign', 'https://www.dmm.co.jp/top'), 'https://www.dmm.co.jp/campaign');
console.log('official sale extraction: ok');
