// Тесты доставки корекцій (промпт 037):
// dispatchAdjustment обязан await-ить send → markExported,
// помечать exported ТОЛЬКО при фактическом успешном send (sent === true),
// а ошибку отправки глотать (не валить PATCH /api/admin/leads/[id]).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchAdjustment, type AdjustmentRow } from '@/lib/conversion-adjustments'
import { sendAdjustmentToSheets } from '@/lib/google-sheets'

vi.mock('@/lib/google-sheets', () => ({
  sendAdjustmentToSheets: vi.fn(),
}))

// Мок supabase service client: from('conversion_adjustments').update(...).eq(...)
const eqMock = vi.fn()
const updateMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: fromMock }),
}))

const row: AdjustmentRow = {
  id: 'adj-1',
  lead_id: 'lead-1',
  order_no: 204,
  conversion_action: 'Target Lead',
  adjustment_type: 'retract',
  adjusted_value: null,
  adjustment_currency: null,
  adjustment_time: '2026-01-15T08:30:00.000Z',
}

beforeEach(() => {
  eqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: eqMock })
  fromMock.mockReturnValue({ update: updateMock })
})

describe('dispatchAdjustment', () => {
  it('sent === true → помечает корекцию exported (до резолва промиса, не fire-and-forget)', async () => {
    vi.mocked(sendAdjustmentToSheets).mockResolvedValue(true)

    await dispatchAdjustment(row)

    expect(sendAdjustmentToSheets).toHaveBeenCalledWith({
      orderNo: 204,
      conversionAction: 'Target Lead',
      adjustmentTime: '2026-01-15T08:30:00.000Z',
      type: 'retract',
      value: null,
      currency: null,
    })
    expect(fromMock).toHaveBeenCalledWith('conversion_adjustments')
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ export_status: 'exported' })
    )
    expect(eqMock).toHaveBeenCalledWith('id', 'adj-1')
  })

  it('sent === false (Sheets не настроен) → export_status НЕ трогаем', async () => {
    vi.mocked(sendAdjustmentToSheets).mockResolvedValue(false)

    await dispatchAdjustment(row)

    expect(updateMock).not.toHaveBeenCalled()
  })

  it('send кидает ошибку → не пробрасывается наружу (PATCH не валится), exported не ставится', async () => {
    vi.mocked(sendAdjustmentToSheets).mockRejectedValue(new Error('Sheets API error: 500'))

    await expect(dispatchAdjustment(row)).resolves.toBeUndefined()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
