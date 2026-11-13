// Тесты валидации Conversion Name (Google Ads) для стадий воронки (промпт 038):
// validateConversionAction возвращает CONVERSION_ACTION_ERROR для мусорных значений
// (заглушки "-", formula-injection "=...", "@...", ведущий пробел, одни разделители,
// > 100 символов) и null для валидных имён. Пустое после trim / не-строка → null:
// такое значение нормализуется в null выше по стеку, обязательность проверяется отдельно.
import { describe, it, expect } from 'vitest'
import {
  CONVERSION_ACTION_ERROR,
  validateConversionAction,
} from '../conversion-action'

describe('validateConversionAction', () => {
  it('принимает валидные имена конверсий', () => {
    expect(validateConversionAction('lead_form_offline')).toBeNull()
    expect(validateConversionAction('Deal Offline 2')).toBeNull()
  })

  it('принимает украинские буквы (юникод-буквы)', () => {
    expect(validateConversionAction('Заявка з сайту')).toBeNull()
  })

  it('принимает точку и подчёркивание внутри значения', () => {
    expect(validateConversionAction('lead.v2_offline')).toBeNull()
    expect(validateConversionAction('a.b-c_d')).toBeNull()
  })

  it('принимает ровно 100 символов (граница длины)', () => {
    expect(validateConversionAction('a'.repeat(100))).toBeNull()
  })

  it('отклоняет заглушку "-"', () => {
    expect(validateConversionAction('-')).toBe(CONVERSION_ACTION_ERROR)
  })

  it('отклоняет formula-injection: ведущие = + @', () => {
    expect(validateConversionAction('=+солевои')).toBe(CONVERSION_ACTION_ERROR)
    expect(validateConversionAction('@x')).toBe(CONVERSION_ACTION_ERROR)
  })

  it('отклоняет ведущий пробел', () => {
    expect(validateConversionAction(' lead')).toBe(CONVERSION_ACTION_ERROR)
  })

  it('отклоняет строку из одних разделителей ("...")', () => {
    expect(validateConversionAction('...')).toBe(CONVERSION_ACTION_ERROR)
  })

  it('отклоняет 101 символ (превышение длины)', () => {
    expect(validateConversionAction('a'.repeat(101))).toBe(
      CONVERSION_ACTION_ERROR
    )
  })

  it('пустые/нормализуемые значения → null (обязательность проверяется отдельно)', () => {
    expect(validateConversionAction('')).toBeNull()
    expect(validateConversionAction('   ')).toBeNull()
    expect(validateConversionAction(null)).toBeNull()
    expect(validateConversionAction(undefined)).toBeNull()
  })
})
