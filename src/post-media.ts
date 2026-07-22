export type PostMediaKind = 'video' | 'image';
export type PostMedia = { url: string; kind: PostMediaKind };
export type PostMediaResolution = { media?: PostMedia; warnings: string[] };
export type PostMediaResolverLike = { resolve(sampleVideoUrl?: string, thumbnailUrl?: string): Promise<PostMediaResolution> };
export type DownloadedPostMedia = { data: Buffer; mimeType: AllowedMediaMime; kind: PostMediaKind };

type AllowedMediaMime = 'video/mp4' | 'video/quicktime' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
type FetchMedia = (url: string, init: RequestInit) => Promise<Response>;

const maxBytes: Record<PostMediaKind, number> = { video: 50 * 1024 * 1024, image: 5 * 1024 * 1024 };
const mimeKinds: Record<AllowedMediaMime, PostMediaKind> = {
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image'
};

export class PostMediaResolver implements PostMediaResolverLike {
  constructor(private readonly fetchMedia: FetchMedia = fetch) {}

  async resolve(sampleVideoUrl?: string, thumbnailUrl?: string): Promise<PostMediaResolution> {
    const warnings: string[] = [];
    const candidates: Array<{ value?: string; kind: PostMediaKind; warning: string }> = [
      { value: sampleVideoUrl, kind: 'video', warning: 'sample_video_unavailable' },
      { value: thumbnailUrl, kind: 'image', warning: 'thumbnail_unavailable' }
    ];
    for (const candidate of candidates) {
      if (!candidate.value) { warnings.push(candidate.warning); continue; }
      const media = normalizePostMedia(candidate.value, candidate.kind);
      if (!media || !await probe(media, this.fetchMedia)) { warnings.push(candidate.warning); continue; }
      return { media, warnings };
    }
    return { warnings: [...warnings, 'media_unavailable'] };
  }
}

export function normalizePostMedia(value: string, kind: PostMediaKind): PostMedia | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && isAllowedMediaHost(url.hostname) ? { url: url.toString(), kind } : undefined;
  } catch { return undefined; }
}

export async function downloadPostMedia(media: PostMedia, fetchMedia: FetchMedia = fetch): Promise<DownloadedPostMedia> {
  const normalized = normalizePostMedia(media.url, media.kind);
  if (!normalized) throw new Error('media_url_invalid');
  const response = await follow(normalized.url, { method: 'GET' }, fetchMedia, 30_000);
  const mimeType = allowedMime(response.headers.get('content-type'));
  if (!response.ok || !mimeType || mimeKinds[mimeType] !== media.kind) throw new Error('media_response_invalid');
  validateLength(response.headers.get('content-length'), media.kind);
  if (!response.body) throw new Error('media_body_missing');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const value = await reader.read();
    if (value.done) break;
    total += value.value.byteLength;
    if (total > maxBytes[media.kind]) { await reader.cancel(); throw new Error('media_too_large'); }
    chunks.push(Buffer.from(value.value));
  }
  if (total === 0) throw new Error('media_body_missing');
  return { data: Buffer.concat(chunks), mimeType, kind: media.kind };
}

async function probe(media: PostMedia, fetchMedia: FetchMedia) {
  try {
    const response = await follow(media.url, { method: 'HEAD' }, fetchMedia, 8_000);
    const mimeType = allowedMime(response.headers.get('content-type'));
    if (!response.ok || !mimeType || mimeKinds[mimeType] !== media.kind) return false;
    validateLength(response.headers.get('content-length'), media.kind);
    return true;
  } catch { return false; }
}

async function follow(value: string, init: RequestInit, fetchMedia: FetchMedia, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let current = value;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      if (!normalizePostMedia(current, 'image')) throw new Error('media_url_invalid');
      const response = await fetchMedia(current, { ...init, redirect: 'manual', signal: controller.signal });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('media_redirect_invalid');
      current = new URL(location, current).toString();
    }
    throw new Error('media_redirect_invalid');
  } finally { clearTimeout(timer); }
}

function allowedMime(value: string | null): AllowedMediaMime | undefined {
  const normalized = value?.split(';', 1)[0].trim().toLowerCase();
  return normalized && normalized in mimeKinds ? normalized as AllowedMediaMime : undefined;
}

function validateLength(value: string | null, kind: PostMediaKind) {
  if (value === null) return;
  const length = Number(value);
  if (!Number.isInteger(length) || length < 1 || length > maxBytes[kind]) throw new Error('media_size_invalid');
}

function isAllowedMediaHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ['dmm.co.jp', 'dmm.com', 'fanza.com', 'fanza.jp'].some((domain) => host === domain || host.endsWith(`.${domain}`));
}
