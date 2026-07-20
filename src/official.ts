import { type Candidate } from './extract.js';

const officialHostPattern = /(^|\.)(?:dmm\.co\.jp|dmm\.com|fanza\.co\.jp|fanza\.com)$/i;
const excludedHostPattern = /(^|\.)affiliate\.dmm\.com$/i;
const saleWords = /セール|割引|OFF|%OFF|値下げ|キャンペーン|期間限定|無料|還元|ポイント/i;
const ignoredSchemes = /^(?:mailto|tel|javascript):/i;

type Anchor = { href: string; label: string; index: number };

export function isOfficialSaleUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && officialHostPattern.test(url.hostname) && !excludedHostPattern.test(url.hostname);
  } catch { return false; }
}

export function normalizeOfficialUrl(rawUrl: string, baseUrl: string) {
  if (ignoredSchemes.test(rawUrl)) return null;
  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = '';
    return isOfficialSaleUrl(url.toString()) ? url.toString() : null;
  } catch { return null; }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function clean(value: string) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function anchorsFromHtml(html: string, baseUrl: string): Anchor[] {
  const anchors: Anchor[] = [];
  const pattern = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = normalizeOfficialUrl(decodeHtml(match[1]).trim(), baseUrl);
    if (!href) continue;
    anchors.push({ href, label: clean(match[2]), index: match.index ?? 0 });
  }
  return anchors;
}

function titleNear(html: string, anchor: Anchor) {
  const before = html.slice(Math.max(0, anchor.index - 1200), anchor.index);
  const lines = before
    .replace(/<(?:p|div|h[1-6]|li|dt|dd|span)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|dt|dd|span|br)\s*>/gi, '\n')
    .split(/\n+/)
    .map(clean)
    .filter((line) => line.length >= 4 && line.length <= 120);
  return ([...lines].reverse().find((line) => saleWords.test(line)) ?? anchor.label) || 'FANZA/DMM公式セール情報';
}

export function extractOfficialSaleCandidates(pageUrl: string, html: string): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const anchor of anchorsFromHtml(html, pageUrl)) {
    const context = clean(html.slice(Math.max(0, anchor.index - 1200), anchor.index + 500));
    const title = titleNear(html, anchor);
    if (!saleWords.test(`${title}\n${anchor.label}\n${context}`) || seen.has(anchor.href)) continue;
    candidates.push({ type: 'sale', title, url: anchor.href, text: context });
    seen.add(anchor.href);
  }
  return candidates;
}

export async function fetchOfficialSaleCandidates(urls: string[]) {
  const all: Candidate[] = [];
  for (const url of urls) {
    if (!isOfficialSaleUrl(url)) throw new Error(`公式DMM/FANZAドメイン以外は監視できません: ${url}`);
    const response = await fetch(url, { headers: { 'User-Agent': 'FANZA-Auto-Poster/0.1 (+official-sale-monitor)' } });
    if (!response.ok) throw new Error(`公式セールページを取得できませんでした (${response.status}): ${url}`);
    const html = await response.text();
    all.push(...extractOfficialSaleCandidates(url, html));
  }
  return all;
}
