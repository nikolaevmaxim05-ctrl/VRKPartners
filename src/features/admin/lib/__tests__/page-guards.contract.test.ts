// Контракт «страница админки → права раздела» (раздел 5 стандарта: нет права на раздел → редирект
// на /admin). Каждая страница раздела должна вызывать requireSectionAccess(<права из ADMIN_SECTIONS>).
// Страницы без такого гарда перечислены явно как известное исключение (см. отчёт тестирования админки
// 2026-09-18) — новый негардированный раздел делает тест красным.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ADMIN_SECTIONS } from '../sections'
import * as SETS from '@/presentation/permissions'

const PAGES_ROOT = path.resolve(process.cwd(), 'src', 'app', 'admin', '(dashboard)')

/** Страницы без гарда раздела. Пусто с 2026-09-18 (исправление по итогам тестирования админки). */
const KNOWN_UNGUARDED: string[] = []

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

describe('контракт гардов страниц /admin/**', () => {
  const files = pageFiles(PAGES_ROOT)
  const byHref = new Map(files.map((f) => [hrefOf(f), f]))
  const sections = new Map(ADMIN_SECTIONS.map((s) => [s.href, [...s.anyPermission].sort()]))

  it('у каждого раздела из ADMIN_SECTIONS есть страница', () => {
    for (const href of sections.keys()) expect(byHref.has(href), `нет страницы ${href}`).toBe(true)
  })

  for (const [href, file] of byHref) {
    if (href === '/admin') continue // главная: карточки по правам, гард — сессия в layout
    it(`${href}: гард = права раздела`, () => {
      const src = fs.readFileSync(file, 'utf8')
      const arg = guardArg(src)
      if (KNOWN_UNGUARDED.includes(href)) {
        expect(arg, `${href} теперь имеет гард — убери его из KNOWN_UNGUARDED`).toBeNull()
        return
      }
      expect(arg, `${href}: нет requireSectionAccess(...)`).not.toBeNull()
      const sectionHref = href.replace(/\/\[id\]$/, '')
      const expected = sections.get(sectionHref)
      expect(expected, `${href}: раздела нет в ADMIN_SECTIONS`).toBeDefined()
      expect(resolvePerms(arg!)).toEqual(expected)
    })
  }

  it('ADMIN_SECTIONS не дублирует константы presentation/permissions (заявки, конверсии, интеграции, роли)', () => {
    expect(sections.get('/admin/leads')).toEqual([...SETS.LEAD_VIEW_PERMISSIONS].sort())
    expect(sections.get('/admin/conversions')).toEqual([...SETS.CONVERSION_PERMISSIONS].sort())
    expect(sections.get('/admin/conversion-adjustments')).toEqual([...SETS.CONVERSION_PERMISSIONS].sort())
    expect(sections.get('/admin/integrations')).toEqual([...SETS.INTEGRATION_PERMISSIONS].sort())
    expect(sections.get('/admin/roles')).toEqual([...SETS.ROLE_PERMISSIONS].sort())
  })
})
