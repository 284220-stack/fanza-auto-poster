import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { TwitterApi } from 'twitter-api-v2';
import { loadState, todayKey } from './state.js';
import { fetchOfficialSaleCandidates, isOfficialSaleUrl } from './official.js';
import { startWorker } from './worker.js';
import { ActressRepository, ActressService, type Queryable } from './actresses.js';
import { handleActressApiRequest } from './actress-api.js';
import { getDatabasePool } from './db/pool.js';
import { handleSaleSyncApiRequest } from './sale-sync-api.js';
import { getSaleSyncExecutionService } from './sale-sync-execution.js';
import { PostHistoryRepository } from './post-history.js';
import { PostEligibilityService } from './post-eligibility.js';
import { ReplyRetryService } from './reply-retry.js';
import { ThreadPostPersistenceService } from './thread-post-persistence.js';
import { PostExecutionOrchestrator } from './post-execution-orchestrator.js';
import { handlePostExecutionApiRequest } from './post-execution-api.js';
import { createXApiPostClient } from './x-api-adapter.js';
import type { XPostClient } from './thread-post-execution.js';
import { DatabasePostCandidateRepository, PostCandidateSelectionService } from './post-candidate-selection.js';
import { PostCandidatePreviewService } from './post-candidate-preview.js';

const publicDir = new URL('../public/', import.meta.url).pathname;
const dataDir = process.env.APP_DATA_DIR ?? new URL('../data/', import.meta.url).pathname;
const envPath = join(dataDir, 'settings.env');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const secretKeys = new Set(['YAHOO_IMAP_PASSWORD', 'X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']);
const editableKeys = ['YAHOO_IMAP_USER', 'YAHOO_IMAP_PASSWORD', 'X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'POLL_MINUTES', 'DAILY_SALE_LIMIT', 'DAILY_NEW_RELEASE_LIMIT', 'DISCLOSURE', 'DRY_RUN', 'OFFICIAL_SALE_MONITOR_ENABLED', 'OFFICIAL_SALE_URLS'];

async function readEnv() {
  try {
    const text = await readFile(envPath, 'utf8');
    return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter((match): match is RegExpMatchArray => Boolean(match)).map((match) => [match[1], match[2]]));
  } catch { return {}; }
}

function settingSummary(values: Record<string, string>) {
  return {
    yahooUser: values.YAHOO_IMAP_USER ?? '',
    pollMinutes: Number(values.POLL_MINUTES ?? 10),
    saleLimit: Number(values.DAILY_SALE_LIMIT ?? 3),
    newReleaseLimit: Number(values.DAILY_NEW_RELEASE_LIMIT ?? 3),
    disclosure: values.DISCLOSURE ?? '#PR',
    dryRun: (values.DRY_RUN ?? 'true').toLowerCase() !== 'false',
    officialSaleMonitor: {
      enabled: (values.OFFICIAL_SALE_MONITOR_ENABLED ?? 'false').toLowerCase() === 'true',
      urls: values.OFFICIAL_SALE_URLS ?? ''
    },
    configured: Object.fromEntries([...secretKeys, 'YAHOO_IMAP_USER'].map((key) => [key, Boolean(values[key])]))
  };
}

async function readJson(request: IncomingMessage) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new Error('Request is too large.');
  }
  return JSON.parse(body || '{}') as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function saveSettings(input: Record<string, unknown>) {
  const values = await readEnv();
  for (const key of editableKeys) {
    const incoming = input[key];
    if (typeof incoming !== 'string' && typeof incoming !== 'number' && typeof incoming !== 'boolean') continue;
    const normalized = String(incoming).trim();
    if (secretKeys.has(key) && !normalized) continue;
    values[key] = normalized;
  }
  values.ALLOWED_SENDERS ??= 'mail.dmm.com';
  values.TARGET_KEYWORDS ??= 'FANZA,DMM,セール,新作,新製品,新着';
  values.YAHOO_IMAP_HOST ??= 'imap.mail.yahoo.co.jp';
  values.YAHOO_IMAP_PORT ??= '993';
  if ((values.OFFICIAL_SALE_MONITOR_ENABLED ?? 'false').toLowerCase() === 'true') {
    const urls = (values.OFFICIAL_SALE_URLS ?? '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    const invalid = urls.filter((url) => !isOfficialSaleUrl(url));
    if (invalid.length) throw new Error(`公式DMM/FANZAドメイン以外のURLは保存できません: ${invalid.join(', ')}`);
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(envPath, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
  return settingSummary(values);
}

function requireValues(values: Record<string, string>, keys: string[]) {
  const missing = keys.filter((key) => !values[key]);
  if (missing.length) throw new Error(`未入力の項目があります: ${missing.join(', ')}`);
}

async function testYahoo(values: Record<string, string>) {
  requireValues(values, ['YAHOO_IMAP_USER', 'YAHOO_IMAP_PASSWORD']);
  const client = new ImapFlow({ host: values.YAHOO_IMAP_HOST || 'imap.mail.yahoo.co.jp', port: Number(values.YAHOO_IMAP_PORT || 993), secure: true, auth: { user: values.YAHOO_IMAP_USER, pass: values.YAHOO_IMAP_PASSWORD }, logger: false });
  try { await client.connect(); } finally { await client.logout().catch(() => undefined); }
}

async function testX(values: Record<string, string>) {
  requireValues(values, ['X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']);
  const client = new TwitterApi({ appKey: values.X_APP_KEY, appSecret: values.X_APP_SECRET, accessToken: values.X_ACCESS_TOKEN, accessSecret: values.X_ACCESS_SECRET });
  await client.v2.me();
}

async function testOfficialSalePages(values: Record<string, string>) {
  const urls = (values.OFFICIAL_SALE_URLS ?? '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  if (!urls.length) throw new Error('公式セールページURLを入力してください。');
  const candidates = await fetchOfficialSaleCandidates(urls);
  return candidates.length;
}

function isAuthorized(request: IncomingMessage) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return true;
  const authorization = request.headers.authorization ?? '';
  if (!authorization.startsWith('Basic ')) return false;
  const password = Buffer.from(authorization.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  const received = Buffer.from(password);
  const target = Buffer.from(expected);
  return received.length === target.length && timingSafeEqual(received, target);
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  try {
    if (!isAuthorized(request)) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="FANZA Auto Poster"' });
      response.end('Authentication required');
      return;
    }
    if (url.pathname.startsWith('/api/actresses')) {
      let body: Record<string, unknown> = {};
      if (request.method === 'POST' || request.method === 'PATCH') {
        try {
          body = await readJson(request);
        } catch {
          sendJson(response, 400, { message: 'リクエスト本文が不正です。' });
          return;
        }
      }
      const result = await handleActressApiRequest(
        request.method,
        url.pathname,
        url.searchParams,
        body,
        () => new ActressService(new ActressRepository(getDatabasePool() as unknown as Queryable))
      );
      if (result) {
        sendJson(response, result.status, result.body);
        return;
      }
    }
    if (url.pathname === '/api/sync/sales') {
      const result = await handleSaleSyncApiRequest(request.method, getSaleSyncExecutionService());
      sendJson(response, result.status, result.body);
      return;
    }
    if (url.pathname === '/api/posts/execute') {
      let body: Record<string, unknown>;
      try { body = await readJson(request); } catch { sendJson(response, 400, { message: 'リクエスト本文が不正です。' }); return; }
      const dryRun = body.dryRun ?? (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
      const client: XPostClient = dryRun
        ? { createPost: async () => { throw new Error('dry run'); }, createReply: async () => { throw new Error('dry run'); } }
        : createXApiPostClient();
      const result = await handlePostExecutionApiRequest(request.method, body, () => {
        const history = new PostHistoryRepository(getDatabasePool() as unknown as Queryable);
        return new PostExecutionOrchestrator(new PostEligibilityService(history), new ReplyRetryService(history), new ThreadPostPersistenceService(history));
      }, client);
      sendJson(response, result.status, result.body);
      return;
    }
    if (url.pathname === '/api/posts/preview') {
      if (request.method !== 'POST') { sendJson(response, 400, { message: 'POST メソッドで実行してください。' }); return; }
      const history = new PostHistoryRepository(getDatabasePool() as unknown as Queryable);
      const orchestrator = new PostExecutionOrchestrator(new PostEligibilityService(history), new ReplyRetryService(history), new ThreadPostPersistenceService(history));
      const client: XPostClient = { createPost: async () => { throw new Error('dry run'); }, createReply: async () => { throw new Error('dry run'); } };
      const preview = await new PostCandidatePreviewService(() => new PostCandidateSelectionService(new DatabasePostCandidateRepository(getDatabasePool() as unknown as { query<T>(sql: string): Promise<{ rows: T[] }> })).select(), orchestrator).preview({ client });
      sendJson(response, 200, preview);
      return;
    }
    if (url.pathname === '/api/status') {
      const state = await loadState();
      const daily = state.daily[todayKey()] ?? { sale: 0, newRelease: 0 };
      const settings = settingSummary(await readEnv());
      sendJson(response, 200, { ...settings, limits: { sale: settings.saleLimit, newRelease: settings.newReleaseLimit }, daily, history: [...state.history].reverse() });
      return;
    }
    if (url.pathname === '/api/settings' && request.method === 'POST') {
      sendJson(response, 200, await saveSettings(await readJson(request)));
      return;
    }
    if (url.pathname === '/api/test/yahoo' && request.method === 'POST') {
      await testYahoo(await readEnv());
      sendJson(response, 200, { message: 'Yahoo!メールに接続できました。' });
      return;
    }
    if (url.pathname === '/api/test/x' && request.method === 'POST') {
      await testX(await readEnv());
      sendJson(response, 200, { message: 'Xアカウントに接続できました。' });
      return;
    }
    if (url.pathname === '/api/test/official-sales' && request.method === 'POST') {
      const count = await testOfficialSalePages(await readEnv());
      sendJson(response, 200, { message: `公式セールページに接続できました。候補 ${count} 件を検出しました。` });
      return;
    }
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (requested.includes('..')) { response.writeHead(403).end(); return; }
    const file = join(publicDir, requested);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error ? error.message : '操作に失敗しました。' });
  }
}).listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Dashboard: listening on ${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 3000}`);
  startWorker();
});
