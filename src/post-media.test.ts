import assert from 'node:assert/strict';
import { downloadPostMedia, normalizePostMedia, PostMediaResolver } from './post-media.js';

assert.equal(normalizePostMedia('https://pics.dmm.co.jp/image.jpg', 'image')?.kind, 'image');
assert.equal(normalizePostMedia('http://pics.dmm.co.jp/image.jpg', 'image'), undefined);
assert.equal(normalizePostMedia('https://example.test/image.jpg', 'image'), undefined);

const fetchMedia = async (url: string, init: RequestInit) => {
  const path = new URL(url).pathname;
  if (path === '/video') return new Response('', { status: 302, headers: { location: 'https://special.fanza.jp/landing' } });
  if (path === '/landing') return new Response(init.method === 'HEAD' ? null : '<html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (path === '/image') return new Response(init.method === 'HEAD' ? null : Buffer.from('image'), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '5' } });
  if (path === '/mp4') return new Response(init.method === 'HEAD' ? null : Buffer.from('video'), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '5' } });
  if (path === '/evil') return new Response('', { status: 302, headers: { location: 'https://example.test/file' } });
  return new Response(null, { status: 404 });
};

const fallback = await new PostMediaResolver(fetchMedia).resolve('https://www.dmm.co.jp/video', 'https://pics.dmm.co.jp/image');
assert.equal(fallback.media?.kind, 'image');
assert.deepEqual(fallback.warnings, ['sample_video_unavailable']);
const video = await new PostMediaResolver(fetchMedia).resolve('https://www.dmm.co.jp/mp4', 'https://pics.dmm.co.jp/image');
assert.equal(video.media?.kind, 'video');
const none = await new PostMediaResolver(fetchMedia).resolve('https://www.dmm.co.jp/evil');
assert.equal(none.media, undefined);
assert.ok(none.warnings.includes('media_unavailable'));

const downloaded = await downloadPostMedia({ url: 'https://pics.dmm.co.jp/image', kind: 'image' }, fetchMedia);
assert.equal(downloaded.mimeType, 'image/jpeg');
assert.equal(downloaded.data.toString(), 'image');
await assert.rejects(downloadPostMedia({ url: 'https://www.dmm.co.jp/landing', kind: 'video' }, fetchMedia), /media_response_invalid/);
await assert.rejects(downloadPostMedia({ url: 'https://www.dmm.co.jp/evil', kind: 'image' }, fetchMedia), /media_url_invalid/);

console.log('post media: ok');
