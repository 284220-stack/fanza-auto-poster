import assert from 'node:assert/strict';
import { diagnoseXConnection } from './x-diagnostics.js';

const values = { X_APP_KEY: 'a', X_APP_SECRET: 'b', X_ACCESS_TOKEN: 'c', X_ACCESS_SECRET: 'd' };
const success = await diagnoseXConnection(values, async () => ({ id: 'account-1', username: 'operator' }));
assert.equal(success.authenticated, true);
assert.equal(success.accountReference?.length, 12);
assert.equal(success.writePermission, 'requires_live_post');
assert.equal(JSON.stringify(success).includes('operator'), false);
assert.equal(JSON.stringify(success).includes('account-1'), false);

const missing = await diagnoseXConnection({ ...values, X_ACCESS_SECRET: '' }, async () => { throw new Error('must not run'); });
assert.equal(missing.authenticated, false);
assert.deepEqual(missing.errors, ['x_credentials_incomplete']);

const failed = await diagnoseXConnection(values, async () => { throw new Error('secret response'); });
assert.deepEqual(failed.errors, ['x_authentication_failed']);
assert.equal(JSON.stringify(failed).includes('secret response'), false);

console.log('x diagnostics: ok');
