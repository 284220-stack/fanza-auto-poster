import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createDashboardServer } from './dashboard.js';

process.env.DASHBOARD_PASSWORD = 'test-password';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

async function request(port: number, path: string, authorization?: string) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    headers: authorization ? { authorization } : undefined
  });
}

const server = createDashboardServer();
const port = await listen(server);
const credentials = `Basic ${Buffer.from('operator:test-password').toString('base64')}`;

try {
  const unauthorized = await request(port, '/');
  assert.equal(unauthorized.status, 401);
  assert.equal(await unauthorized.text(), 'Authentication required');

  const dashboard = await request(port, '/', credentials);
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /FANZA/i);

  const css = await request(port, '/styles.css', credentials);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type') ?? '', /^text\/css/);

  const script = await request(port, '/app.js', credentials);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') ?? '', /^application\/javascript/);

  const missing = await request(port, '/does-not-exist', credentials);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not_found' });

  const api = await request(port, '/api/status', credentials);
  assert.equal(api.status, 200);

  const invalidPreview = await request(port, '/api/posts/preview', credentials);
  assert.equal(invalidPreview.status, 400);

  const liveDashboardAttempt = await fetch(`http://127.0.0.1:${port}/api/posts/execute`, {
    method: 'POST', headers: { authorization: credentials, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 1, parentPostText: 'PR', dryRun: false })
  });
  assert.equal(liveDashboardAttempt.status, 409);

  const invalidFavoriteSync = await fetch(`http://127.0.0.1:${port}/api/favorites/sync`, {
    method: 'POST',
    headers: { authorization: credentials, 'content-type': 'application/json' },
    body: '{'
  });
  assert.equal(invalidFavoriteSync.status, 400);
  assert.deepEqual(await invalidFavoriteSync.json(), { message: 'リクエスト本文が不正です。' });

  const invalidSaleSync = await fetch(`http://127.0.0.1:${port}/api/sales/manual-sync`, {
    method: 'POST',
    headers: { authorization: credentials, 'content-type': 'application/json' },
    body: '{'
  });
  assert.equal(invalidSaleSync.status, 400);
  assert.deepEqual(await invalidSaleSync.json(), { message: 'リクエスト本文が不正です。' });

  const legacySaleSync = await fetch(`http://127.0.0.1:${port}/api/sync/sales`, {
    method: 'POST', headers: { authorization: credentials }
  });
  assert.equal(legacySaleSync.status, 409);

  const unknownApi = await request(port, '/api/not-found', credentials);
  assert.equal(unknownApi.status, 404);

  const alive = await request(port, '/', credentials);
  assert.equal(alive.status, 200);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.DASHBOARD_PASSWORD;
}

console.log('dashboard: ok');
