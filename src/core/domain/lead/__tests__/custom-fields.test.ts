// Правила кастомных полей лида и их значений (custom-fields).
import { describe, it, expect } from 'vitest'
import {
  planNewCustomField,
  planCustomFieldPatch,
  validateCustomFieldValue,
  CUSTOM_FIELD_TYPES,
} from '../custom-fields'

describe('CUSTOM_FIELD_TYPES', () => {
  it('пять типов', () => {
    expect(CUSTOM_FIELD_TYPES).toEqual(['text', 'number', 'date', 'select', 'boolean'])
  })
})

describe('planNewCustomField', () => {
  it('валидное поле: trim названия, ключ в нижнем регистре, тип text по умолчанию', () => {
    const r = planNewCustomField({ name: '  Бюджет ', field_key: ' Budget_2 ' })
    expect(r).toEqual({
      ok: true,
      value: { name: 'Бюджет', field_key: 'budget_2', type: 'text', options: null, required: false },
    })
  })

  it('название: 1-64 символа (после trim)', () => {
    expect(planNewCustomField({ name: '', field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ name: '   ', field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ name: 'x'.repeat(65), field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ name: 'x'.repeat(64), field_key: 'k' }).ok).toBe(true)
  })

  it('ключ: латиница, цифры, _, начинается с буквы, макс. 64', () => {
    const msg = 'Ключ: латиниця, цифри, _, починається з літери (макс. 64)'
    for (const bad of ['', '1abc', '_abc', 'a-b', 'a b', 'ключ', 'a'.repeat(65)]) {
      expect(planNewCustomField({ name: 'n', field_key: bad })).toEqual({ ok: false, message: msg })
    }
    expect(planNewCustomField({ name: 'n' })).toEqual({ ok: false, message: msg })
    expect(planNewCustomField({ name: 'n', field_key: 'a'.repeat(64) }).ok).toBe(true)
    expect(planNewCustomField({ name: 'n', field_key: 'a1_' }).ok).toBe(true)
  })

  it('неверный тип → ошибка', () => {
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'json' })).toEqual({ ok: false, message: 'Невірний тип' })
    for (const t of CUSTOM_FIELD_TYPES) {
      const body = t === 'select' ? { name: 'n', field_key: 'k', type: t, options: ['a'] } : { name: 'n', field_key: 'k', type: t }
      expect(planNewCustomField(body).ok).toBe(true)
    }
  })

  it('select: нужен непустой список опций', () => {
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'select' })).toEqual({
      ok: false, message: 'Для типу select потрібен список опцій',
    })
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'select', options: [] })).toEqual({
      ok: false, message: 'Для типу select потрібен список опцій',
    })
  })

  it('select: опции trim, пустые и >64 отбрасываются; все отброшены → ошибка', () => {
    const r = planNewCustomField({ name: 'n', field_key: 'k', type: 'select', options: [' A ', '', '  ', 'x'.repeat(65), 'B'] })
    expect(r.ok && r.value.options).toEqual(['A', 'B'])
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'select', options: ['', 'x'.repeat(65)] })).toEqual({
      ok: false, message: 'Потрібна хоча б одна опція',
    })
  })

  it('опции для не-select игнорируются (options=null); required → boolean', () => {
    const r = planNewCustomField({ name: 'n', field_key: 'k', type: 'text', options: ['a'], required: true })
    expect(r).toEqual({ ok: true, value: { name: 'n', field_key: 'k', type: 'text', options: null, required: true } })
    const r2 = planNewCustomField({ name: 'n', field_key: 'k', required: 'yes' as never })
    expect(r2.ok && r2.value.required).toBe(true)
  })
})

describe('planCustomFieldPatch', () => {
  it('пустой patch → «Нічого оновлювати»', () => {
    expect(planCustomFieldPatch({}, 'text')).toEqual({ ok: false, message: 'Нічого оновлювати' })
  })

  it('name: trim, 1-64', () => {
    expect(planCustomFieldPatch({ name: '  Нова ' }, 'text')).toEqual({ ok: true, value: { name: 'Нова' } })
    expect(planCustomFieldPatch({ name: '   ' }, 'text')).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planCustomFieldPatch({ name: 'x'.repeat(65) }, 'text')).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
  })

  it('options только для select', () => {
    expect(planCustomFieldPatch({ options: ['a'] }, 'text')).toEqual({ ok: false, message: 'Опції лише для типу select' })
    expect(planCustomFieldPatch({ options: ['a'] }, 'number')).toEqual({ ok: false, message: 'Опції лише для типу select' })
    expect(planCustomFieldPatch({ options: [' a ', 'b'] }, 'select')).toEqual({ ok: true, value: { options: ['a', 'b'] } })
  })

  it('options: пустой список / все отброшены → ошибка', () => {
    expect(planCustomFieldPatch({ options: [] }, 'select')).toEqual({ ok: false, message: 'Потрібен непорожній список опцій' })
    expect(planCustomFieldPatch({ options: 'a' as never }, 'select')).toEqual({ ok: false, message: 'Потрібен непорожній список опцій' })
    expect(planCustomFieldPatch({ options: ['', '  '] }, 'select')).toEqual({ ok: false, message: 'Потрібна хоча б одна опція' })
  })

  it('required → boolean', () => {
    expect(planCustomFieldPatch({ required: true }, 'text')).toEqual({ ok: true, value: { required: true } })
    expect(planCustomFieldPatch({ required: false }, 'text')).toEqual({ ok: true, value: { required: false } })
  })

  it('position: floor, неотрицательное; NaN → ошибка', () => {
    expect(planCustomFieldPatch({ position: 2.9 }, 'text')).toEqual({ ok: true, value: { position: 2 } })
    expect(planCustomFieldPatch({ position: 0 }, 'text')).toEqual({ ok: true, value: { position: 0 } })
    expect(planCustomFieldPatch({ position: -1 }, 'text')).toEqual({ ok: false, message: 'Невірна позиція' })
    expect(planCustomFieldPatch({ position: 'abc' as never }, 'text')).toEqual({ ok: false, message: 'Невірна позиція' })
  })

  it('несколько полей вместе', () => {
    const r = planCustomFieldPatch({ name: 'N', required: true, position: 1, options: ['x'] }, 'select')
    expect(r).toEqual({ ok: true, value: { name: 'N', options: ['x'], required: true, position: 1 } })
  })
})

describe('validateCustomFieldValue', () => {
  const text = { type: 'text', options: null }

  it("'' / null / undefined / пробелы → null", () => {
    for (const raw of ['', null, undefined, '   ']) {
      expect(validateCustomFieldValue(text, raw)).toEqual({ ok: true, value: null })
    }
  })

  it('text: trim, ≤ 1000', () => {
    expect(validateCustomFieldValue(text, '  hi ')).toEqual({ ok: true, value: 'hi' })
    expect(validateCustomFieldValue(text, 'x'.repeat(1000)).ok).toBe(true)
    expect(validateCustomFieldValue(text, 'x'.repeat(1001))).toEqual({ ok: false, message: 'Занадто довге значення' })
  })

  it('number: конечное число (строкой или числом)', () => {
    const f = { type: 'number', options: null }
    expect(validateCustomFieldValue(f, 42)).toEqual({ ok: true, value: '42' })
    expect(validateCustomFieldValue(f, '3.5')).toEqual({ ok: true, value: '3.5' })
    expect(validateCustomFieldValue(f, '-1')).toEqual({ ok: true, value: '-1' })
    expect(validateCustomFieldValue(f, 'abc')).toEqual({ ok: false, message: 'Невірне число' })
    expect(validateCustomFieldValue(f, 'Infinity')).toEqual({ ok: false, message: 'Невірне число' })
  })

  it('date: YYYY-MM-DD и настоящая дата', () => {
    const f = { type: 'date', options: null }
    expect(validateCustomFieldValue(f, '2026-09-18')).toEqual({ ok: true, value: '2026-09-18' })
    for (const bad of ['18.09.2026', '2026-9-18', '2026-13-01', 'abcd-ef-gh', '2026-09-18T00:00:00Z']) {
      expect(validateCustomFieldValue(f, bad)).toEqual({ ok: false, message: 'Невірна дата (YYYY-MM-DD)' })
    }
  })

  // Date.parse('2026-02-30') в V8 не даёт NaN (дата «перекатывается» на 2 марта),
  // так что проверка «настоящая дата» из doc-комментария не срабатывает для несуществующих дней месяца.
  it('date: несуществующий день месяца (2026-02-30, 2026-04-31) отклоняется; 2024-02-29 — да', () => {
    expect(validateCustomFieldValue({ type: 'date', options: null }, '2026-02-30').ok).toBe(false)
    expect(validateCustomFieldValue({ type: 'date', options: null }, '2026-04-31').ok).toBe(false)
    expect(validateCustomFieldValue({ type: 'date', options: null }, '2024-02-29')).toEqual({ ok: true, value: '2024-02-29' })
  })

  it.todo('date: 2026-02-30 / 2026-04-31 должны отклоняться как несуществующие даты (src/core/domain/lead/custom-fields.ts:94 — Date.parse не ловит переполнение дня; нужна проверка компонентов через Date.UTC и сравнение обратно)')

  it('select: только из опций', () => {
    const f = { type: 'select', options: ['A', 'B'] }
    expect(validateCustomFieldValue(f, 'A')).toEqual({ ok: true, value: 'A' })
    expect(validateCustomFieldValue(f, ' B ')).toEqual({ ok: true, value: 'B' })
    expect(validateCustomFieldValue(f, 'C')).toEqual({ ok: false, message: 'Значення не входить в список опцій' })
    expect(validateCustomFieldValue(f, 'a')).toEqual({ ok: false, message: 'Значення не входить в список опцій' })
    // options не массив → ни одно значение не проходит
    expect(validateCustomFieldValue({ type: 'select', options: null }, 'A').ok).toBe(false)
  })

  it('boolean: любая строка принимается как текст (отдельных правил нет)', () => {
    const f = { type: 'boolean', options: null }
    expect(validateCustomFieldValue(f, true)).toEqual({ ok: true, value: 'true' })
    expect(validateCustomFieldValue(f, false)).toEqual({ ok: true, value: 'false' })
    expect(validateCustomFieldValue(f, 'так')).toEqual({ ok: true, value: 'так' })
  })
})
