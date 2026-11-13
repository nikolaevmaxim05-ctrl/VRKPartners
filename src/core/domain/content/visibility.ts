// core/domain/content/visibility — скрытие блоков (раздел 9 «Скрытие блоков»).
//
// Клиент скрывает любой блок страницы, текст при этом сохраняется. Список скрытого —
// массив `hidden` в разделе текстов страницы (`home.hidden`). HIDEABLE_BLOCKS — единый
// список и для проверки при сохранении, и для редактора. Не скрываются шапка, футер и
// всплывающая форма. Однотипные элементы списков (карточки, шаги, кейсы) здесь не генерируются:
// списки редактируются (добавить/удалить), так что лишний элемент клиент удаляет из редактора.

export type HideableBlock = { id: string; label: string; parent?: string }

/** Раздел текстов главной страницы. */
export const HOME_NS = 'home'

/** Секции главной в порядке появления на сайте. id блока = id DOM-якоря секции (кроме hero → #top). */
export const HIDEABLE_BLOCKS: Record<string, HideableBlock[]> = {
  [HOME_NS]: [
    { id: 'hero', label: 'Перший екран' },
    { id: 'usp', label: 'Переваги' },
    { id: 'about', label: 'Про нас (команда)' },
    { id: 'services', label: 'Послуги' },
    { id: 'audit', label: 'Аудит' },
    { id: 'cases', label: 'Кейси' },
    { id: 'benefits', label: 'Що ви отримуєте' },
    { id: 'process', label: 'Процес' },
    { id: 'faq', label: 'FAQ' },
    { id: 'finalCta', label: 'Фінальний блок (CTA та контакти)' },
  ],
}

/** Пункты меню (шапка + футер) → блок, на который ведут. Ссылка на скрытый блок не выводится. */
export const NAV_ITEMS: readonly { id: 'usp' | 'about' | 'services' | 'audit' | 'cases' | 'benefits' | 'process' | 'faq'; anchor: string }[] = [
  { id: 'usp', anchor: '#usp' },
  { id: 'about', anchor: '#about' },
  { id: 'services', anchor: '#services' },
  { id: 'audit', anchor: '#audit' },
  { id: 'cases', anchor: '#cases' },
  { id: 'benefits', anchor: '#benefits' },
  { id: 'process', anchor: '#process' },
  { id: 'faq', anchor: '#faq' },
]

function blocksOf(ns: string): HideableBlock[] {
  return HIDEABLE_BLOCKS[ns] ?? []
}

/** Скрыт, если скрыт сам ИЛИ скрыт родительский блок. */
export function isHidden(hidden: readonly string[], ns: string, id: string): boolean {
  if (hidden.includes(id)) return true
  const block = blocksOf(ns).find((b) => b.id === id)
  return !!block?.parent && hidden.includes(block.parent)
}

export type PageVisibility = {
  hidden: string[]
  shown(id: string): boolean
  /** Номера скрытых однотипных элементов: ('step', 4) → [2] для hidden = ['step_2']. */
  hiddenItems(prefix: string, count: number): number[]
}

/** Одна точка входа для страницы: pageVisibility('home', messages.home.hidden). */
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

/** При сохранении: неизвестный id → ошибка, дубли убираются, порядок — как в списке. */
export function normalizeHidden(ns: string, raw: unknown): { ok: true; value: string[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: 'hidden має бути масивом' }
  const known = blocksOf(ns).map((b) => b.id)
  for (const v of raw) {
    if (typeof v !== 'string' || !known.includes(v)) return { ok: false, message: `Невідомий блок «${String(v)}»` }
  }
  const set = new Set(raw as string[])
  return { ok: true, value: known.filter((id) => set.has(id)) }
}
