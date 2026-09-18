// Контракт публічних роутів і спецгардів (розділи 8 і 16 стандарту): приймач заявок без сесії,
// /api/lead — чистий реекспорт /api/leads (рішення 19), cron лише з Bearer CRON_SECRET,
// dev-роут GA4 віддає 404 ДО перевірки сесії, коли dev tools вимкнено.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const API = path.resolve(process.cwd(), 'src', 'app', 'api')
const read = (...p: string[]) => fs.readFileSync(path.join(API, ...p), 'utf8')

describe('контракт публічних роутів', () => {
  it('/api/leads: POST без withAdmin, runtime nodejs, 429 з Retry-After, 500 "DB error" на виняток', () => {
    const src = read('leads', 'route.ts')
    expect(src).toMatch(/export async function POST/)
    expect(src).not.toContain('withAdmin(')
    expect(src).toContain("export const runtime = 'nodejs'")
    expect(src).toContain("'Retry-After'")
    expect(src).toContain("{ error: 'DB error' }")
  })

  it('/api/lead — реекспорт POST з /api/leads без власної логіки', () => {
    const src = read('lead', 'route.ts')
    expect(src).toMatch(/export \{ POST \} from '\.\.\/leads\/route'/)
    expect(src).toContain("export const runtime = 'nodejs'")
    expect(src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length).toBe(2)
  })

  it('/api/cron/keepalive — лише Bearer CRON_SECRET, без withAdmin', () => {
    const src = read('cron', 'keepalive', 'route.ts')
    expect(src).toMatch(/const secret = getCronSecret\(\)/)
    expect(src).toMatch(/!secret \|\| !safeEqual\(/)
    expect(src).toContain('timingSafeEqual')
    expect(src).not.toContain('withAdmin(')
    expect(src).toMatch(/status: 401/)
  })

  it('/api/admin/dev/ga4-arrival — 404 до withAdmin, коли dev tools вимкнено', () => {
    const src = read('admin', 'dev', 'ga4-arrival', 'route.ts')
    const gate = src.indexOf('isDevToolsEnabled()')
    const auth = src.indexOf('withAdmin(')
    expect(gate).toBeGreaterThan(-1)
    expect(auth).toBeGreaterThan(gate)
    expect(src).toMatch(/status: 404/)
  })

  it('/api/admin/integrations/[key]: невідомий ключ відкидається до читання тіла', () => {
    const src = read('admin', 'integrations', '[key]', 'route.ts')
    const known = src.search(/KNOWN_INTEGRATION_KEYS\.has\(|isKnownIntegrationKey\(/)
    const body = src.search(/readJson[<(]/)
    expect(known, 'немає перевірки ключа').toBeGreaterThan(-1)
    expect(body).toBeGreaterThan(known)
  })
})
