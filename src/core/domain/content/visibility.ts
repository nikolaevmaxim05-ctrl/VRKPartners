// core/domain/content/visibility — приховування блоків (розділ 9 «Скрытие блоков»).
//
// Клієнт ховає будь-який блок сторінки, текст при цьому зберігається. Список прихованого —
// масив `hidden` у розділі текстів сторінки (`home.hidden`). HIDEABLE_BLOCKS — єдиний
// список і для перевірки при збереженні, і для редактора. Не ховаються шапка, футер і
// спливаюча форма. Однотипні елементи списків (картки, кроки, кейси) тут не генеруються:
// списки редагуються (додати/видалити), тож зайвий елемент клієнт видаляє з редактора.

export type HideableBlock = { id: string; label: string; parent?: string }

/** Розділ текстів головної сторінки. */
export const HOME_NS = 'home'

/** Секції головної у порядку появи на сайті. id блоку = id DOM-якоря секції (крім hero → #top). */
export const HIDEABLE_BLOCKS: Record<string, HideableBlock[]> = {
  [HOME_NS]: [
    { id: 'hero', label: 'Перший екран' },
    { id: 'usp', label: 'Переваги' },
    { id: 'about', label: 'Про нас (команда)' },
    { id: 'services', label: 'Послуги' },
    { id: 'audit', label: 'Аудит' },
    { id: 'cases', label: 'Кейси' },
    { id: 'process', label: 'Процес' },
    { id: 'faq', label: 'FAQ' },
    { id: 'finalCta', label: 'Фінальний блок (CTA та контакти)' },
  ],
}

/** Пункти меню (шапка + футер) → блок, на який ведуть. Посилання на прихований блок не виводиться. */
export const NAV_ITEMS: readonly { id: 'usp' | 'about' | 'services' | 'audit' | 'cases' | 'process' | 'faq'; anchor: string }[] = [
  { id: 'usp', anchor: '#usp' },
  { id: 'about', anchor: '#about' },
  { id: 'services', anchor: '#services' },
  { id: 'audit', anchor: '#audit' },
  { id: 'cases', anchor: '#cases' },
  { id: 'process', anchor: '#process' },
  { id: 'faq', anchor: '#faq' },
]

function blocksOf(ns: string): HideableBlock[] {
  return HIDEABLE_BLOCKS[ns] ?? []
}

/** Прихований, якщо прихований сам АБО прихований батьківський блок. */
export function isHidden(hidden: readonly string[], ns: string, id: string): boolean {
  if (hidden.includes(id)) return true
  const block = blocksOf(ns).find((b) => b.id === id)
  return !!block?.parent && hidden.includes(block.parent)
}

export type PageVisibility = {
  hidden: string[]
  shown(id: string): boolean
  /** Номери прихованих однотипних елементів: ('step', 4) → [2] для hidden = ['step_2']. */
  hiddenItems(prefix: string, count: number): number[]
}

/** Одна точка входу для сторінки: pageVisibility('home', messages.home.hidden). */
export function pageVisibility(ns: string, raw: unknown): PageVisibility {
  const known = new Set(blocksOf(ns).map((b) => b.id))
  const hidden = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && known.has(v)) : []
  return {
    hidden,
    shown: (id) => !isHidden(hidden, ns, id),
    hiddenItems: (prefix, count) => {
      const out: number[] = []
      for (let n = 1; n <= count; n++) if (isHidden(hidden, ns, `${prefix}_${n}`)) out.push(n)
      return out
    },
  }
}

/** При збереженні: невідомий id → помилка, дублі прибираються, порядок — як у списку. */
export function normalizeHidden(ns: string, raw: unknown): { ok: true; value: string[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: 'hidden має бути масивом' }
  const known = blocksOf(ns).map((b) => b.id)
  for (const v of raw) {
    if (typeof v !== 'string' || !known.includes(v)) return { ok: false, message: `Невідомий блок «${String(v)}»` }
  }
  const set = new Set(raw as string[])
  return { ok: true, value: known.filter((id) => set.has(id)) }
}
