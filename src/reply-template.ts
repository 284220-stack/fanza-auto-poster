export type ReplyTemplateInput = { affiliateUrl?: string; productTitle?: string; campaignLabel?: string; maxLength?: number };
export type GeneratedReply = { text: string; affiliateUrl: string; warnings: string[]; characterCount: number };
export type ReplyTemplateResult = { reply?: GeneratedReply; warnings: string[] };

export function generateReplyTemplate(input: ReplyTemplateInput): ReplyTemplateResult {
  const url = input.affiliateUrl?.trim();
  if (!url) return { warnings: ['affiliate_url_required'] };
  if (!isHttpUrl(url)) return { warnings: ['invalid_affiliate_url'] };
  const text = `${input.campaignLabel ? '詳細はこちら' : '作品はこちら'}\n${url}`;
  const maxLength = input.maxLength ?? 280;
  if (Array.from(text).length > maxLength) return { warnings: ['reply_too_long'] };
  return { reply: { text, affiliateUrl: url, warnings: [], characterCount: Array.from(text).length }, warnings: [] };
}

function isHttpUrl(value: string) { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
