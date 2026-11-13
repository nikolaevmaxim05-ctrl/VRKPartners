// withAdmin (раздел 5): 401 без сессии, 403 без права или деактивированному (даже для anyOf = []),
// актор с IP из цепочки заголовков; respond/errorResponse — коды Result → HTTP.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const getRoleInfo = vi.fn()
const headerStore = new Map<string, string>()

vi.mock('@composition/container', () => ({
  getAuthSession: () => ({ getUser }),
  getUserRepository: () => ({ getRoleInfo }),
}))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
}))

import { withAdmin } from '../admin-route'
import { respond, errorResponse, readJson, statusOf } from '../http'
import { ok, fail } from '@core/application/result'

const role = (over: Partial<{ isActive: boolean; permissions: string[] }> = {}) => ({
  roleId: 'r1',
  roleName: 'manager',
  roleIsSystem: false,
  permissions: ['manage_leads'],
  isActive: true,
  displayName: null,
  roleRank: 5,
  ...over,
})

describe('withAdmin', () => {
  beforeEach(() => {
    getUser.mockReset()
    getRoleInfo.mockReset()
    headerStore.clear()
  })

  it('без сессии → 401 JSON, обработчик не вызывается', async () => {
    getUser.mockResolvedValue(null)
    const handler = vi.fn()
    const res = await withAdmin([], handler)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(handler).not.toHaveBeenCalled()
    expect(getRoleInfo).not.toHaveBeenCalled()
  })

  it('anyOf = []: активный пользователь с ролью → 200; без роли или деактивированный → 403', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    getRoleInfo.mockResolvedValueOnce(role())
    expect((await withAdmin([], () => Response.json({ ok: true }))).status).toBe(200)
    getRoleInfo.mockResolvedValueOnce(null)
    expect((await withAdmin([], () => Response.json({ ok: true }))).status).toBe(403)
    getRoleInfo.mockResolvedValueOnce(role({ isActive: false }))
    const res = await withAdmin([], () => Response.json({ ok: true }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Доступ заборонено' })
  })

  it('anyOf с правами: достаточно одного (OR); деактивированный → 403 даже с правом', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    getRoleInfo.mockResolvedValueOnce(role({ permissions: ['view_reports'] }))
    expect((await withAdmin(['manage_leads', 'view_reports'], () => Response.json({}))).status).toBe(200)
    getRoleInfo.mockResolvedValueOnce(role({ permissions: ['view_reports'] }))
    expect((await withAdmin(['manage_users'], () => Response.json({}))).status).toBe(403)
    getRoleInfo.mockResolvedValueOnce(role({ permissions: ['manage_users'], isActive: false }))
    expect((await withAdmin(['manage_users'], () => Response.json({}))).status).toBe(403)
  })

  it('актор: id, email, IP по цепочке cf-connecting-ip → x-forwarded-for[0] → x-real-ip → unknown', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    getRoleInfo.mockResolvedValue(role())
    headerStore.set('x-forwarded-for', '203.0.113.5, 10.0.0.1')
    const handler = vi.fn(async (actor: unknown) => Response.json(actor))
    const res = await withAdmin(['manage_leads'], handler)
    expect(await res.json()).toEqual({ id: 'u1', email: 'a@b.c', ip: '203.0.113.5' })
    headerStore.clear()
    const res2 = await withAdmin(['manage_leads'], handler)
    expect((await res2.json()).ip).toBe('unknown')
  })
})

describe('presentation/http', () => {
  it('коды Result → HTTP', () => {
    expect(statusOf('invalid')).toBe(400)
    expect(statusOf('unauthorized')).toBe(401)
    expect(statusOf('forbidden')).toBe(403)
    expect(statusOf('not_found')).toBe(404)
    expect(statusOf('conflict')).toBe(409)
    expect(statusOf('too_large')).toBe(413)
    expect(statusOf('rate_limited')).toBe(429)
    expect(statusOf('unavailable')).toBe(503)
    expect(statusOf('failed')).toBe(500)
  })

  it('respond: успех → { data } (или собственный toBody), ошибка → { error, ...details } со статусом', async () => {
    const okRes = respond(ok({ a: 1 }))
    expect(okRes.status).toBe(200)
    expect(await okRes.json()).toEqual({ data: { a: 1 } })
    const custom = respond(ok(5), (v) => ({ total: v }))
    expect(await custom.json()).toEqual({ total: 5 })
    const err = respond(fail('conflict', 'Зайнято', { code: 'STALE' }))
    expect(err.status).toBe(409)
    expect(await err.json()).toEqual({ error: 'Зайнято', code: 'STALE' })
    const err2 = errorResponse(fail('not_found', 'Не знайдено'))
    expect(err2.status).toBe(404)
    expect(await err2.json()).toEqual({ error: 'Не знайдено' })
  })

  it('readJson: невалидный JSON → 400 с переданным сообщением', async () => {
    const bad = await readJson(new Request('http://x', { method: 'POST', body: '{oops' }), 'Invalid data')
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.response.status).toBe(400)
      expect(await bad.response.json()).toEqual({ error: 'Invalid data' })
    }
    const good = await readJson<{ a: number }>(new Request('http://x', { method: 'POST', body: '{"a":1}' }))
    expect(good.ok && good.body).toEqual({ a: 1 })
  })
})
