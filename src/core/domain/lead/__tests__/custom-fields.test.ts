// Правила кастомних полів ліда та їх значень (custom-fields).
import { describe, it, expect } from 'vitest'
import {
  planNewCustomField,
  planCustomFieldPatch,
  validateCustomFieldValue,
  CUSTOM_FIELD_TYPES,
} from '../custom-fields'

describe('CUSTOM_FIELD_TYPES', () => {
  it('пʼять типів', () => {
    expect(CUSTOM_FIELD_TYPES).toEqual(['text', 'number', 'date', 'select', 'boolean'])
  })
})

describe('planNewCustomField', () => {
  it('валідне поле: trim назви, ключ у нижньому регістрі, тип text за замовчуванням', () => {
    const r = planNewCustomField({ name: '  Бюджет ', field_key: ' Budget_2 ' })
    expect(r).toEqual({
      ok: true,
      value: { name: 'Бюджет', field_key: 'budget_2', type: 'text', options: null, required: false },
    })
  })

  it('назва: 1-64 символи (після trim)', () => {
    expect(planNewCustomField({ name: '', field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ name: '   ', field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ name: 'x'.repeat(65), field_key: 'k' })).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planNewCustomField({ name: 'x'.repeat(64), field_key: 'k' }).ok).toBe(true)
  })

  it('ключ: латиниця, цифри, _, починається з літери, макс. 64', () => {
    const msg = 'Ключ: латиниця, цифри, _, починається з літери (макс. 64)'
    for (const bad of ['', '1abc', '_abc', 'a-b', 'a b', 'ключ', 'a'.repeat(65)]) {
      expect(planNewCustomField({ name: 'n', field_key: bad })).toEqual({ ok: false, message: msg })
    }
    expect(planNewCustomField({ name: 'n' })).toEqual({ ok: false, message: msg })
    expect(planNewCustomField({ name: 'n', field_key: 'a'.repeat(64) }).ok).toBe(true)
    expect(planNewCustomField({ name: 'n', field_key: 'a1_' }).ok).toBe(true)
  })

  it('невірний тип → помилка', () => {
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'json' })).toEqual({ ok: false, message: 'Невірний тип' })
    for (const t of CUSTOM_FIELD_TYPES) {
      const body = t === 'select' ? { name: 'n', field_key: 'k', type: t, options: ['a'] } : { name: 'n', field_key: 'k', type: t }
      expect(planNewCustomField(body).ok).toBe(true)
    }
  })

  it('select: потрібен непорожній список опцій', () => {
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'select' })).toEqual({
      ok: false, message: 'Для типу select потрібен список опцій',
    })
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'select', options: [] })).toEqual({
      ok: false, message: 'Для типу select потрібен список опцій',
    })
  })

  it('select: опції trim, порожні та >64 відкидаються; усі відкинуто → помилка', () => {
    const r = planNewCustomField({ name: 'n', field_key: 'k', type: 'select', options: [' A ', '', '  ', 'x'.repeat(65), 'B'] })
    expect(r.ok && r.value.options).toEqual(['A', 'B'])
    expect(planNewCustomField({ name: 'n', field_key: 'k', type: 'select', options: ['', 'x'.repeat(65)] })).toEqual({
      ok: false, message: 'Потрібна хоча б одна опція',
    })
  })

  it('опції для не-select ігноруються (options=null); required → boolean', () => {
    const r = planNewCustomField({ name: 'n', field_key: 'k', type: 'text', options: ['a'], required: true })
    expect(r).toEqual({ ok: true, value: { name: 'n', field_key: 'k', type: 'text', options: null, required: true } })
    const r2 = planNewCustomField({ name: 'n', field_key: 'k', required: 'yes' as never })
    expect(r2.ok && r2.value.required).toBe(true)
  })
})

describe('planCustomFieldPatch', () => {
  it('порожній patch → «Нічого оновлювати»', () => {
    expect(planCustomFieldPatch({}, 'text')).toEqual({ ok: false, message: 'Нічого оновлювати' })
  })

  it('name: trim, 1-64', () => {
    expect(planCustomFieldPatch({ name: '  Нова ' }, 'text')).toEqual({ ok: true, value: { name: 'Нова' } })
    expect(planCustomFieldPatch({ name: '   ' }, 'text')).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
    expect(planCustomFieldPatch({ name: 'x'.repeat(65) }, 'text')).toEqual({ ok: false, message: 'Назва: 1-64 символи' })
  })

  it('options лише для select', () => {
    expect(planCustomFieldPatch({ options: ['a'] }, 'text')).toEqual({ ok: false, message: 'Опції лише для типу select' })
    expect(planCustomFieldPatch({ options: ['a'] }, 'number')).toEqual({ ok: false, message: 'Опції лише для типу select' })
    expect(planCustomFieldPatch({ options: [' a ', 'b'] }, 'select')).toEqual({ ok: true, value: { options: ['a', 'b'] } })
  })

  it('options: порожній список / усі відкинуті → помилка', () => {
    expect(planCustomFieldPatch({ options: [] }, 'select')).toEqual({ ok: false, message: 'Потрібен непорожній список опцій' })
    expect(planCustomFieldPatch({ options: 'a' as never }, 'select')).toEqual({ ok: false, message: 'Потрібен непорожній список опцій' })
    expect(planCustomFieldPatch({ options: ['', '  '] }, 'select')).toEqual({ ok: false, message: 'Потрібна хоча б одна опція' })
  })

  it('required → boolean', () => {
    expect(planCustomFieldPatch({ required: true }, 'text')).toEqual({ ok: true, value: { required: true } })
    expect(planCustomFieldPatch({ required: false }, 'text')).toEqual({ ok: true, value: { required: false } })
  })

  it('position: floor, невідʼємне; NaN → помилка', () => {
    expect(planCustomFieldPatch({ position: 2.9 }, 'text')).toEqual({ ok: true, value: { position: 2 } })
    expect(planCustomFieldPatch({ position: 0 }, 'text')).toEqual({ ok: true, value: { position: 0 } })
    expect(planCustomFieldPatch({ position: -1 }, 'text')).toEqual({ ok: false, message: 'Невірна позиція' })
    expect(planCustomFieldPatch({ position: 'abc' as never }, 'text')).toEqual({ ok: false, message: 'Невірна позиція' })
  })

  it('кілька полів разом', () => {
    const r = planCustomFieldPatch({ name: 'N', required: true, position: 1, options: ['x'] }, 'select')
    expect(r).toEqual({ ok: true, value: { name: 'N', options: ['x'], required: true, position: 1 } })
  })
})

describe('validateCustomFieldValue', () => {
  const text = { type: 'text', options: null }

  it("'' / null / undefined / пробіли → null", () => {
    for (const raw of ['', null, undefined, '   ']) {
      expect(validateCustomFieldValue(text, raw)).toEqual({ ok: true, value: null })
    }
  })

  it('text: trim, ≤ 1000', () => {
    expect(validateCustomFieldValue(text, '  hi ')).toEqual({ ok: true, value: 'hi' })
    expect(validateCustomFieldValue(text, 'x'.repeat(1000)).ok).toBe(true)
    expect(validateCustomFieldValue(text, 'x'.repeat(1001))).toEqual({ ok: false, message: 'Занадто довге значення' })
  })

  it('number: скінченне число (рядком або числом)', () => {
    const f = { type: 'number', options: null }
    expect(validateCustomFieldValue(f, 42)).toEqual({ ok: true, value: '42' })
    expect(validateCustomFieldValue(f, '3.5')).toEqual({ ok: true, value: '3.5' })
    expect(validateCustomFieldValue(f, '-1')).toEqual({ ok: true, value: '-1' })
    expect(validateCustomFieldValue(f, 'abc')).toEqual({ ok: false, message: 'Невірне число' })
    expect(validateCustomFieldValue(f, 'Infinity')).toEqual({ ok: false, message: 'Невірне число' })
  })

  it('date: YYYY-MM-DD і справжня дата', () => {
    const f = { type: 'date', options: null }
    expect(validateCustomFieldValue(f, '2026-09-18')).toEqual({ ok: true, value: '2026-09-18' })
    for (const bad of ['18.09.2026', '2026-9-18', '2026-13-01', 'abcd-ef-gh', '2026-09-18T00:00:00Z']) {
      expect(validateCustomFieldValue(f, bad)).toEqual({ ok: false, message: 'Невірна дата (YYYY-MM-DD)' })
    }
  })

  // Date.parse('2026-02-30') у V8 не дає NaN (дата «перекочується» на 2 березня),
  // тож перевірка «справжня дата» з doc-коментаря не спрацьовує для неіснуючих днів місяця.
  it('date: неіснуючий день місяця (2026-02-30) зараз ПРОХОДИТЬ (документуємо поточну поведінку)', () => {
    expect(validateCustomFieldValue({ type: 'date', options: null }, '2026-02-30')).toEqual({ ok: true, value: '2026-02-30' })
  })

  it.todo('date: 2026-02-30 / 2026-04-31 мають відхилятися як неіснуючі дати (src/core/domain/lead/custom-fields.ts:94 — Date.parse не ловить переповнення дня; потрібна перевірка компонентів через Date.UTC і порівняння назад)')

  it('select: лише з опцій', () => {
    const f = { type: 'select', options: ['A', 'B'] }
    expect(validateCustomFieldValue(f, 'A')).toEqual({ ok: true, value: 'A' })
    expect(validateCustomFieldValue(f, ' B ')).toEqual({ ok: true, value: 'B' })
    expect(validateCustomFieldValue(f, 'C')).toEqual({ ok: false, message: 'Значення не входить в список опцій' })
    expect(validateCustomFieldValue(f, 'a')).toEqual({ ok: false, message: 'Значення не входить в список опцій' })
    // options не масив → жодне значення не проходить
    expect(validateCustomFieldValue({ type: 'select', options: null }, 'A').ok).toBe(false)
  })

  it('boolean: будь-який рядок приймається як текст (окремих правил немає)', () => {
    const f = { type: 'boolean', options: null }
    expect(validateCustomFieldValue(f, true)).toEqual({ ok: true, value: 'true' })
    expect(validateCustomFieldValue(f, false)).toEqual({ ok: true, value: 'false' })
    expect(validateCustomFieldValue(f, 'так')).toEqual({ ok: true, value: 'так' })
  })
})
