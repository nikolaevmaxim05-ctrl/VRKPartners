'use client'

// Секція «Події аналітики» на сторінці «Налаштування» (промпти 016, 018, 024+).
// Стан: eventNames[] на кожну точку.
// UX-рефактор: замість окремої кнопки «Зберегти» в кожному рядку — ОДНА спільна
// кнопка зверху + плаваюча панель знизу. Зберігаються всі змінені рядки за один
// PATCH (API мержить надіслані ключі зі збереженим конфігом).

import { Fragment, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Save, Plus, X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoHint } from '@/components/ui/info-hint'
import {
  ANALYTICS_REGISTRY,
  ANALYTICS_EVENT_NAME_PATTERN,
  MAX_EVENT_NAMES_PER_KEY,
  getDefaultAnalyticsEvents,
  type AnalyticsEventsConfig,
} from '@/lib/analytics-registry'

// ── Локальний стан рядка ───────────────────────────────────────────────────────

type RowState = {
  enabled: boolean
  eventNames: string[]
}

type EventsState = Record<string, RowState>

// Перетворення AnalyticsEventsConfig → локальний EventsState
function toRowState(cfg: AnalyticsEventsConfig): EventsState {
  const state: EventsState = {}
  for (const entry of ANALYTICS_REGISTRY) {
    const c = cfg[entry.key]
    const names: string[] = c?.eventNames !== undefined
      ? c.eventNames
      : (c?.eventName ? [c.eventName] : [...entry.defaultEventNames])
    state[entry.key] = { enabled: c?.enabled !== false, eventNames: names }
  }
  return state
}

// Перетворення всього стану → payload для PATCH (скидання)
function toFullPayload(state: EventsState): Record<string, { enabled: boolean; eventNames: string[] }> {
  const payload: Record<string, { enabled: boolean; eventNames: string[] }> = {}
  for (const [key, row] of Object.entries(state)) {
    payload[key] = { enabled: row.enabled, eventNames: row.eventNames }
  }
  return payload
}

// Payload лише зі змінених рядків — для спільного «Зберегти» (один PATCH на всі)
function toDirtyPayload(
  state: EventsState,
  baseline: EventsState,
): Record<string, { enabled: boolean; eventNames: string[] }> {
  const payload: Record<string, { enabled: boolean; eventNames: string[] }> = {}
  for (const entry of ANALYTICS_REGISTRY) {
    const row = state[entry.key]
    const base = baseline[entry.key]
    if (row && base && isRowDirty(row, base)) {
      payload[entry.key] = { enabled: row.enabled, eventNames: row.eventNames }
    }
  }
  return payload
}

// Перевірка валідності одного імені події
function isValidName(name: string): boolean {
  return ANALYTICS_EVENT_NAME_PATTERN.test(name)
}

// Перевірка «брудності» рядка відносно еталону (завантаженого з сервера)
function isRowDirty(row: RowState, baseline: RowState): boolean {
  if (row.enabled !== baseline.enabled) return true
  if (row.eventNames.length !== baseline.eventNames.length) return true
  return row.eventNames.some((n, i) => n !== baseline.eventNames[i])
}

// Перевірка валідності рядка (немає невалідних або дублікатних імен)
function isRowValid(row: RowState): boolean {
  const names = row.eventNames
  for (let i = 0; i < names.length; i++) {
    const n = names[i]
    if (n !== '' && !isValidName(n)) return false
    if (names.indexOf(n) !== i && isValidName(n)) return false
  }
  return true
}

// ── Явний порядок груп ────────────────────────────────────────────────────────
// Логіка: рух по головній сторінці згори вниз (шапка → секції → форми →
// контакти → футер), потім сторінки окремих послуг, наприкінці — технічні/інші.
const GROUP_ORDER: string[] = [
  // Головна сторінка — згори вниз
  'Шапка',
  'Мобільне меню',
  'Мобільна плаваюча CTA',
  'Послуги',
  'Ціни',
  'FAQ',
  'Відгуки',
  'Форми',
  'Плаваючі месенджери',
  'Контакти / Final CTA',
  'Футер',
  'Футер — соцмережі',
  // Сторінки окремих послуг
  'Сторінка послуги — Hero',
  'Сторінка послуги — Ціни',
  // Технічні / резервні
  'Сторінка 404',
  'Інші розміщення',
]

// Групуємо записи реєстру по blockLabel, зберігаємо порядок GROUP_ORDER
function groupRegistry() {
  const map = new Map<string, typeof ANALYTICS_REGISTRY[number][]>()
  for (const entry of ANALYTICS_REGISTRY) {
    const arr = map.get(entry.blockLabel) ?? []
    arr.push(entry)
    map.set(entry.blockLabel, arr)
  }

  // Будуємо масив груп у заданому порядку
  const ordered: { blockLabel: string; entries: typeof ANALYTICS_REGISTRY[number][] }[] = []
  const seen = new Set<string>()

  for (const label of GROUP_ORDER) {
    if (map.has(label)) {
      ordered.push({ blockLabel: label, entries: map.get(label)! })
      seen.add(label)
    }
  }

  // Групи, яких немає в GROUP_ORDER — в кінець
  for (const [label, entries] of map) {
    if (!seen.has(label)) {
      ordered.push({ blockLabel: label, entries })
    }
  }

  return ordered
}

const GROUPED_REGISTRY = groupRegistry()

// ── Компонент ─────────────────────────────────────────────────────────────────

export function AnalyticsEventsSection() {
  const [eventsState, setEventsState] = useState<EventsState>(() =>
    toRowState(getDefaultAnalyticsEvents())
  )
  // Еталон — завантажений з сервера стан, відносно якого визначаємо «брудність»
  const [baseline, setBaseline] = useState<EventsState>(() =>
    toRowState(getDefaultAnalyticsEvents())
  )
  const [loading, setLoading] = useState(true)
  // Єдиний прапорець збереження (спільна кнопка зберігає всі змінені рядки разом)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetch('/api/admin/analytics-events')
      .then((r) => r.json())
      .then((j) => {
        if (j?.data?.events) {
          const state = toRowState({ ...getDefaultAnalyticsEvents(), ...j.data.events })
          setEventsState(state)
          setBaseline(state)
        }
      })
      .catch(() => toast.error('Не вдалося завантажити налаштування подій'))
      .finally(() => setLoading(false))
  }, [])

  // --- Дії над рядками таблиці ---

  const setEnabled = (key: string, enabled: boolean) => {
    setEventsState((prev) => ({ ...prev, [key]: { ...prev[key], enabled } }))
  }

  const addEventName = (key: string) => {
    setEventsState((prev) => {
      const row = prev[key]
      if (!row || row.eventNames.length >= MAX_EVENT_NAMES_PER_KEY) return prev
      return { ...prev, [key]: { ...row, eventNames: [...row.eventNames, ''] } }
    })
  }

  const updateEventName = (key: string, index: number, raw: string) => {
    // М'яка нормалізація: малі літери, тільки дозволені символи
    const name = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40)
    setEventsState((prev) => {
      const row = prev[key]
      if (!row) return prev
      const names = [...row.eventNames]
      names[index] = name
      return { ...prev, [key]: { ...row, eventNames: names } }
    })
  }

  const removeEventName = (key: string, index: number) => {
    setEventsState((prev) => {
      const row = prev[key]
      if (!row) return prev
      const names = row.eventNames.filter((_, i) => i !== index)
      return { ...prev, [key]: { ...row, eventNames: names } }
    })
  }

  // --- Спільне збереження всіх змінених рядків (один PATCH) ---

  const saveAll = async () => {
    const payload = toDirtyPayload(eventsState, baseline)
    const dirtyKeysList = Object.keys(payload)
    if (dirtyKeysList.length === 0) return

    // Валідація лише змінених рядків
    const hasInvalid = dirtyKeysList.some((key) => !isRowValid(eventsState[key]))
    if (hasInvalid) {
      toast.error('Є невалідні або дублікатні імена подій — виправте підсвічені рядки')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/analytics-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: payload }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return
      }
      // Оновлюємо еталон для всіх збережених рядків
      setBaseline((prev) => {
        const next = { ...prev }
        for (const key of dirtyKeysList) next[key] = { ...eventsState[key] }
        return next
      })
      toast.success(`Збережено змін: ${dirtyKeysList.length} — застосовано на лендингу`)
    } finally {
      setSaving(false)
    }
  }

  // --- Скасування незбережених змін (повернення до еталону) ---

  const discardAll = () => {
    setEventsState(baseline)
  }

  // --- Скидання до стандартних ---

  const handleReset = async () => {
    if (!confirm('Скинути всі події до стандартних (увімкнено, стандартні імена)?')) return
    const defaults = getDefaultAnalyticsEvents()
    const defaultState = toRowState(defaults)
    setEventsState(defaultState)

    setResetting(true)
    try {
      const res = await fetch('/api/admin/analytics-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: toFullPayload(defaultState) }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка скидання')
        return
      }
      setBaseline(defaultState)
      toast.success('Скинуто до стандартних')
    } finally {
      setResetting(false)
    }
  }

  // Множина змінених ключів — для підсвічування рядків і лічильника
  const dirtyKeys = useMemo(
    () =>
      new Set(
        ANALYTICS_REGISTRY
          .filter((e) => isRowDirty(eventsState[e.key] ?? baseline[e.key], baseline[e.key]))
          .map((e) => e.key)
      ),
    [eventsState, baseline]
  )
  const dirtyCount = dirtyKeys.size

  // Чи є серед ЗМІНЕНИХ рядків невалідні (блокує спільне збереження)
  const hasInvalidDirty = useMemo(
    () =>
      [...dirtyKeys].some((key) => {
        const row = eventsState[key]
        return row ? !isRowValid(row) : false
      }),
    [dirtyKeys, eventsState]
  )

  if (loading) return <Skeleton className="h-80 w-full" />

  return (
    <div className="space-y-4">
      {/* Шапка секції */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Події аналітики</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Тут ви можете керувати подіями, що надсилаються у підключені вами
            інтеграції (GTM, GA4, Google Ads), а також змінювати їхні назви.
            Вимкнені події не надсилаються. Зміни застосовуються на сайті одразу,
            без необхідності деплою.
          </p>
          <p className="text-xs text-sky-600 dark:text-sky-400 mt-1.5">
            Одна взаємодія може надсилати кілька подій, кожна з яких буде окремо
            передана в підключені інтеграції для їхнього відстеження.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset} disabled={resetting || saving}>
            {resetting
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <RotateCcw className="h-4 w-4 mr-1.5" />}
            Скинути до стандартних
          </Button>
          <Button onClick={saveAll} disabled={saving || dirtyCount === 0 || hasInvalidDirty}>
            {saving
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Save className="h-4 w-4 mr-1.5" />}
            Зберегти{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
          </Button>
        </div>
      </div>

      {/* Групи точок взаємодії — кожна в окремій Card */}
      <div className="space-y-6">
        {GROUPED_REGISTRY.map(({ blockLabel, entries }) => (
          <div key={blockLabel} className="border rounded-lg overflow-hidden">
            {/* Заголовок групи — чітка плашка */}
            <div className="bg-muted px-4 py-2.5 border-b">
              <h3 className="text-sm font-semibold tracking-wide text-foreground">
                {blockLabel}
              </h3>
            </div>

            {/* Таблиця рядків групи */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Взаємодія</th>
                    <th className="px-3 py-2 font-medium text-center w-24">Увімкнено</th>
                    <th className="px-3 py-2 font-medium">Імена подій</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const row = eventsState[entry.key] ?? { enabled: true, eventNames: [...entry.defaultEventNames] }
                    const baseRow = baseline[entry.key] ?? { enabled: true, eventNames: [...entry.defaultEventNames] }
                    const isDirty = isRowDirty(row, baseRow)

                    return (
                      <Fragment key={entry.key}>
                        <tr
                          className={`border-b last:border-b-0 align-top transition-colors ${
                            isDirty ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                          }`}
                        >
                          {/* Тип взаємодії + іконка-підказка «i» (що саме запускає подію) */}
                          <td className="px-3 py-2.5 align-middle text-muted-foreground whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              {/* Маркер незбережених змін */}
                              {isDirty && (
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                                  aria-label="Незбережені зміни"
                                  title="Незбережені зміни"
                                />
                              )}
                              {entry.interactionLabel}
                              <InfoHint
                                text={entry.description}
                                label={`Що запускає: ${entry.interactionLabel}`}
                              />
                            </span>
                          </td>

                          {/* Switch увімкнено */}
                          <td className="px-3 py-2.5 align-middle text-center">
                            <Switch
                              checked={row.enabled}
                              onCheckedChange={(v) => setEnabled(entry.key, v)}
                              aria-label={`Увімкнути подію «${entry.blockLabel} — ${entry.interactionLabel}»`}
                            />
                          </td>

                          {/* Масив імен подій — чипи з інлайн-редагуванням */}
                          <td className="px-3 py-2.5 align-middle">
                            {row.eventNames.length === 0 && (
                              <p className="text-xs text-amber-500 mb-1.5">
                                Жодної події — точка не надсилає нічого
                              </p>
                            )}

                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {row.eventNames.map((name, idx) => {
                                const isDuplicate =
                                  row.eventNames.indexOf(name) !== idx && isValidName(name)
                                const isInvalid = name !== '' && !isValidName(name)
                                const chipError = isInvalid || isDuplicate

                                return (
                                  <div
                                    key={idx}
                                    className={`flex items-center gap-1 border rounded px-1.5 py-0.5 bg-background ${
                                      chipError
                                        ? 'border-destructive'
                                        : 'border-border'
                                    }`}
                                  >
                                    <input
                                      type="text"
                                      value={name}
                                      onChange={(e) => updateEventName(entry.key, idx, e.target.value)}
                                      disabled={!row.enabled}
                                      maxLength={40}
                                      placeholder="ім_я_події"
                                      className="font-mono text-xs bg-transparent outline-none w-[120px] disabled:opacity-50"
                                      aria-label={`Ім'я події ${idx + 1} для «${entry.interactionLabel}»`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeEventName(entry.key, idx)}
                                      disabled={!row.enabled}
                                      aria-label="Видалити ім'я події"
                                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Підказки про помилки */}
                            {row.eventNames.some((n) => n !== '' && !isValidName(n)) && (
                              <p className="text-xs text-destructive mb-1">
                                Малі латинські літери, цифри та _, 1–40 символів
                              </p>
                            )}
                            {row.eventNames.some((n, i) => row.eventNames.indexOf(n) !== i && isValidName(n)) && (
                              <p className="text-xs text-destructive mb-1">
                                Є дублікати — кожне ім'я має бути унікальним
                              </p>
                            )}

                            {/* Кнопка додати ім'я */}
                            {row.eventNames.length < MAX_EVENT_NAMES_PER_KEY && (
                              <button
                                type="button"
                                onClick={() => addEventName(entry.key)}
                                disabled={!row.enabled}
                                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline transition-opacity"
                                aria-label="Додати ім'я події"
                              >
                                <Plus className="w-3 h-3" />
                                Додати подію
                              </button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Підказка про GA4 і кастомні події */}
      <div className="flex gap-2.5 rounded-md border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30 p-3">
        <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <p className="text-xs text-sky-700 dark:text-sky-300 leading-relaxed">
          Кастомні події з'являються в звітах GA4 лише після першого спрацювання і з затримкою 24–48 год.
          Для перевірки в реальному часі використовуйте GA4 DebugView (розширення Google Tag Assistant у Chrome).
        </p>
      </div>

      {/* Плаваюча панель збереження — зʼявляється лише за наявності змін */}
      {dirtyCount > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <span className="text-sm">
            Незбережених змін: <strong>{dirtyCount}</strong>
            {hasInvalidDirty && (
              <span className="ml-2 text-destructive">— виправте підсвічені рядки</span>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={discardAll} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={saveAll} disabled={saving || hasInvalidDirty}>
              {saving
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Save className="h-4 w-4 mr-1.5" />}
              Зберегти зміни
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
