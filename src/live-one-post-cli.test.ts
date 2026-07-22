import assert from 'node:assert/strict';
import { canExecuteLiveOne, parseLiveOneArguments } from './live-one-post-cli.js';

assert.deepEqual(parseLiveOneArguments([]), { execute: false, confirmed: false, confirmationToken: undefined });
assert.deepEqual(parseLiveOneArguments(['--execute', '--confirm-one-post', '--token=abc']), { execute: true, confirmed: true, confirmationToken: 'abc' });
assert.equal(canExecuteLiveOne(parseLiveOneArguments(['--execute', '--confirm-one-post', '--token', 'abc']), { DRY_RUN: 'false' }), true);
assert.equal(canExecuteLiveOne(parseLiveOneArguments(['--execute', '--confirm-one-post', '--token=abc']), { DRY_RUN: 'true' }), false);
assert.equal(canExecuteLiveOne(parseLiveOneArguments(['--execute', '--token=abc']), { DRY_RUN: 'false' }), false);

console.log('live one post cli: ok');
