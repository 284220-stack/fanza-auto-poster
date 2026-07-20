import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { splitActressAliases } = await import(new URL('../public/actress-ui-utils.js', import.meta.url).href);
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

for (const route of ['dashboard', 'products', 'actresses', 'post-plan', 'post-history', 'operations', 'settings']) assert.match(html, new RegExp(`data-route="${route}"`));
assert.match(html, /id="sidebar"/); assert.match(html, /id="content"/);
assert.doesNotMatch(html, /id="settingsForm"|id="actressForm"|id="activity"/);
for (const endpoint of ['/api/actresses', '/api/post-history', '/api/posts/preview', '/api/products']) assert.ok(script.includes(endpoint));
assert.deepEqual(splitActressAliases(' 別名A,別名B\n別名A\n '), ['別名A', '別名B']);
assert.match(script, /replaceChildren\(\)/); assert.match(script, /textContent=/); assert.doesNotMatch(script, /innerHTML/);
assert.match(script, /hashchange/); assert.match(script, /confirm\(/);
console.log('actress-ui: ok');
