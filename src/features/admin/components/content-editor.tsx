'use client'

// Редактор текстів сайту за розкладкою розділу 9: вкладка = сторінка сайту (CONTENT_PAGES),
// усередині — блоки в порядку появи на сайті з номером (PAGE_BLOCKS). Поля будуються з ФОРМИ
// дефолтів (messages/uk.json): рядок → поле з лічильником «N / ліміт» (limits.ts, той самий
// модуль, що й на сервері), масив рядків / масив карток → список з додаванням, переміщенням,
// видаленням; картинки → ImageField; іконки → IconPicker; посилання → поле з підказкою.
// Блок можна приховати тумблером (текст зберігається; список — `hidden` у розділі сторінки).
// Лічильник «N змінено» на блоку враховує і тексти, і приховання. Технічні ключі (key, id)
// не показуються, але зберігаються. Кнопка «Зберегти зміни» — у правому нижньому куті.
//
// Стан — ОДИН обʼєкт усіх редагованих розділів (усі вкладки), тож зміни на різних вкладках
// зберігаються разом одним PUT /api/admin/content.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, EyeOff } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { Switch } from '@/shared/ui/switch'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import { CollapsibleCard, CollapsibleItem } from '@/features/admin/components/collapsible-section'
import { ImageField } from '@/features/admin/components/content-image-field'
import { IconPicker } from '@/features/admin/components/content-icon-picker'
import { DEFAULT_USP_ICON_ORDER, DEFAULT_AUDIT_ICON_ORDER } from '@/shared/lib/audit-icons'
import { CONTENT_PAGES, PAGE_BLOCKS, keyLabel, type PageBlock } from '@core/domain/content/layout'
import { HIDEABLE_BLOCKS, isHidden } from '@core/domain/content/visibility'
import { countChanges, isPlainObject, hasText, type PlainObject } from '@core/domain/content/messages'
import { fieldKind, fieldLimit, fieldType, TECHNICAL_KEYS } from '@core/domain/content/limits'

type Messages = PlainObject
type Path = (string | number)[]

// ── Утиліти стану ────────────────────────────────────────────────────────────

function getAt(obj: unknown, path: Path): unknown {
  let cur: unknown = obj
  for (const p of path) {
    if (cur === null || cur === undefined) return undefined
    cur = (cur as Record<string | number, unknown>)[p]
  }
  return cur
}

/** Імутабельне оновлення за шляхом (обʼєкти й масиви копіюються по дорозі). */
function setAt<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T
  const [head, ...rest] = path
  if (Array.isArray(obj)) {
    const next = [...obj]
    next[head as number] = setAt(obj[head as number], rest, value)
    return next as T
  }
  const o = (obj ?? {}) as Record<string, unknown>
  return { ...o, [head as string]: setAt(o[head as string], rest, value) } as T
}

/** Обʼєднання форм елементів масиву (необовʼязкові поля є не в кожного) — шаблон нового елемента. */
function unionTemplate(arr: unknown[]): PlainObject | undefined {
  const objects = arr.filter(isPlainObject)
  if (objects.length === 0) return undefined
  const tpl: PlainObject = {}
  for (const o of objects) for (const [k, v] of Object.entries(o)) if (!(k in tpl)) tpl[k] = v
  return tpl
}

/** Порожній елемент за шаблоном: рядки → '', масиви → [], булеві → false, технічні ключі → унікальні. */
function emptyFromTemplate(tpl: PlainObject, prefix: string): PlainObject {
  const out: PlainObject = {}
  for (const [k, v] of Object.entries(tpl)) {
    if (TECHNICAL_KEYS.includes(k)) out[k] = `${prefix}-${Date.now().toString(36)}`
    else if (typeof v === 'string') out[k] = ''
    else if (typeof v === 'boolean') out[k] = false
    else if (typeof v === 'number') out[k] = 0
    else if (Array.isArray(v)) out[k] = []
    else if (isPlainObject(v)) out[k] = emptyFromTemplate(v, prefix)
  }
  return out
}

const ITEM_TITLE_KEYS = ['name', 'title', 'client', 'q', 'niche', 'label']

function itemTitle(item: unknown, fallback: string): string {
  if (isPlainObject(item)) {
    for (const k of ITEM_TITLE_KEYS) {
      const v = item[k]
      if (hasText(v)) return v
    }
  }
  return fallback
}

function iconOrder(ns: string): readonly string[] {
  if (ns === 'usp') return DEFAULT_USP_ICON_ORDER
  if (ns === 'audit') return DEFAULT_AUDIT_ICON_ORDER
  return []
}

// ── Поля ─────────────────────────────────────────────────────────────────────

function TextField({
  label, value, defaultValue, limit, textarea, placeholder, onChange,
}: {
  label: string
  value: string
  defaultValue?: string
  limit: number
  textarea: boolean
  placeholder?: string
  onChange: (v: string) => void
}) {
  const over = value.length > limit
  const canReset = defaultValue !== undefined && value !== defaultValue
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-2">
          {canReset && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="Повернути текст із файлу дефолтів"
            >
              <RotateCcw className="h-3 w-3" /> До дефолту
            </button>
          )}
          <span className={cn('text-xs tabular-nums', over ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
            {value.length} / {limit}
          </span>
        </div>
      </div>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={Math.min(8, Math.max(2, Math.ceil(value.length / 90)))}
          className={cn(over && 'border-destructive focus-visible:ring-destructive')}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(over && 'border-destructive focus-visible:ring-destructive')}
        />
      )}
    </div>
  )
}

function ListControls({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(-1)} disabled={i === 0} aria-label="Вище">
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(1)} disabled={i === n - 1} aria-label="Нижче">
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove} aria-label="Видалити">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  )
}

type ValueFieldProps = {
  ns: string
  /** Імʼя ключа (для підпису, типу поля, ліміту). */
  name: string
  path: Path
  value: unknown
  /** Дефолт того ж шляху (для «До дефолту» і лімітів); undefined — поле необовʼязкове/нове. */
  def: unknown
  index?: number
  level?: 1 | 2
  onChange: (path: Path, v: unknown) => void
}

/** Одне значення будь-якої форми: рядок / булеве / число / масив рядків / масив карток / обʼєкт. */
function ValueField({ ns, name, path, value, def, index = 0, level = 1, onChange }: ValueFieldProps) {
  const label = keyLabel(ns, name)
  const fullPath = `${ns}.${name}`

  if (typeof value === 'string' || (value === undefined && typeof def === 'string')) {
    const v = typeof value === 'string' ? value : ''
    const d = typeof def === 'string' ? def : undefined
    const kind = fieldKind(name)
    if (kind === 'image') {
      return <ImageField label={label} value={v} defaultValue={d} onChange={(nv) => onChange(path, nv)} />
    }
    if (kind === 'icon') {
      return <IconPicker label={label} value={v || undefined} index={index} order={iconOrder(ns)} onChange={(nv) => onChange(path, nv)} />
    }
    if (kind === 'href') {
      return (
        <TextField
          label={label}
          value={v}
          defaultValue={d}
          limit={500}
          textarea={false}
          placeholder="https://… , tel:… , mailto:… або /шлях"
          onChange={(nv) => onChange(path, nv)}
        />
      )
    }
    const type = fieldType(name, fullPath)
    const limit = fieldLimit(name, d, fullPath)
    const textarea = type === 'paragraph' || (d?.length ?? v.length) > 80
    return <TextField label={label} value={v} defaultValue={d} limit={limit} textarea={textarea} onChange={(nv) => onChange(path, nv)} />
  }

  if (typeof value === 'boolean') {
    const id = path.join('.')
    return (
      <div className="flex items-center gap-3">
        <Switch checked={value} onCheckedChange={(c) => onChange(path, c)} id={id} />
        <Label htmlFor={id} className="text-sm">{label}</Label>
      </div>
    )
  }

  if (typeof value === 'number') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <Input type="number" value={value} onChange={(e) => onChange(path, Number(e.target.value))} />
      </div>
    )
  }

  if (Array.isArray(value)) {
    const defArr = Array.isArray(def) ? def : []
    const template = unionTemplate([...defArr, ...value])
    const move = (i: number, d: -1 | 1) => {
      const j = i + d
      if (j < 0 || j >= value.length) return
      const next = [...value]
      ;[next[i], next[j]] = [next[j], next[i]]
      onChange(path, next)
    }
    const remove = (i: number) => onChange(path, value.filter((_, idx) => idx !== i))

    // Масив рядків (факти, ніші, пункти, підходи)
    if (!template) {
      const defStr = defArr.filter((x): x is string => typeof x === 'string')
      const longest = defStr.reduce((a, b) => (b.length > a.length ? b : a), '')
      const limit = fieldLimit(name, longest || undefined, fullPath)
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">{label} ({value.length})</p>
          {value.map((v, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  label={`${label} ${i + 1}`}
                  value={typeof v === 'string' ? v : ''}
                  defaultValue={typeof defArr[i] === 'string' ? (defArr[i] as string) : undefined}
                  limit={limit}
                  textarea={limit > 120}
                  onChange={(nv) => onChange([...path, i], nv)}
                />
              </div>
              <div className="flex shrink-0 gap-1 pt-6">
                <ListControls i={i} n={value.length} onMove={(d) => move(i, d)} onRemove={() => remove(i)} />
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => onChange(path, [...value, ''])}>
            <Plus className="mr-1 h-4 w-4" /> Додати
          </Button>
        </div>
      )
    }

    // Масив карток (пункти, послуги, кейси, кроки, партнери…)
    const visibleKeys = Object.keys(template).filter((k) => !TECHNICAL_KEYS.includes(k))
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label} ({value.length})</p>
        {value.length === 0 && <p className="text-sm text-muted-foreground">Список порожній. Додайте перший елемент.</p>}
        {value.map((item, i) => {
          const itemDef = isPlainObject(defArr[i]) ? (defArr[i] as PlainObject) : undefined
          const obj = isPlainObject(item) ? item : {}
          return (
            <CollapsibleItem
              key={i}
              level={level}
              title={`${i + 1}. ${itemTitle(item, `${label} ${i + 1}`)}`}
              right={<ListControls i={i} n={value.length} onMove={(d) => move(i, d)} onRemove={() => remove(i)} />}
            >
              {visibleKeys.map((k) => (
                <ValueField
                  key={k}
                  ns={ns}
                  name={k}
                  path={[...path, i, k]}
                  value={obj[k] ?? (typeof template[k] === 'string' ? '' : obj[k])}
                  def={itemDef?.[k] ?? (Array.isArray(template[k]) ? [] : undefined)}
                  index={i}
                  level={2}
                  onChange={onChange}
                />
              ))}
            </CollapsibleItem>
          )
        })}
        <Button variant="outline" size="sm" onClick={() => onChange(path, [...value, emptyFromTemplate(template, name)])}>
          <Plus className="mr-1 h-4 w-4" /> Додати
        </Button>
      </div>
    )
  }

  if (isPlainObject(value)) {
    const defObj = isPlainObject(def) ? def : {}
    return (
      <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
        <p className="text-sm font-medium">{label}</p>
        {Object.keys(value)
          .filter((k) => !TECHNICAL_KEYS.includes(k))
          .map((k) => (
            <ValueField key={k} ns={ns} name={k} path={[...path, k]} value={value[k]} def={defObj[k]} level={2} onChange={onChange} />
          ))}
      </div>
    )
  }

  return null
}

// ── Блок ─────────────────────────────────────────────────────────────────────

function BlockCard({
  block, number, ns, messages, defaults, hidden, onToggleHidden, onChange,
}: {
  block: PageBlock
  number: number | null
  /** Розділ сторінки зі списком прихованого (немає — блок не ховається). */
  ns?: string
  messages: Messages
  defaults: Messages
  hidden: string[]
  onToggleHidden: (id: string, hide: boolean) => void
  onChange: (path: Path, v: unknown) => void
}) {
  const changed = useMemo(() => {
    let n = 0
    for (const part of block.parts) {
      if (part.keys.length === 0) n += countChanges(defaults[part.ns], messages[part.ns])
      for (const k of part.keys) n += countChanges(getAt(defaults, [part.ns, k]), getAt(messages, [part.ns, k]))
    }
    if (ns) {
      const defHidden = (getAt(defaults, [ns, 'hidden']) as string[] | undefined) ?? []
      if (isHidden(hidden, ns, block.id) !== isHidden(defHidden, ns, block.id)) n += 1
    }
    return n
  }, [block, ns, messages, defaults, hidden])

  const isHiddenNow = ns ? isHidden(hidden, ns, block.id) : false
  const title = number === null ? block.title : `${number}. ${block.title}`

  return (
    <div id={`block-${block.id}`} className="scroll-mt-24">
      <CollapsibleCard
        title={title}
        description={
          changed > 0 || isHiddenNow || block.shared ? (
            <span className="flex flex-wrap items-center gap-2">
              {changed > 0 && <Badge variant="secondary">{changed} змінено</Badge>}
              {isHiddenNow && (
                <Badge variant="outline" className="gap-1">
                  <EyeOff className="h-3 w-3" /> приховано на сайті
                </Badge>
              )}
              {block.shared && <span className="text-xs">спільний блок: також на {block.shared.join(', ')}</span>}
            </span>
          ) : undefined
        }
      >
        {ns && !block.aux && (
          <div className="flex items-center justify-between rounded-lg border bg-background p-3">
            <div>
              <p className="text-sm font-medium">Показувати блок на сайті</p>
              <p className="text-xs text-muted-foreground">Прихований блок не потрапляє на сторінку, тексти зберігаються.</p>
            </div>
            <Switch checked={!isHiddenNow} onCheckedChange={(shown) => onToggleHidden(block.id, !shown)} aria-label="Показувати блок" />
          </div>
        )}
        {block.parts.map((part) =>
          part.keys.length === 0 ? (
            <ValueField
              key={part.ns}
              ns={part.ns}
              name={part.ns}
              path={[part.ns]}
              value={messages[part.ns]}
              def={defaults[part.ns]}
              onChange={onChange}
            />
          ) : (
            part.keys.map((k) => (
              <ValueField
                key={`${part.ns}.${k}`}
                ns={part.ns}
                name={k}
                path={[part.ns, k]}
                value={getAt(messages, [part.ns, k])}
                def={getAt(defaults, [part.ns, k])}
                onChange={onChange}
              />
            ))
          ),
        )}
      </CollapsibleCard>
    </div>
  )
}

// ── Редактор ─────────────────────────────────────────────────────────────────

export function ContentEditor({
  initial, defaults, baseUpdatedAt: initialUpdatedAt, page, onSaved,
}: {
  initial: Messages
  defaults: Messages
  baseUpdatedAt: string | null
  /** Активна вкладка-сторінка (id з CONTENT_PAGES); null — редактор не показується, стан живе. */
  page: string | null
  /** Після успішного збереження (напр. оновити контакти у вкладці «Метадані»). */
  onSaved?: (messages: Messages) => void
}) {
  // C5(a): версія, з якою завантажили контент — шлемо на сервер для optimistic-lock.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initialUpdatedAt)
  const [messages, setMessages] = useState<Messages>(initial)
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial))
  const current = JSON.stringify(messages)
  const dirty = current !== baseline

  const onChange = (path: Path, v: unknown) => setMessages((m) => setAt(m, path, v))

  const pageDef = CONTENT_PAGES.find((p) => p.id === page)
  const pageNs = pageDef?.ns
  const hidden = pageNs ? ((getAt(messages, [pageNs, 'hidden']) as string[] | undefined) ?? []) : []

  const toggleHidden = (id: string, hide: boolean) => {
    if (!pageNs) return
    const order = (HIDEABLE_BLOCKS[pageNs] ?? []).map((b) => b.id)
    const set = new Set(hidden)
    if (hide) set.add(id)
    else set.delete(id)
    onChange([pageNs, 'hidden'], order.filter((b) => set.has(b)))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: messages, baseUpdatedAt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Оновлюємо версію для наступних збережень (щоб не отримати 409 на другому поспіль).
      if (typeof json.updatedAt === 'string') setBaseUpdatedAt(json.updatedAt)
      setBaseline(current) // фіксуємо новий «збережений» стан
      onSaved?.(messages)
      toast.success('Збережено. Сайт оновлено.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  const blocks = page ? PAGE_BLOCKS[page] ?? [] : []
  let counter = 0

  return (
    <>
      {page && pageDef && (
        <div className="space-y-4 pb-24">
          <p className="text-sm text-muted-foreground">{pageDef.hint}</p>
          {/* Оглавлення блоків */}
          <nav className="flex flex-wrap gap-1.5" aria-label="Блоки сторінки">
            {blocks.map((b, i) => (
              <a
                key={b.id}
                href={`#block-${b.id}`}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {b.aux ? b.title : `${i + 1}. ${b.title}`}
              </a>
            ))}
          </nav>
          {blocks.map((b) => {
            const number = b.aux ? null : ++counter
            return (
              <BlockCard
                key={b.id}
                block={b}
                number={number}
                ns={pageNs}
                messages={messages}
                defaults={defaults}
                hidden={hidden}
                onToggleHidden={toggleHidden}
                onChange={onChange}
              />
            )
          })}
        </div>
      )}

      {/* Кнопка збереження — закріплена у правому нижньому куті, зʼявляється лише за наявності змін */}
      {dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
            <span className="text-sm text-muted-foreground">Є незбережені зміни</span>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Зберегти зміни
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
