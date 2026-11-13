// Валидация Conversion Name (Google Ads) для стадий воронки.
// Общий хелпер: API-роуты lead-statuses (server) + settings-panel (client).
//
// Правила:
// - юникод-буквы, цифры, пробел, `_`, `.`, `-`; длина 1-100
// - первый символ НЕ `=`, `+`, `-`, `@` и не пробел — защита от
//   formula/CSV-injection в Google Sheets и заглушек типа "-"
// - значение из одних только разделителей (`-`, `.`, `_`, пробелы) отклоняется

export const CONVERSION_ACTION_RE =
  /^(?![=+\-@\s])(?=.*[\p{L}\p{N}])[\p{L}\p{N} _.-]{1,100}$/u

export const CONVERSION_ACTION_ERROR =
  'Conversion Name: лише літери/цифри/пробіл/_ . -, не може починатися з = + - @. Вкажіть реальне імʼя конверсії з Google Ads.'

/**
 * Возвращает текст ошибки (uk-UA) или null, если значение валидно.
 * Пустое после trim (и не-строка) → null: такое значение нормализуется в null
 * выше по стеку, а обязательность при conversion_type != null проверяется отдельно.
 */
export function validateConversionAction(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  return CONVERSION_ACTION_RE.test(raw) ? null : CONVERSION_ACTION_ERROR
}
