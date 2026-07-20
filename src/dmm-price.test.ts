import assert from 'node:assert/strict';
import { convertDmmPrice, diagnoseDmmPrice, diagnoseDmmPriceCharacters, priceDiagnosticCode, priceMissingDiagnosticCode } from './dmm-price.js';

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
assert.match(safeCode, /^invalid_price:list_price:comma_separated:string:scalar:length_5:pattern_DCDDD:ascii_digits_4:full_width_digits_0:whitespace_0:commas_1:periods_0:currency_symbols_0:japanese_0:hyphens_0:wave_dashes_0:other_symbols_0:unknown_none$/);
assert.doesNotMatch(safeCode, /1,000/);
assert.equal(priceMissingDiagnosticCode(diagnoseDmmPrice(undefined, 'current_price')), 'price_missing:current_price:unsupported_type:undefined:scalar:length_na');
const characters = diagnoseDmmPriceCharacters('１２¥,〜～あ!😀');
assert.equal(characters.pattern, 'DDYCRRJPX');
assert.equal(characters.asciiDigits, 0);
assert.equal(characters.fullWidthDigits, 2);
assert.equal(characters.currencySymbols, 1);
assert.equal(characters.commas, 1);
assert.equal(characters.waveDashes, 2);
assert.equal(characters.japaneseCharacters, 1);
assert.equal(characters.otherSymbols, 1);
assert.deepEqual(characters.unknownCodePoints, { 'U+1F600': 1 });
const unknownSafeCode = priceDiagnosticCode(diagnoseDmmPrice('12¥😀', 'current_price'));
assert.match(unknownSafeCode, /pattern_DDYX/);
assert.match(unknownSafeCode, /unknown_U\+1F600=1$/);
assert.doesNotMatch(unknownSafeCode, /12¥😀/);
console.log('dmm price: ok');
