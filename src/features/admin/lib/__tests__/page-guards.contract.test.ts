// Контракт «сторінка адмінки → права розділу» (розділ 5 стандарту: немає права на розділ → редирект
// на /admin). Кожна сторінка розділу має викликати requireSectionAccess(<права з ADMIN_SECTIONS>).
// Сторінки без такого гарду перелічені явно як відомий виняток (див. звіт тестування адмінки
// 2026-09-18) — новий негардований розділ робить тест червоним.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ADMIN_SECTIONS } from '../sections'
import * as SETS from '@/presentation/permissions'

const PAGES_ROOT = path.resolve(process.cwd(), 'src', 'app', 'admin', '(dashboard)')

/**
 * Сторінки, які зараз НЕ викликають requireSectionAccess (лише сесія через layout):
 * дані беруться з API під withAdmin, але сам розділ відкривається будь-кому із сесією.
 * Прибрати звідси після рішення власника про гард.
 */
const KNOWN_UNGUARDED = ['/admin/leads', '/admin/leads/[id]', '/admin/users']

function pageFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...pageFiles(full))
    else if (e.name === 'page.tsx') out.push(full)
  }
  return out
}

function hrefOf(file: string): string {
  const rel = path.relative(PAGES_ROOT, path.dirname(file)).split(path.sep).join('/')
  return rel ? `/admin/${rel}` : '/admin'
}

function guardArg(src: string): string | null {
  const m = src.match(/requireSectionAccess\(([^)]*)\)/)
  return m ? m[1].trim() : null
}

function resolvePerms(arg: string): string[] {
  const named = SETS as unknown as Record<string, string[]>
  if (/^[A-Z_]+$/.test(arg)) return [...(named[arg] ?? [`<unknown ${arg}>`])].sort()
  const inner = arg.replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!inner) return []
  return inner.split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, '')).sort()
}

describe('контракт гардів сторінок /admin/**', () => {
  const files = pageFiles(PAGES_ROOT)
  const byHref = new Map(files.map((f) => [hrefOf(f), f]))
  const sections = new Map(ADMIN_SECTIONS.map((s) => [s.href, [...s.anyPermission].sort()]))

  it('кожен розділ з ADMIN_SECTIONS має сторінку', () => {
    for (const href of sections.keys()) expect(byHref.has(href), `немає сторінки ${href}`).toBe(true)
  })

  for (const [href, file] of byHref) {
    if (href === '/admin') continue // головна: картки за правами, гард — сесія в layout
    it(`${href}: гард = права розділу`, () => {
      const src = fs.readFileSync(file, 'utf8')
      const arg = guardArg(src)
      if (KNOWN_UNGUARDED.includes(href)) {
        expect(arg, `${href} тепер має гард — прибери його з KNOWN_UNGUARDED`).toBeNull()
        return
      }
      expect(arg, `${href}: немає requireSectionAccess(...)`).not.toBeNull()
      const sectionHref = href.replace(/\/\[id\]$/, '')
      const expected = sections.get(sectionHref)
      expect(expected, `${href}: розділу немає в ADMIN_SECTIONS`).toBeDefined()
      expect(resolvePerms(arg!)).toEqual(expected)
    })
  }

  it('ADMIN_SECTIONS не дублює константи presentation/permissions (заявки, конверсії, інтеграції, ролі)', () => {
    expect(sections.get('/admin/leads')).toEqual([...SETS.LEAD_VIEW_PERMISSIONS].sort())
    expect(sections.get('/admin/conversions')).toEqual([...SETS.CONVERSION_PERMISSIONS].sort())
    expect(sections.get('/admin/conversion-adjustments')).toEqual([...SETS.CONVERSION_PERMISSIONS].sort())
    expect(sections.get('/admin/integrations')).toEqual([...SETS.INTEGRATION_PERMISSIONS].sort())
    expect(sections.get('/admin/roles')).toEqual([...SETS.ROLE_PERMISSIONS].sort())
  })
})
