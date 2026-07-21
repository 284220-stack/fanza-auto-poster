import assert from 'node:assert/strict';
import { parseOptionalDmmPrice } from './dmm-price.js';

for (const [value, expected] of [[1000, 1000], ['1000', 1000], ['1,000', 1000], ['1000円', 1000], ['¥1,000', 1000], [' ￥１，０００円 ', 1000]] as const) {
  assert.equal(parseOptionalDmmPrice(value), expected);
}
for (const value of [undefined, null, '', '0', 0, '100〜200', '100～', '月額1000円', '100.5', {}, [], -1, Infinity, Number.NaN]) {
  assert.equal(parseOptionalDmmPrice(value), null);
}
console.log('dmm price: ok');
