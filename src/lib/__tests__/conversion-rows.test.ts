import { describe, it, expect } from 'vitest'
import { buildConversionRow, buildAdjustmentRow } from '@/lib/google-sheets'

describe('buildConversionRow', () => {
  it('використовує order_no (число) як Order ID у останній колонці', () => {
    const row = buildConversionRow({
      conversionAction: 'Deal',
      email: 'a@b.com',
      phone: '+380501112233',
      conversionTime: '2026-01-15T08:30:00.000Z',
      gclid: 'gcl_123',
      gbraid: null,
      wbraid: null,
      conversionValue: 5000,
      currency: 'UAH',
      orderNo: 201,
    })
    expect(row).toHaveLength(13)
    // Остання колонка (index 12) = Order ID = order_no як число (не UUID).
    expect(row[12]).toBe(201)
    expect(typeof row[12]).toBe('number')
  })
})

describe('buildAdjustmentRow', () => {
  const timeRe = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

  it('RESTATE: [order_no, name, time, RESTATE, value, currency]', () => {
    const row = buildAdjustmentRow({
      orderNo: 42,
      conversionAction: 'Deal',
      adjustmentTime: '2026-01-15T08:30:00.000Z',
      type: 'restate',
      value: 7000,
      currency: 'UAH',
    })
    expect(row).toHaveLength(6)
    expect(row[0]).toBe(42)
    expect(row[1]).toBe('Deal')
    expect(String(row[2])).toMatch(timeRe)
    expect(row[3]).toBe('RESTATE')
    expect(row[4]).toBe(7000)
    expect(row[5]).toBe('UAH')
  })

  it('RETRACT: без суми і валюти (порожні рядки), Order ID = order_no', () => {
    const row = buildAdjustmentRow({
      orderNo: 42,
      conversionAction: 'Deal',
      adjustmentTime: '2026-01-15T08:30:00.000Z',
      type: 'retract',
      value: null,
      currency: null,
    })
    expect(row).toHaveLength(6)
    expect(row[0]).toBe(42)
    expect(row[3]).toBe('RETRACT')
    expect(row[4]).toBe('')
    expect(row[5]).toBe('')
  })
})
