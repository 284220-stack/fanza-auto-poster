export function parseOptionalDmmPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = normalizeFullWidth(value).trim().replace(/^[¥￥]\s*/, '').replace(/\s*円$/, '');
  if (!validNumericText(normalized)) return null;
  const numeric = Number(normalized.replaceAll(',', ''));
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeFullWidth(value: string) {
  return value
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .replaceAll('，', ',')
    .replaceAll('　', ' ');
}

function validNumericText(value: string) {
  return /^\d+$/.test(value) || /^\d{1,3}(,\d{3})+$/.test(value);
}
