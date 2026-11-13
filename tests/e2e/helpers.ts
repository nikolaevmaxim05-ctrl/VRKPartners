// Хелперы e2e: контент поверх дефолтов (cookie или файл — как в разделе 19), стресс-тексты по
// лимитам полей (раздел 12), проверки переполнения.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { EDITABLE_NAMESPACES, isPlainObject } from '../../src/core/domain/content/messages'
import { fieldLimit, fieldKind, TECHNICAL_KEYS } from '../../src/core/domain/content/limits'

const HOST = '127.0.0.1'

/** Кладёт правки контента в cookie (малые) или в файл tmp (большие), как читает i18n/request.ts. */
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

/** Наихудший текст заданной длины: одно неразрывное слово или сплошной поток слов. */
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
 * Правки для КАЖДОГО текстового поля страницы: значение максимальной длины по лимиту типа.
 * Ссылки/картинки/иконки/технические ключи не трогаем; массивы оставляем той же длины.
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

/** Горизонтальный скролл страницы (раздел 12, «скан переполнения»). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.documentElement
    return Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth
  })
}

/** Элементы, вылезшие за правый/левый край окна (текстовые узлы в main + шапка/футер). */
export async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    const els = document.querySelectorAll<HTMLElement>('main *, header *, footer *')
    // Обрезанные/прокручиваемые контейнеры (hidden/clip/auto/scroll) не дают содержимому вылезти за окно:
    // горизонтальный трек (карусель услуг) держит карточки за экраном намеренно.
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
