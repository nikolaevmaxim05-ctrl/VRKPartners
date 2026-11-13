// Контракт «роут админки → права» (раздел 5 стандарта: middleware — сессия, роут — права).
// Таблица ниже — из аудита Фазы 0. Любое изменение прав роута должно быть осознанным: тест краснеет.
// [] = достаточно быть активным пользователем с ролью (GET-справочники).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as SETS from '../permissions'

const API_ROOT = path.resolve(process.cwd(), 'src', 'app', 'api', 'admin')

const VIEW = SETS.LEAD_VIEW_PERMISSIONS
const CONV = SETS.CONVERSION_PERMISSIONS
const INT = SETS.INTEGRATION_PERMISSIONS
const ROLE = SETS.ROLE_PERMISSIONS
const REF = SETS.REFERRAL_PERMISSIONS
const REF_READ = SETS.REFERRAL_READ_PERMISSIONS

type Methods = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string[] | null>>

// null = метод без withAdmin (заглушка 405).
const EXPECTED: Record<string, Methods> = {
  'analytics-events': { GET: [], PATCH: ['manage_settings'] },
  'analytics/dimension-values': { GET: ['view_reports'] },
  'analytics/export': { POST: ['view_reports'] },
  'analytics/report': { GET: ['view_reports'] },
  assignees: { GET: [] },
  'audit-log': { GET: ['manage_users'] },
  content: { GET: ['manage_content'], PUT: ['manage_content'] },
  'content/upload': { POST: ['manage_content'] },
  'conversion-adjustments': { GET: CONV },
  'conversion-adjustments/[id]/resend': { POST: CONV },
  'conversion-adjustments/export-pending': { POST: CONV },
  conversions: { GET: CONV },
  'conversions/[id]': { PATCH: null },
  'conversions/[id]/resend': { POST: CONV },
  'conversions/export-pending': { POST: CONV },
  'custom-fields': { GET: [], POST: ['manage_settings'] },
  'custom-fields/[id]': { PATCH: ['manage_settings'], DELETE: ['manage_settings'] },
  'dev/ga4-arrival': { POST: ['manage_settings', 'view_reports'] },
  integrations: { GET: INT },
  'integrations/[key]': { PUT: INT, DELETE: INT },
  'integrations/[key]/test': { POST: INT },
  'integrations/google-sheets/test': { POST: INT },
  'lead-statuses': { GET: [], POST: ['manage_settings'] },
  'lead-statuses/[id]': { PATCH: ['manage_settings'], DELETE: ['manage_settings'] },
  'lead-statuses/reorder': { PUT: ['manage_settings'] },
  leads: { GET: VIEW },
  'leads/[id]': { GET: VIEW, PATCH: SETS.LEAD_EDIT_PERMISSIONS, DELETE: SETS.LEAD_DELETE_PERMISSIONS },
  'leads/[id]/comments': { GET: VIEW, POST: ['manage_leads'] },
  'leads/[id]/custom-fields': { PATCH: ['manage_leads'] },
  legal: { GET: ['manage_content'], PUT: ['manage_content'] },
  roles: { GET: [], POST: ROLE },
  'roles/[id]': { PATCH: ROLE, DELETE: ROLE },
  'roles/reorder': { PATCH: ROLE },
  seo: { GET: ['manage_content'], PUT: ['manage_content'] },
  settings: { GET: [], PUT: ['manage_settings'] },
  'tracking-tags': { GET: [], POST: INT },
  'tracking-tags/[id]': { PATCH: INT, DELETE: INT },
  users: { GET: [], POST: ['manage_users'] },
  'users/[id]': { PATCH: ['manage_users'], DELETE: ['manage_users'] },
  'referral-links': { GET: REF_READ, POST: REF },
  'referral-links/[id]': { PATCH: REF, DELETE: REF },
  'referral-links/stats': { GET: REF },
  'referral-links/settings': { GET: REF, PATCH: REF },
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...routeFiles(full))
    else if (e.name === 'route.ts') out.push(full)
  }
  return out
}

/** Первый аргумент withAdmin(...) до запятой на нулевой глубине. */
function firstArg(segment: string): string | null {
  const start = segment.indexOf('withAdmin(')
  if (start < 0) return null
  let depth = 0
  let arg = ''
  for (const ch of segment.slice(start + 'withAdmin('.length)) {
    if (ch === '[' || ch === '(' || ch === '{') depth++
    if (ch === ']' || ch === ')' || ch === '}') depth--
    if (ch === ',' && depth === 0) break
    arg += ch
  }
  return arg.trim()
}

/** Разрешает текст аргумента в список прав: [], ['a','b'], [...X], X. */
function resolvePerms(arg: string): string[] {
  const named = SETS as unknown as Record<string, string[]>
  if (/^[A-Z_]+$/.test(arg)) return [...(named[arg] ?? ['<unknown ' + arg + '>'])]
  const inner = arg.replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!inner) return []
  return inner.split(',').flatMap((part) => {
    const p = part.trim()
    if (p.startsWith('...')) return [...(named[p.slice(3)] ?? ['<unknown ' + p + '>'])]
    return [p.replace(/^['"]|['"]$/g, '')]
  })
}

function actualMethods(file: string): Methods {
  const src = fs.readFileSync(file, 'utf8')
  const re = /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  const marks = [...src.matchAll(re)].map((m) => ({ method: m[1] as keyof Methods, at: m.index ?? 0 }))
  const out: Methods = {}
  marks.forEach((m, i) => {
    const segment = src.slice(m.at, marks[i + 1]?.at ?? src.length)
    const arg = firstArg(segment)
    out[m.method] = arg === null ? null : resolvePerms(arg).sort()
  })
  return out
}

describe('контракт прав роутов /api/admin/**', () => {
  const files = routeFiles(API_ROOT)
  const byKey = new Map(files.map((f) => [path.relative(API_ROOT, path.dirname(f)).split(path.sep).join('/'), f]))

  it('таблица покрывает все роуты (новый роут → добавь в таблицу)', () => {
    expect([...byKey.keys()].sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const [key, methods] of Object.entries(EXPECTED)) {
    it(`${key}: методы и права`, () => {
      const file = byKey.get(key)
      expect(file, `нет роута ${key}`).toBeDefined()
      const expected: Methods = {}
      for (const [m, perms] of Object.entries(methods)) expected[m as keyof Methods] = perms === null ? null : [...perms].sort()
      expect(actualMethods(file!)).toEqual(expected)
    })
  }

  it('ни один роут не импортирует инфраструктуру или SDK Supabase напрямую', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, path.relative(API_ROOT, f)).not.toMatch(/from ['"](@infra\/|@supabase\/)/)
    }
  })
})
