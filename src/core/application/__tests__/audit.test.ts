import { describe, it, expect, vi } from 'vitest'
import { makeAuditLog } from '../audit'
import { dbOk, dbFail } from '../ports/common'

describe('makeAuditLog', () => {
  const actor = { id: 'u1', email: 'a@b.c', ip: '1.2.3.4' }

  it('пишет запись с актором, IP, старым и новым значением', async () => {
    const insert = vi.fn(async () => dbOk(undefined))
    await makeAuditLog({ insert }).record(actor, 'lead.update', 'leads/l1', { old: { a: 1 }, new: { a: 2 } })
    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1',
      user_email: 'a@b.c',
      action: 'lead.update',
      resource: 'leads/l1',
      old_value: { a: 1 },
      new_value: { a: 2 },
      ip_address: '1.2.3.4',
    })
  })

  it("IP 'unknown' → null; без актора → null", async () => {
    const insert = vi.fn(async () => dbOk(undefined))
    const audit = makeAuditLog({ insert })
    await audit.record({ ...actor, ip: 'unknown' }, 'x.y', 'r')
    await audit.record(null, 'x.y', 'r')
    const calls = insert.mock.calls as unknown as Array<[Record<string, unknown>]>
    expect(calls[0][0]).toMatchObject({ ip_address: null, old_value: null, new_value: null })
    expect(calls[1][0]).toMatchObject({ user_id: null, user_email: null })
  })

  it('ошибка или исключение адаптера не бросается наружу', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(makeAuditLog({ insert: async () => dbFail<void>('down') }).record(actor, 'a', 'r')).resolves.toBeUndefined()
    await expect(
      makeAuditLog({
        insert: async () => {
          throw new Error('boom')
        },
      }).record(actor, 'a', 'r'),
    ).resolves.toBeUndefined()
  })
})
