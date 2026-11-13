// core/domain/content/messages — мерж и дифф текстов сайта (раздел 9 стандарта).
//
// Модель: дефолты — messages/<язык>.json; правки клиента — site_content, только изменённые ключи.
// Правила мержа:
//   • объекты сливаются рекурсивно;
//   • строка из правки побеждает всегда, даже пустая («пусто = убрано»);
//   • массив из правки заменяет дефолтный целиком (короче, длиннее или пустой);
//   • число/булево — если тип совпадает;
//   • ключи правки, которых нет в дефолтах, игнорируются; тип не совпал → дефолт.
// Дифф при сохранении оставляет только отличия: возвращённое к дефолту значение исчезает из БД,
// поэтому правки дефолтов в файле продолжают доезжать до сайта.

export type PlainObject = Record<string, unknown>

export function isPlainObject(v: unknown): v is PlainObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)
}

/** Мерж дефолтов с правками (форма результата = форма дефолтов). */
export function mergeMessages<T>(defaults: T, overrides: unknown): T {
  if (isPlainObject(defaults)) {
    if (!isPlainObject(overrides)) return clone(defaults)
    const out: PlainObject = {}
    for (const [key, d] of Object.entries(defaults)) {
      out[key] = key in overrides ? mergeMessages(d, overrides[key]) : clone(d)
    }
    return out as T
  }
  if (Array.isArray(defaults)) {
    return (Array.isArray(overrides) ? clone(overrides) : clone(defaults)) as T
  }
  if (typeof defaults === 'string') {
    return (typeof overrides === 'string' ? overrides : defaults) as T
  }
  if (typeof defaults === 'number' || typeof defaults === 'boolean') {
    return (typeof overrides === typeof defaults ? overrides : defaults) as T
  }
  return defaults
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Дифф полных значений редактора против дефолтов — только то, что отличается.
 * Возвращает undefined, если отличий нет (пустые объекты не сохраняются).
 */
export function diffMessages(defaults: unknown, incoming: unknown): unknown {
  if (isPlainObject(defaults)) {
    if (!isPlainObject(incoming)) return undefined
    const out: PlainObject = {}
    for (const [key, d] of Object.entries(defaults)) {
      if (!(key in incoming)) continue
      const diff = diffMessages(d, incoming[key])
      if (diff !== undefined) out[key] = diff
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  if (Array.isArray(defaults)) {
    return Array.isArray(incoming) && !sameJson(defaults, incoming) ? clone(incoming) : undefined
  }
  if (typeof defaults === 'string') {
    return typeof incoming === 'string' && incoming !== defaults ? incoming : undefined
  }
  if (typeof defaults === 'number' || typeof defaults === 'boolean') {
    return typeof incoming === typeof defaults && incoming !== defaults ? incoming : undefined
  }
  return undefined
}

/** Списки контента: оставляет только непустые строки (в список может приехать пустой пункт). */
export function contentList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

/** Одиночный текст показываем только если он непустой после trim. */
export function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * Количество изменённых «листьев» (строк/чисел/булевых) в current против defaults.
 * Массивы сравниваются поэлементно; лишние/отсутствующие элементы считаются по одному.
 * Счётчик «N змінено» в редакторе (раздел 9).
 */
export function countChanges(defaults: unknown, current: unknown): number {
  if (isPlainObject(defaults)) {
    if (!isPlainObject(current)) return 0
    let n = 0
    for (const [key, d] of Object.entries(defaults)) {
      if (key in current) n += countChanges(d, current[key])
    }
    return n
  }
  if (Array.isArray(defaults)) {
    if (!Array.isArray(current)) return 0
    let n = 0
    const len = Math.max(defaults.length, current.length)
    for (let i = 0; i < len; i++) {
      if (i >= defaults.length || i >= current.length) n += 1
      else if (isPlainObject(defaults[i]) || Array.isArray(defaults[i])) n += countChanges(defaults[i], current[i])
      else if (!sameJson(defaults[i], current[i])) n += 1
    }
    return n
  }
  return sameJson(defaults, current) ? 0 : 1
}

/**
 * Пространства текстов, которые редактируются из админки. Не редактируется только SEO-разметка
 * (`pageMeta`) — она живёт в отдельной строке `seo` (отклонение 2).
 */
export const EDITABLE_NAMESPACES = [
  'site', 'nav', 'header', 'hero', 'usp', 'about', 'services', 'audit', 'trust', 'benefits', 'workflow',
  'finalCta', 'faq', 'footer', 'form', 'thanks', 'notFound', 'legal', 'home',
] as const

export type EditableNamespace = (typeof EDITABLE_NAMESPACES)[number]

export function isEditableNamespace(ns: string): ns is EditableNamespace {
  return (EDITABLE_NAMESPACES as readonly string[]).includes(ns)
}

/** Оставляет из объекта только редактируемые пространства (для редактора и ответа API). */
export function pickEditable<T extends PlainObject>(messages: T): Pick<T, EditableNamespace & keyof T> {
  const out: PlainObject = {}
  for (const ns of EDITABLE_NAMESPACES) if (ns in messages) out[ns] = messages[ns]
  return out as Pick<T, EditableNamespace & keyof T>
}
