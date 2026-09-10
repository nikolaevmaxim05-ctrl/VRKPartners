// Валідація Conversion Name (Google Ads) для стадій воронки.
// Спільний хелпер: API-роути lead-statuses (server) + settings-panel (client).
//
// Правила:
// - юнікод-літери, цифри, пробіл, `_`, `.`, `-`; довжина 1-100
// - перший символ НЕ `=`, `+`, `-`, `@` і не пробіл — захист від
//   formula/CSV-injection у Google Sheets і заглушок типу "-"
// - значення з одних лише розділювачів (`-`, `.`, `_`, пробіли) відхиляється

export const CONVERSION_ACTION_RE =
  /^(?![=+\-@\s])(?=.*[\p{L}\p{N}])[\p{L}\p{N} _.-]{1,100}$/u

export const CONVERSION_ACTION_ERROR =
  'Conversion Name: лише літери/цифри/пробіл/_ . -, не може починатися з = + - @. Вкажіть реальне імʼя конверсії з Google Ads.'

/**
 * Повертає текст помилки (uk-UA) або null, якщо значення валідне.
 * Порожнє після trim (і не-рядок) → null: таке значення нормалізується у null
 * вище по стеку, а обов'язковість при conversion_type != null перевіряється окремо.
 */
export function validateConversionAction(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  return CONVERSION_ACTION_RE.test(raw) ? null : CONVERSION_ACTION_ERROR
}
