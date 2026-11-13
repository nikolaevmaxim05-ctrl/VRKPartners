// Контракт раскладки редактора (раздел 9, «Тесты, которые держат раскладку»):
//   • каждый редактируемый ключ показан ровно один раз (дубль — только в блоке с `shared`);
//   • множества вкладок CONTENT_PAGES и ключей PAGE_BLOCKS совпадают;
//   • id блоков совпадают с HIDEABLE_BLOCKS в обе стороны (страницы с `ns`);
//   • дефолты messages/uk.json проходят собственную валидацию (лимиты, URL, hidden).
import { describe, it, expect } from 'vitest'
import { CONTENT_PAGES, PAGE_BLOCKS, KEY_LABELS, keyLabel } from '@core/domain/content/layout'
import { HIDEABLE_BLOCKS } from '@core/domain/content/visibility'
import { EDITABLE_NAMESPACES, pickEditable, isPlainObject } from '@core/domain/content/messages'
import { validateMessages, TECHNICAL_KEYS } from '@core/domain/content/limits'
import { getDefaultMessages } from '../defaults'

const defaults = getDefaultMessages()

/** Редактируемые ключи: `ns.key` для объектов, `ns` для разделов-массивов; `hidden` — тумблеры. */
function editableKeys(): string[] {
  const out: string[] = []
  for (const ns of EDITABLE_NAMESPACES) {
    const v = (defaults as Record<string, unknown>)[ns]
    if (isPlainObject(v)) {
      for (const k of Object.keys(v)) if (k !== 'hidden') out.push(`${ns}.${k}`)
    } else {
      out.push(ns)
    }
  }
  return out
}

function layoutKeys(): { key: string; page: string; shared: boolean }[] {
  const out: { key: string; page: string; shared: boolean }[] = []
  for (const [page, blocks] of Object.entries(PAGE_BLOCKS)) {
    for (const b of blocks) {
      for (const p of b.parts) {
        if (p.keys.length === 0) out.push({ key: p.ns, page, shared: !!b.shared })
        for (const k of p.keys) out.push({ key: `${p.ns}.${k}`, page, shared: !!b.shared })
      }
    }
  }
  return out
}

describe('розкладка редактора', () => {
  it('множини вкладок CONTENT_PAGES і ключів PAGE_BLOCKS збігаються', () => {
    const pages = CONTENT_PAGES.flatMap((p) => (p.tabs ? p.tabs.map((t) => t.id) : [p.id])).sort()
    expect(Object.keys(PAGE_BLOCKS).sort()).toEqual(pages)
  })

  it('кожен редагований ключ показано рівно один раз', () => {
    const shown = layoutKeys()
    const counts = new Map<string, number>()
    for (const s of shown) counts.set(s.key, (counts.get(s.key) ?? 0) + 1)
    const expected = editableKeys()
    const missing = expected.filter((k) => !counts.has(k))
    const unknown = [...counts.keys()].filter((k) => !expected.includes(k))
    const dup = [...counts.entries()].filter(([k, n]) => n > 1 && !shown.some((s) => s.key === k && s.shared)).map(([k]) => k)
    expect(missing, `ключі без місця в редакторі: ${missing.join(', ')}`).toEqual([])
    expect(unknown, `ключі редактора, яких немає в messages: ${unknown.join(', ')}`).toEqual([])
    expect(dup, `ключі, показані двічі: ${dup.join(', ')}`).toEqual([])
  })

  it('id блоків збігаються з HIDEABLE_BLOCKS в обидва боки', () => {
    for (const page of CONTENT_PAGES) {
      if (!page.ns) continue
      const blockIds = PAGE_BLOCKS[page.id].filter((b) => !b.aux).map((b) => b.id).sort()
      const hideable = (HIDEABLE_BLOCKS[page.ns] ?? []).map((b) => b.id).sort()
      expect(blockIds).toEqual(hideable)
    }
  })

  it('у кожного ключа є людський підпис (крім технічних)', () => {
    const missing: string[] = []
    const walk = (v: unknown, ns: string) => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, ns))
      else if (isPlainObject(v)) {
        for (const [k, x] of Object.entries(v)) {
          if (k === 'hidden' || TECHNICAL_KEYS.includes(k)) continue
          if (keyLabel(ns, k) === k) missing.push(`${ns}.${k}`)
          walk(x, ns)
        }
      }
    }
    for (const ns of EDITABLE_NAMESPACES) walk((defaults as Record<string, unknown>)[ns], ns)
    expect([...new Set(missing)], `без підпису в KEY_LABELS: ${missing.join(', ')}`).toEqual([])
    expect(Object.keys(KEY_LABELS).length).toBeGreaterThan(50)
  })

  it('дефолти messages/uk.json проходять власну валідацію', () => {
    const editable = pickEditable(defaults as unknown as Record<string, unknown>)
    const r = validateMessages(editable, JSON.parse(JSON.stringify(editable)))
    expect(r.ok, r.ok ? '' : `${r.error.path}: ${r.error.message}`).toBe(true)
    if (r.ok) expect(r.value).toEqual(editable)
  })

  it('pageMeta не редагується з редактора текстів', () => {
    expect(EDITABLE_NAMESPACES).not.toContain('pageMeta')
    expect('pageMeta' in defaults).toBe(true)
  })
})
