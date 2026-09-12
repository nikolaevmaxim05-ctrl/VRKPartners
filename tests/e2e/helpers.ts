// Хелпери e2e: контент поверх дефолтів (cookie або файл — як у розділі 19), стрес-тексти за
// лімітами полів (розділ 12), перевірки переповнення.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { EDITABLE_NAMESPACES, isPlainObject } from '../../src/core/domain/content/messages'
import { fieldLimit, fieldKind, TECHNICAL_KEYS } from '../../src/core/domain/content/limits'

const HOST = '127.0.0.1'

/** Кладе правки контенту в cookie (малі) або у файл tmp (великі), як читає i18n/request.ts. */
export async function setContent(context: BrowserContext, overrides: unknown, name = 'e2e'): Promise<void> {
  const json = JSON.stringify(overrides)
  let value: string
  if (json.length > 3000) {
    const dir = join(tmpdir(), 'vrk-e2e')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${name}.json`), json, 'utf8')
    value = `file:${name}`
  } else {
    value = encodeURIComponent(json)
  }
  await context.addCookies([{ name: 'e2e_content', value, domain: HOST, path: '/' }])
}

export type StressKind = 'word' | 'stream'

/** Найгірший текст заданої довжини: одне нерозривне слово або суцільний потік слів. */
export function stressText(limit: number, kind: StressKind): string {
  const n = Math.max(1, limit)
  if (kind === 'word') return 'Ж'.repeat(n)
  const words: string[] = []
  let len = 0
  let i = 0
  while (len < n) {
    const w = ['довгий', 'текст', 'клієнта', 'перевірка', 'верстки', 'абзац'][i++ % 6]
    if (len + w.length + 1 > n) break
    words.push(w)
    len += w.length + 1
  }
  return words.join(' ') || 'Ж'.repeat(n)
}

/**
 * Правки для КОЖНОГО текстового поля сторінки: значення максимальної довжини за лімітом типу.
 * Посилання/картинки/іконки/технічні ключі не чіпаємо; масиви лишаємо тієї ж довжини.
 */
export function stressOverrides(kind: StressKind): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const walk = (def: unknown, ns: string, key: string): unknown => {
    if (isPlainObject(def)) {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(def)) {
        if (k === 'hidden') continue
        o[k] = walk(v, ns, k)
      }
      return o
    }
    if (Array.isArray(def)) return def.map((v) => walk(v, ns, key))
    if (typeof def === 'string') {
      if (TECHNICAL_KEYS.includes(key) || fieldKind(key) !== 'text') return def
      return stressText(fieldLimit(key, def, `${ns}.${key}`), kind)
    }
    return def
  }
  for (const ns of EDITABLE_NAMESPACES) {
    if (ns === 'home') continue
    out[ns] = walk((uk as Record<string, unknown>)[ns], ns, ns)
  }
  return out
}

/** Горизонтальний скрол сторінки (розділ 12, «скан переповнення»). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.documentElement
    return Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth
  })
}

/** Елементи, які вилізли за правий/лівий край вікна (текстові вузли в main + шапка/футер). */
export async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    const els = document.querySelectorAll<HTMLElement>('main *, header *, footer *')
    // Обрізані/прокручувані контейнери (hidden/clip/auto/scroll) не дають вмісту вилізти за вікно:
    // горизонтальний трек (карусель послуг) тримає картки поза екраном навмисно.
    const clipped = (el: HTMLElement): boolean => {
      let cur = el.parentElement
      while (cur && cur !== document.body) {
        const ox = getComputedStyle(cur).overflowX
        if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return true
        cur = cur.parentElement
      }
      return false
    }
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (clipped(el)) continue
      if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} "${(el.textContent ?? '').trim().slice(0, 30)}" right=${Math.round(r.right)} left=${Math.round(r.left)} vw=${vw}`)
    }
    return out
  })
}
