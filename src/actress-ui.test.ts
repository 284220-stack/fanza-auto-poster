import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { splitActressAliases } = await import(new URL('../public/actress-ui-utils.js', import.meta.url).href);

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

for (const id of ['actresses', 'actressForm', 'actressName', 'actressAliases', 'actressList', 'actressSearch', 'actressEnabledFilter', 'actressMessage']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
for (const endpoint of ['/api/actresses', '/enabled']) assert.ok(script.includes(endpoint));
assert.deepEqual(splitActressAliases(' 別名A,別名B\n別名A\n '), ['別名A', '別名B']);
assert.match(script, /replaceChildren\(\)/);
assert.match(script, /textContent =/);
assert.doesNotMatch(script.slice(script.indexOf('let actressBusy')), /innerHTML/);
assert.match(script, /actressBusy/);
assert.match(script, /window\.confirm/);
assert.match(html, /id="settingsForm"/);
console.log('actress-ui: ok');
