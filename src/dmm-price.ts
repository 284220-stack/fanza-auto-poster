export type DmmPriceField = 'current_price' | 'list_price';
export type DmmPriceFormat = 'numeric_only' | 'comma_separated' | 'currency_symbol' | 'yen_suffix' | 'range' | 'text_included' | 'empty' | 'unsupported_type' | 'unknown_format';

export type DmmPriceDiagnostic = {
  field: DmmPriceField;
  javascriptType: string;
  isArray: boolean;
  isObject: boolean;
  stringLength?: number;
  format: DmmPriceFormat;
};

export type DmmPriceConversion =
  | { ok: true; value: number; diagnostic: DmmPriceDiagnostic }
  | { ok: false; reason: 'missing' | 'invalid'; diagnostic: DmmPriceDiagnostic };

export function convertDmmPrice(value: unknown, field: DmmPriceField): DmmPriceConversion {
  const diagnostic = diagnoseDmmPrice(value, field);
  if (value === undefined || value === null) return { ok: false, reason: 'missing', diagnostic };

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0
      ? { ok: true, value, diagnostic }
      : { ok: false, reason: 'invalid', diagnostic };
  }
  if (typeof value !== 'string') return { ok: false, reason: 'invalid', diagnostic };

  const normalized = normalizeFullWidth(value).trim();
  if (!normalized || diagnostic.format === 'range' || diagnostic.format === 'text_included' || diagnostic.format === 'unknown_format') {
    return { ok: false, reason: 'invalid', diagnostic };
  }
  const withoutCurrency = normalized.replace(/^[¥￥]\s*/, '').replace(/\s*円$/, '');
  if (!validNumericText(withoutCurrency)) return { ok: false, reason: 'invalid', diagnostic };

  const numeric = Number(withoutCurrency.replaceAll(',', ''));
  return Number.isFinite(numeric) && numeric >= 0
    ? { ok: true, value: numeric, diagnostic }
    : { ok: false, reason: 'invalid', diagnostic };
}

export function diagnoseDmmPrice(value: unknown, field: DmmPriceField): DmmPriceDiagnostic {
  const javascriptType = value === null ? 'null' : typeof value;
  const isArray = Array.isArray(value);
  const isObject = javascriptType === 'object' && value !== null && !isArray;
  const stringLength = typeof value === 'string' ? value.length : undefined;
  return { field, javascriptType, isArray, isObject, stringLength, format: classifyFormat(value) };
}

export function priceDiagnosticCode(diagnostic: DmmPriceDiagnostic) {
  return diagnosticCode('invalid_price', diagnostic);
}

export function priceMissingDiagnosticCode(diagnostic: DmmPriceDiagnostic) {
  return diagnosticCode('price_missing', diagnostic);
}

function diagnosticCode(reason: 'invalid_price' | 'price_missing', diagnostic: DmmPriceDiagnostic) {
  const shape = diagnostic.isArray ? 'array' : diagnostic.isObject ? 'object' : 'scalar';
  const length = diagnostic.stringLength === undefined ? 'na' : String(diagnostic.stringLength);
  return `${reason}:${diagnostic.field}:${diagnostic.format}:${diagnostic.javascriptType}:${shape}:length_${length}`;
}

function classifyFormat(value: unknown): DmmPriceFormat {
  if (value === undefined || value === null) return 'unsupported_type';
  if (typeof value === 'number') return 'numeric_only';
  if (typeof value !== 'string') return 'unsupported_type';
  const normalized = normalizeFullWidth(value).trim();
  if (!normalized) return 'empty';
  if (/\d\s*[-〜～]\s*\d/.test(normalized)) return 'range';
  if (/^[¥￥]/.test(normalized)) return 'currency_symbol';
  if (/円$/.test(normalized)) return 'yen_suffix';
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) return 'comma_separated';
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return 'numeric_only';
  if (/[A-Za-zぁ-んァ-ヶ一-龯]/.test(normalized)) return 'text_included';
  return 'unknown_format';
}

function normalizeFullWidth(value: string) {
  return value
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .replaceAll('，', ',')
    .replaceAll('　', ' ');
}

function validNumericText(value: string) {
  return /^\d+(\.\d+)?$/.test(value) || /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value);
}
