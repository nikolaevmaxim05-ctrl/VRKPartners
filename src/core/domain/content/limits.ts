// core/domain/content/limits — валідація збереження текстів (розділ 9 «Валидация сохранения»).
//
// Тип поля виводиться з ІМЕНІ ключа (таблиця нижче); ключі, де імʼя обманює про тип, —
// явні винятки. Ліміт = max(ліміт типу, ceil(довжина дефолту × 1.2)) — дефолт довший за
// ліміт не обрізається. Один модуль і для сервера, і для лічильника «N / ліміт» у редакторі.
//
// Імена ключів у проєкті camelCase (hero.title, services.items[].desc, faq[].q…) — тому
// ознаки з таблиці стандарту (`_desc`, `_title`) перевіряються як суфікси/слова без
// підкреслення (retitle → title). Порядок перевірок — як у стандарті.
import { isPlainObject, isEditableNamespace, type PlainObject } from './messages'
import { isSafeImageUrl, isTelegramUrl } from './landing'
import { normalizeHidden } from './visibility'

export type FieldType = 'number' | 'paragraph' | 'title' | 'badge' | 'label' | 'other'

const TYPE_LIMITS: Record<Exclude<FieldType, 'other'>, number> = {
  number: 12,
  paragraph: 600,
  title: 80,
  badge: 40,
  label: 60,
}

/** Ознаки типу в імені ключа (перевіряються по порядку). */
const TYPE_RULES: [FieldType, RegExp][] = [
  ['number', /(^|[^a-z])(num|price|count)([^a-z]|$)/i],
  ['paragraph', /(desc|description|text|sub|subtitle|answer|note|side)$/i],
  ['title', /(title|name|heading)$/i],
  ['badge', /(eyebrow|tag|badge|suffix|prefix|per|cta|button|btn|submit)$/i],
  ['label', /(label|value|hint|placeholder|unit)$/i],
]

/**
 * Явні винятки — імʼя обманює про тип. Ключ — імʼя поля або повний шлях (`ns.key`).
 * Повний шлях має пріоритет над іменем.
 */
export const FIELD_TYPE_EXCEPTIONS: Record<string, FieldType> = {
  q: 'title', // faq[].q — питання
  a: 'paragraph', // faq[].a — відповідь
  client: 'title', // назва клієнта в кейсі
  niche: 'title',
  role: 'label',
  experience: 'label',
  skills: 'paragraph',
  task: 'paragraph',
  highlight: 'label', // фрагмент value, що підсвічується
  partnerLinkText: 'label', // текст посилання, не абзац
  consentLinkText: 'label',
  telegramCtaText: 'badge', // текст кнопки
  consentPrefix: 'other', // «Натискаючи кнопку, ви погоджуєтесь з» — не бейдж
  partnerBadge: 'other', // hero.partnerBadge — шлях до картинки, не бейдж
  'trust.caseHint': 'paragraph',
  'hero.trust': 'paragraph',
  'site.description': 'paragraph',
  'site.name': 'title',
  'site.email': 'label',
  'site.phone': 'label',
  'site.telegramHandle': 'label',
}

/** Тип поля за іменем ключа (та повним шляхом для винятків). */
export function fieldType(key: string, path?: string): FieldType {
  if (path && path in FIELD_TYPE_EXCEPTIONS) return FIELD_TYPE_EXCEPTIONS[path]
  if (key in FIELD_TYPE_EXCEPTIONS) return FIELD_TYPE_EXCEPTIONS[key]
  for (const [type, re] of TYPE_RULES) if (re.test(key)) return type
  return 'other'
}

/** Ліміт довжини рядка: max(ліміт типу, ceil(довжина дефолту × 1.2)); «прочее» — 2×дефолт + 500. */
export function fieldLimit(key: string, defaultValue: string | undefined, path?: string): number {
  const type = fieldType(key, path)
  const defLen = defaultValue?.length ?? 0
  const base = type === 'other' ? defLen * 2 + 500 : TYPE_LIMITS[type]
  return Math.max(base, Math.ceil(defLen * 1.2))
}

/** Вид поля для віджета редактора та правил URL. */
export type FieldKind = 'image' | 'href' | 'icon' | 'text'

export function fieldKind(key: string): FieldKind {
  if (/(image|src|logo|photo|mockup|mockupFull|partnerBadge)$/i.test(key) && key !== 'imageAlt') return 'image'
  if (/(href|url|link)$/i.test(key)) return 'href'
  if (key === 'icon') return 'icon'
  return 'text'
}

export const MAX_ARRAY_ITEMS = 50

/** `*Href/*Url/*Link` — лише https:, http:, tel:, mailto: або відносний шлях. */
export function isAllowedHref(v: string): boolean {
  if (v === '') return true
  if (v.startsWith('/') && !v.startsWith('//')) return true
  if (v.startsWith('#')) return true
  return /^(https?:|tel:|mailto:)/i.test(v)
}

/** `*image/*src` — лише відносний шлях або власне сховище (Supabase Storage). */
export function isAllowedImage(v: string): boolean {
  return isSafeImageUrl(v)
}

/** Іконка картки: ключ пресета (літери/дефіс) або картинка за правилами `image`. */
export function isAllowedIcon(v: string): boolean {
  if (v === '') return true
  if (/^[a-z0-9-]+$/i.test(v)) return true
  return isAllowedImage(v)
}

export type ValidationError = { path: string; message: string }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: ValidationError }

/** Технічні ключі елементів (React-ключ, ключ іконки) — рядки без обмежень довжини за типом. */
export const TECHNICAL_KEYS: readonly string[] = ['key', 'id']

const fail = (path: string, message: string): ValidationResult<never> => ({ ok: false, error: { path, message } })

/**
 * Санітизує вхідні тексти за формою дефолтів і перевіряє ліміти/URL/масиви/приховані блоки.
 * Повертає очищене значення (чужі ключі відкинуто, типи узгоджено), придатне для diffMessages.
 *   • чужий верхньорівневий ключ → помилка (400);
 *   • обʼєкт: лише ключі дефолтів; тип не збігся → лишається дефолт;
 *   • масив: ≤ 50 елементів; елементи-обʼєкти санітизуються за шаблоном (обʼєднання ключів
 *     усіх дефолтних елементів; необовʼязкові ключі не дозаповнюються); масив рядків — лише рядки;
 *   • рядок: довжина ≤ ліміту типу; href/image/icon — за правилами URL; telegramCtaUrl — лише t.me;
 *   • `hidden` сторінки — лише відомі id, без дублів, у порядку списку.
 */
export function validateMessages<T extends PlainObject>(defaults: T, incoming: unknown): ValidationResult<T> {
  if (!isPlainObject(incoming)) return fail('', 'overrides is required')
  for (const ns of Object.keys(incoming)) {
    if (!isEditableNamespace(ns)) return fail(ns, `Розділ «${ns}» не редагується`)
    if (!(ns in defaults)) return fail(ns, `Невідомий розділ «${ns}»`)
  }
  const out: PlainObject = {}
  for (const [ns, d] of Object.entries(defaults)) {
    if (!(ns in incoming)) continue
    const res = sanitizeValue(d, incoming[ns], ns, ns, ns)
    if (!res.ok) return res
    out[ns] = res.value
  }
  return { ok: true, value: out as T }
}

/**
 * @param fillMissing обʼєкт фіксованої форми (розділ, вкладений блок) — відсутні ключі беруться з
 * дефолтів; елемент масиву — необовʼязкові ключі (icon, image, href…) лишаються відсутніми.
 */
function sanitizeValue(
  def: unknown,
  inc: unknown,
  key: string,
  path: string,
  ns: string,
  fillMissing = true,
): ValidationResult<unknown> {
  if (isPlainObject(def)) {
    if (!isPlainObject(inc)) return { ok: true, value: JSON.parse(JSON.stringify(def)) }
    const out: PlainObject = {}
    for (const [k, d] of Object.entries(def)) {
      if (!(k in inc)) {
        if (fillMissing) out[k] = JSON.parse(JSON.stringify(d))
        continue
      }
      const res = sanitizeValue(d, inc[k], k, `${path}.${k}`, ns)
      if (!res.ok) return res
      out[k] = res.value
    }
    return { ok: true, value: out }
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(inc)) return { ok: true, value: JSON.parse(JSON.stringify(def)) }
    if (inc.length > MAX_ARRAY_ITEMS) return fail(path, `Не більше ${MAX_ARRAY_ITEMS} елементів`)
    if (key === 'hidden') {
      const norm = normalizeHidden(ns, inc)
      return norm.ok ? { ok: true, value: norm.value } : fail(path, norm.message)
    }
    // Шаблон елемента — обʼєднання ключів усіх дефолтних елементів (необовʼязкові поля —
    // icon, href, image, mockup… — є не в кожного); для лімітів беремо найдовший дефолт.
    const template = unionTemplate(def)
    const out: unknown[] = []
    for (let i = 0; i < inc.length; i++) {
      const item = inc[i]
      const tpl = template
      if (isPlainObject(tpl)) {
        if (!isPlainObject(item)) return fail(`${path}[${i}]`, 'Очікується обʼєкт')
        const res = sanitizeValue(tpl, item, key, `${path}[${i}]`, ns, false)
        if (!res.ok) return res
        out.push(res.value)
      } else if (tpl === undefined) {
        // Порожній дефолтний масив без шаблону — приймаємо лише рядки.
        if (typeof item !== 'string') return fail(`${path}[${i}]`, 'Очікується рядок')
        const res = checkString(item, key, `${path}[${i}]`, undefined, ns)
        if (!res.ok) return res
        out.push(item)
      } else if (typeof tpl === 'string') {
        if (typeof item !== 'string') return fail(`${path}[${i}]`, 'Очікується рядок')
        const res = checkString(item, key, `${path}[${i}]`, longestString(def), ns)
        if (!res.ok) return res
        out.push(item)
      } else {
        if (typeof item !== typeof tpl) return fail(`${path}[${i}]`, 'Невірний тип значення')
        out.push(item)
      }
    }
    return { ok: true, value: out }
  }
  if (typeof def === 'string') {
    if (typeof inc !== 'string') return { ok: true, value: def }
    const res = checkString(inc, key, path, def, ns)
    return res.ok ? { ok: true, value: inc } : res
  }
  if (typeof def === 'number' || typeof def === 'boolean') {
    return { ok: true, value: typeof inc === typeof def ? inc : def }
  }
  // Необовʼязкове поле, якого немає в шаблоні (undefined) — приймаємо рядки/булеві як є.
  if (typeof inc === 'string') {
    const res = checkString(inc, key, path, undefined, ns)
    return res.ok ? { ok: true, value: inc } : res
  }
  if (typeof inc === 'boolean' || typeof inc === 'number') return { ok: true, value: inc }
  return { ok: true, value: undefined }
}

/** Обʼєднання форм елементів масиву: усі ключі; для рядків — найдовше значення (ліміти щедріші). */
function unionTemplate(arr: unknown[]): unknown {
  const objects = arr.filter(isPlainObject)
  if (objects.length === 0) return arr[0]
  const tpl: PlainObject = {}
  for (const o of objects) {
    for (const [k, v] of Object.entries(o)) {
      const cur = tpl[k]
      if (cur === undefined) tpl[k] = v
      else if (typeof cur === 'string' && typeof v === 'string' && v.length > cur.length) tpl[k] = v
      else if (Array.isArray(cur) && Array.isArray(v)) tpl[k] = [...cur, ...v]
    }
  }
  return tpl
}

function longestString(arr: unknown[]): string | undefined {
  let best: string | undefined
  for (const v of arr) if (typeof v === 'string' && (best === undefined || v.length > best.length)) best = v
  return best
}

function checkString(v: string, key: string, path: string, def: string | undefined, ns: string): ValidationResult<true> {
  const kind = fieldKind(key)
  if (path === 'site.telegramCtaUrl' && !isTelegramUrl(v)) {
    return fail(path, 'Посилання кнопки Telegram — лише https://t.me/… або https://telegram.me/…')
  }
  if (kind === 'href' && !isAllowedHref(v)) return fail(path, 'Посилання: лише https:, http:, tel:, mailto: або відносний шлях')
  if (kind === 'image' && !isAllowedImage(v)) return fail(path, 'Зображення: лише /… або власне сховище (https://…supabase.co)')
  if (kind === 'icon' && !isAllowedIcon(v)) return fail(path, 'Іконка: ключ пресета або зображення з власного сховища')
  if (TECHNICAL_KEYS.includes(key)) {
    if (v.length > 100) return fail(path, 'Технічний ключ задовгий')
    return { ok: true, value: true }
  }
  if (kind === 'text') {
    const limit = fieldLimit(key, def, `${ns}.${key}`)
    if (v.length > limit) return fail(path, `Задовгий текст: ${v.length} / ${limit}`)
  } else if (v.length > 500) {
    return fail(path, 'Задовге посилання (максимум 500 символів)')
  }
  return { ok: true, value: true }
}
