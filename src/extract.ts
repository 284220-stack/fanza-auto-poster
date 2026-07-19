export type CampaignType = 'sale' | 'newRelease';
export type Candidate = { type: CampaignType; title: string; url: string; text: string };

type Anchor = { href: string; label: string; index: number };

const urlPattern = /https?:\/\/[^\s<>()]+/g;
const campaignWords = /セール|割引|OFF|%OFF|値下げ|キャンペーン|期間限定/i;
const newReleaseWords = /新作|新製品|新着|リリース/i;

function clean(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
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

function anchorsFromHtml(html: string): Anchor[] {
  const anchors: Anchor[] = [];
  const pattern = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = decodeHtml(match[1]).trim();
    if (!/^https?:\/\//i.test(href)) continue;
    anchors.push({ href, label: clean(match[2]), index: match.index ?? 0 });
  }
  return anchors;
}

function titleBeforeLink(html: string, anchorIndex: number, subject: string) {
  const fragment = html.slice(Math.max(0, anchorIndex - 2400), anchorIndex)
    .replace(/<(?:p|div|h[1-6]|li|tr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|br)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const lines = fragment.split(/\n+/).map(clean).filter((line) => line.length >= 6 && line.length <= 130);
  const ignored = /^(詳細はこちら|おすすめポイント|関連キャンペーン|アフィリエイトオーナー|FANZA(?:同人|動画|ブックス|TV)?|DMM(?:アフィリエイト)?)$/i;
  const title = [...lines].reverse().find((line) => !ignored.test(line) && !/^https?:/i.test(line));
  return title || clean(subject) || '注目の情報';
}

function typeFrom(text: string): CampaignType | null {
  if (campaignWords.test(text)) return 'sale';
  if (newReleaseWords.test(text)) return 'newRelease';
  return null;
}

function isEligibleUrl(url: string) {
  return /(?:dmm|fanza)\.co\.jp|affiliate\.dmm\.com/i.test(url);
}

/** Extract each "Details" campaign link rather than treating a whole newsletter as one post. */
export function extractCandidates(subject: string, body: string, html?: string): Candidate[] {
  const source = `${subject}\n${body}`;
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const anchor of anchorsFromHtml(html ?? '')) {
    const context = html?.slice(Math.max(0, anchor.index - 2600), anchor.index + 700) ?? source;
    const title = titleBeforeLink(html ?? body, anchor.index, subject);
    const type = typeFrom(`${title}\n${anchor.label}`) ?? typeFrom(clean(context));
    const isDetailsLink = /詳細|キャンペーン|新着|新作/i.test(anchor.label);
    if (!isDetailsLink || !type || !isEligibleUrl(anchor.href) || seen.has(anchor.href)) continue;
    candidates.push({ type, title, url: anchor.href, text: clean(context) });
    seen.add(anchor.href);
  }

  if (candidates.length) return candidates;

  // Plain-text fallback for newsletters that expose their links directly.
  for (const url of source.match(urlPattern) ?? []) {
    if (!isEligibleUrl(url) || seen.has(url)) continue;
    const type = typeFrom(source);
    if (!type) continue;
    candidates.push({ type, title: clean(subject) || '注目の情報', url, text: source });
    seen.add(url);
  }
  return candidates;
}

export function buildPost(candidate: Candidate, disclosure: string) {
  const heading = candidate.type === 'sale' ? '期間限定のセール情報' : '注目の新着作品';
  const safeTitle = candidate.title.replace(/https?:\/\/\S+/g, '').slice(0, 92);
  const body = `${heading}\n${safeTitle}\n詳細はこちら\n${candidate.url}\n${disclosure}`;
  return body.length <= 280 ? body : `${heading}\n${safeTitle.slice(0, 280 - heading.length - candidate.url.length - disclosure.length - 16)}…\n${candidate.url}\n${disclosure}`;
}
