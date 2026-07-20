import assert from 'node:assert/strict';
import { convertDmmPrice, diagnoseDmmPrice, priceDiagnosticCode, priceMissingDiagnosticCode } from './dmm-price.js';

for (const [value, expected] of [[1000, 1000], ['1000', 1000], ['1,000', 1000], ['1000円', 1000], ['¥1,000', 1000], [' ￥１，０００円 ', 1000]] as const) {
  const converted = convertDmmPrice(value, 'current_price');
  assert.equal(converted.ok, true);
  if (converted.ok) assert.equal(converted.value, expected);
}
for (const value of ['', '100〜200', '月額1000円', {}, [], -1, Infinity, Number.NaN]) {
  assert.equal(convertDmmPrice(value, 'current_price').ok, false);
}
assert.equal(convertDmmPrice(undefined, 'list_price').ok, false);
const diagnostic = diagnoseDmmPrice(['secret'], 'current_price');
assert.equal(diagnostic.isArray, true);
assert.equal(diagnostic.isObject, false);
assert.equal(diagnostic.format, 'unsupported_type');
const safeCode = priceDiagnosticCode(diagnoseDmmPrice('1,000', 'list_price'));
assert.match(safeCode, /^invalid_price:list_price:comma_separated:string:scalar:length_5$/);
assert.doesNotMatch(safeCode, /1,000/);
assert.equal(priceMissingDiagnosticCode(diagnoseDmmPrice(undefined, 'current_price')), 'price_missing:current_price:unsupported_type:undefined:scalar:length_na');
console.log('dmm price: ok');
