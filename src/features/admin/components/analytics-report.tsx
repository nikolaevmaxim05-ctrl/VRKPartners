'use client'

// Компонент вкладки «Аналітика» v3 (промпт 025).
// Изменения: разделены фильтры «Розріз» / «Період», убрано gclid-меню,
// добавлен breakdown-режим графика (разбивка по измерению).
import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchDictionary } from '@/features/admin/lib/dictionary-cache'
import { useSearchParams, usePathname } from 'next/navigation'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { Checkbox } from '@/shared/ui/checkbox'
import { Label } from '@/shared/ui/label'
import {
  Download,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  ChevronDown,
  X,
  Pin,
} from 'lucide-react'
import { ExportBuilderDialog } from '@/features/admin/components/export-builder-dialog'
import { DatePicker } from '@/shared/ui/date-picker'
import { getServiceLabel, SERVICE_OPTIONS } from '@/features/admin/lib/services'
import type {
  GroupBy,
  ReportResponse,
  ReportRow,
  TsGranularity,
  BreakdownDimension,
  MetricKeyForBreakdown,
} from '@core/domain/analytics/report'

// ─── Утилиты дат ─────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDefaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 29)
  return toIsoDate(d)
}

function getDefaultDateTo(): string {
  return toIsoDate(new Date())
}

// ─── Форматирование ───────────────────────────────────────────────────────────

const fmtAmount = (v: number): string =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 0,
  }).format(v)

const fmtPct = (v: number): string => `${v.toFixed(1)} %`

// ─── Параметры разрезов (groupBy) — ТОЛЬКО измерения, без временных ─────────

/** Измерения для селекта «Розріз» — без day/week/month */
const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'utm_source',   label: 'Джерело' },
  { value: 'utm_medium',   label: 'UTM Medium' },
  { value: 'utm_campaign', label: 'UTM Campaign' },
  { value: 'utm_term',     label: 'UTM Term' },
  { value: 'utm_content',  label: 'UTM Content' },
  { value: 'status',       label: 'Стадія' },
  { value: 'service',      label: 'Послуга' },
  { value: 'assigned_to',  label: 'Відповідальний' },
  { value: 'referral_link', label: 'Реферальне посилання' },
  { value: 'custom_field', label: 'Додаткове поле' },
]

// ─── Разбивка графика (breakdown) ────────────────────────────────────────────

const BREAKDOWN_OPTIONS: { value: BreakdownDimension; label: string }[] = [
  { value: 'none',         label: 'Немає' },
  { value: 'utm_source',   label: 'Джерело' },
  { value: 'utm_medium',   label: 'UTM Medium' },
  { value: 'utm_campaign', label: 'UTM Campaign' },
  { value: 'utm_term',     label: 'UTM Term' },
  { value: 'utm_content',  label: 'UTM Content' },
  { value: 'status',       label: 'Стадія' },
  { value: 'service',      label: 'Послуга' },
  { value: 'assigned_to',  label: 'Відповідальний' },
  { value: 'referral_link', label: 'Реферальне посилання' },
  { value: 'custom_field', label: 'Додаткове поле' },
]

// ─── Метрики мультиселекта ────────────────────────────────────────────────────

type MetricKey = 'total' | 'targetLeads' | 'nonTargetLeads' | 'deals' | 'dealAdjustments' | 'dealAmountSum' | 'dealProfitSum'

type MetricDef = {
  key: MetricKey
  label: string
  color: string
  isMoney: boolean
  /** Если true — показывать только когда соответствующий флаг true */
  requiresFlag?: 'hasDealAdjustmentStages' | 'hasProfitStages'
}

const METRICS: MetricDef[] = [
  { key: 'total',           label: 'Заявки',         color: '#3b82f6', isMoney: false },
  { key: 'targetLeads',     label: 'Цільові',        color: '#10b981', isMoney: false },
  { key: 'nonTargetLeads',  label: 'Нецільові',      color: '#94a3b8', isMoney: false },
  { key: 'deals',           label: 'Угоди',          color: '#f59e0b', isMoney: false },
  { key: 'dealAdjustments', label: 'Повторні угоди', color: '#8b5cf6', isMoney: false, requiresFlag: 'hasDealAdjustmentStages' },
  { key: 'dealAmountSum',   label: 'Сума угод',      color: '#ef4444', isMoney: true  },
  { key: 'dealProfitSum',   label: 'Прибуток',       color: '#06b6d4', isMoney: true, requiresFlag: 'hasProfitStages' },
]

/** Метрики MetricKey, валидные для breakdown-разбивки (без «Повторні угоди»). */
const BREAKDOWN_METRIC_KEYS = new Set<MetricKey>([
  'total', 'targetLeads', 'nonTargetLeads', 'deals', 'dealAmountSum', 'dealProfitSum',
])

/** Преобразует выбранные чипы метрик в список для breakdown (фолбэк — ['total']). */
function toBreakdownMetrics(selected: MetricKey[]): MetricKeyForBreakdown[] {
  const filtered = selected.filter((m): m is MetricKeyForBreakdown => BREAKDOWN_METRIC_KEYS.has(m))
  return filtered.length > 0 ? filtered : ['total']
}

const DEFAULT_METRICS: MetricKey[] = ['total']

// Чистит подписи серий в легенде/тултипе режима разбивки.
// Подпись имеет вид «значение-разреза · метрика» (или просто «значение»).
// Если у ВСЕХ серий одинаковая часть-разрез (напр. все «(невідомо)») — убираем её,
// чтобы не дублировать и не плодить «мешанину», оставляя только название метрики.
function buildSeriesLabelMap(series: { key: string; label: string }[]): Map<string, string> {
  const SEP = ' · '
  const parsed = series.map((s) => {
    const idx = s.label.indexOf(SEP)
    return idx >= 0
      ? { key: s.key, full: s.label, dim: s.label.slice(0, idx), metric: s.label.slice(idx + SEP.length) }
      : { key: s.key, full: s.label, dim: s.label, metric: null as string | null }
  })
  const allHaveMetric = parsed.every((p) => p.metric !== null)
  const sameDim = new Set(parsed.map((p) => p.dim)).size === 1
  const dropDim = allHaveMetric && sameDim
  const map = new Map<string, string>()
  for (const p of parsed) {
    map.set(p.key, dropDim && p.metric ? p.metric : p.full)
  }
  return map
}

// Метаданные серии разбивки: измерение + метрика + денежная или нет (для группировки в тултипе).
type BreakdownSeriesMeta = { dim: string; metricLabel: string; isMoney: boolean }
type BreakdownGroup = {
  dim: string
  items: Array<{ color?: string; metricLabel: string; isMoney: boolean; value: number }>
}

// Группирует линии по измерению (ответственный/источник/стадия/…) для тултипа/закреплённого окна.
function groupBreakdownPayload(
  payload: Array<{ name?: string | number; value?: number | string; color?: string }>,
  meta: Map<string, BreakdownSeriesMeta>,
): BreakdownGroup[] {
  const groups = new Map<string, BreakdownGroup['items']>()
  for (const p of payload) {
    const m = meta.get(String(p.name))
    if (!m) continue
    const num = typeof p.value === 'number' ? p.value : Number(p.value ?? 0)
    const arr = groups.get(m.dim) ?? []
    arr.push({ color: p.color, metricLabel: m.metricLabel, isMoney: m.isMoney, value: num })
    groups.set(m.dim, arr)
  }
  return Array.from(groups.entries()).map(([dim, items]) => ({ dim, items }))
}

// Сетка групп в ДВА столбца (ответственные рядом), с правильным форматом значений.
function BreakdownGroupsGrid({ groups }: { groups: BreakdownGroup[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {groups.map((g) => (
        <div key={g.dim} className="min-w-0">
          <div className="font-semibold text-foreground truncate">{g.dim}</div>
          {g.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 truncate" style={{ color: it.color }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                {it.metricLabel}
              </span>
              <span className="tabular-nums shrink-0">
                {it.isMoney ? fmtAmount(it.value) : Math.round(it.value)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Кастомный тултип режима разбивки (наведение).
function BreakdownTooltip({
  active,
  payload,
  label,
  meta,
}: {
  active?: boolean
  payload?: Array<{ name?: string | number; value?: number | string; color?: string }>
  label?: string | number
  meta: Map<string, BreakdownSeriesMeta>
}) {
  if (!active || !payload?.length) return null
  const groups = groupBreakdownPayload(payload, meta)
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md max-h-72 overflow-y-auto min-w-[280px]">
      <div className="font-medium mb-1">{String(label ?? '')}</div>
      <BreakdownGroupsGrid groups={groups} />
    </div>
  )
}

// Захват наведённой точки в ref (чтобы клик по графику мог её зафиксировать независимо
// от ненадёжного activePayload в onClick Recharts). Рендерит обычный тултип.
type HoverCap = {
  label: string
  payload: Array<{ name?: string | number; value?: number | string; color?: string }>
  x: number
  y: number
}
function CapturingBreakdownTooltip({
  active,
  payload,
  label,
  meta,
  captureRef,
  coordinate,
  suppress,
}: {
  active?: boolean
  payload?: Array<{ name?: string | number; value?: number | string; color?: string }>
  label?: string | number
  meta: Map<string, BreakdownSeriesMeta>
  captureRef: { current: HoverCap | null }
  coordinate?: { x?: number; y?: number }
  // Когда уже есть закреплённое окно — живую подсказку не показываем (чтобы не было двух окон),
  // но координату/точку всё равно фиксируем (чтобы клик мог перенести закреплённое окно).
  suppress?: boolean
}) {
  useEffect(() => {
    if (active && payload?.length) {
      captureRef.current = {
        label: String(label ?? ''),
        payload,
        x: coordinate?.x ?? 0,
        y: coordinate?.y ?? 0,
      }
    }
  })
  if (suppress) return null
  return <BreakdownTooltip active={active} payload={payload} label={label} meta={meta} />
}

// Список метрик (обычный режим главного графика) для тултипа/закреплённого окна.
type MetricItem = { label: string; value: number; isMoney: boolean; color?: string }
function MetricsList({ items }: { items: MetricItem[] }) {
  return (
    <div className="space-y-0.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: it.color }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: it.color }} />
            {it.label}
          </span>
          <span className="tabular-nums">
            {it.isMoney ? fmtAmount(it.value) : Math.round(it.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Преобразует payload главного графика (обычный режим) в список метрик.
function payloadToMetrics(
  payload: Array<{ name?: string | number; value?: number | string; color?: string }>,
): MetricItem[] {
  return payload.map((p) => {
    const meta = METRICS.find((m) => m.key === String(p.name))
    const num = typeof p.value === 'number' ? p.value : Number(p.value ?? 0)
    return { label: meta?.label ?? String(p.name ?? ''), value: num, isMoney: !!meta?.isMoney, color: p.color }
  })
}

// Тултип обычного режима с захватом наведённой точки в ref (для фиксации по клику).
function CapturingMetricTooltip({
  active,
  payload,
  label,
  captureRef,
  coordinate,
  suppress,
}: {
  active?: boolean
  payload?: Array<{ name?: string | number; value?: number | string; color?: string }>
  label?: string | number
  captureRef: { current: HoverCap | null }
  coordinate?: { x?: number; y?: number }
  suppress?: boolean
}) {
  useEffect(() => {
    if (active && payload?.length) {
      captureRef.current = {
        label: String(label ?? ''),
        payload,
        x: coordinate?.x ?? 0,
        y: coordinate?.y ?? 0,
      }
    }
  })
  if (suppress || !active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1">{String(label ?? '')}</div>
      <MetricsList items={payloadToMetrics(payload)} />
    </div>
  )
}

// ─── Типы ─────────────────────────────────────────────────────────────────────

type Assignee = { id: string; email: string; name: string | null }
type ReferralRef = { id: string; name: string; code: string; is_active: boolean }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Status = {
  id: string
  name: string
  color: string
  conversion_type: string | null
}

type CustomField = {
  id: string
  name: string
  field_key: string
}

// ─── Скелетон ─────────────────────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

// ─── Компонент сортировки колонки ─────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null
type SortKey = keyof ReportRow

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc')  return <ArrowUp  className="inline h-3.5 w-3.5 ml-1" />
  if (dir === 'desc') return <ArrowDown className="inline h-3.5 w-3.5 ml-1" />
  return <ChevronsUpDown className="inline h-3.5 w-3.5 ml-1 opacity-40" />
}

// ─── Мультиселект стадий (Popover + чекбоксы) ────────────────────────────────

function StatusMultiSelect({
  statuses,
  selected,
  onChange,
}: {
  statuses: Status[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const label =
    selected.length === 0
      ? 'Всі стадії'
      : selected.length === 1
      ? (statuses.find((s) => s.id === selected[0])?.name ?? '1 стадія')
      : `${selected.length} стадії`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-40 justify-between font-normal"
          aria-label="Фільтр по стадіях"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
              onClick={() => toggle(s.id)}
            >
              <Checkbox
                checked={selected.includes(s.id)}
                onCheckedChange={() => toggle(s.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <Label className="text-sm cursor-pointer truncate">{s.name}</Label>
            </div>
          ))}
          {statuses.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">Стадії не знайдено</p>
          )}
        </div>
        {selected.length > 0 && (
          <div className="pt-2 border-t mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onChange([])}
            >
              Очистити
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── Мультиселект ответственных ───────────────────────────────────────────────

function AssigneeMultiSelect({
  assignees,
  selected,
  onChange,
}: {
  assignees: Assignee[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  // Пустое имя ("") тоже считаем отсутствующим → падаем на email, далее на плейсхолдер.
  // (?? не ловит пустую строку, из-за чего половина пунктов была без подписи)
  const nameOf = (a: Assignee) => a.name?.trim() || a.email?.trim() || "Без імені"
  const label =
    selected.length === 0
      ? 'Всі відповідальні'
      : selected.length === 1
      ? (assignees.find((a) => a.id === selected[0]) ? nameOf(assignees.find((a) => a.id === selected[0])!) : '1 відповідальний')
      : `${selected.length} відповідальних`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-40 justify-between font-normal"
          aria-label="Фільтр по відповідальних"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {/* «Вибрати всіх» = без фильтра (пустой выбор). Отмечено по умолчанию. */}
          <div
            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer border-b mb-1 pb-2"
            onClick={() => onChange([])}
          >
            <Checkbox
              checked={selected.length === 0}
              onCheckedChange={() => onChange([])}
              onClick={(e) => e.stopPropagation()}
            />
            <Label className="text-sm cursor-pointer font-medium">Вибрати всіх</Label>
          </div>
          {assignees.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
              onClick={() => toggle(a.id)}
            >
              <Checkbox
                checked={selected.includes(a.id)}
                onCheckedChange={() => toggle(a.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <Label className="text-sm cursor-pointer truncate">{nameOf(a)}</Label>
            </div>
          ))}
          {assignees.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">Відповідальних не знайдено</p>
          )}
        </div>
        {selected.length > 0 && (
          <div className="pt-2 border-t mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onChange([])}
            >
              Очистити
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── Мультиселект метрик графика (компактный дропдаун) ────────────────────────

function MetricMultiSelect({
  metrics,
  selected,
  onChange,
  flags,
}: {
  metrics: MetricDef[]
  selected: MetricKey[]
  onChange: (keys: MetricKey[]) => void
  flags: ReportResponse['flags']
}) {
  const [open, setOpen] = useState(false)

  const visible = metrics.filter((m) => !m.requiresFlag || flags[m.requiresFlag])

  function toggle(key: MetricKey) {
    if (selected.includes(key)) {
      if (selected.length === 1) return // не снимать последнюю метрику
      onChange(selected.filter((k) => k !== key))
    } else {
      onChange([...selected, key])
    }
  }

  const selectedVisible = visible.filter((m) => selected.includes(m.key))
  const label =
    selectedVisible.length === 1
      ? selectedVisible[0].label
      : `${selectedVisible.length} метрики`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-40 justify-between font-normal"
          aria-label="Метрики графіка"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {visible.map((m) => {
            const checked = selected.includes(m.key)
            const isLast = checked && selected.length === 1
            return (
              <div
                key={m.key}
                className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent ${
                  isLast ? 'opacity-60' : 'cursor-pointer'
                }`}
                onClick={() => toggle(m.key)}
              >
                <Checkbox
                  checked={checked}
                  disabled={isLast}
                  onCheckedChange={() => toggle(m.key)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <Label className="text-sm cursor-pointer truncate">{m.label}</Label>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Главный компонент ─────────────────────────────────────────────────────────

export function AnalyticsReport() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── Читаем метрики, гранулярность и breakdown из URL ──────────────────────

  const metricsFromUrl = searchParams.get('metrics')
  const granularityFromUrl = searchParams.get('granularity') as TsGranularity | null
  const breakdownFromUrl = searchParams.get('breakdown') as BreakdownDimension | null
  const customFieldIdFromUrl = searchParams.get('custom_field_id')
  // Начальный фильтр партнёра — из ссылки «Аналітика →» вкладки «Реферальні посилання».
  const referralLinkIdFromUrl = searchParams.get('referral_link_id')

  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(() => {
    if (metricsFromUrl) {
      const parsed = metricsFromUrl.split(',').filter((k): k is MetricKey =>
        METRICS.some((m) => m.key === k)
      )
      return parsed.length > 0 ? parsed : DEFAULT_METRICS
    }
    return DEFAULT_METRICS
  })

  const [tsGranularity, setTsGranularity] = useState<TsGranularity>(
    granularityFromUrl && ['day', 'week', 'month'].includes(granularityFromUrl)
      ? granularityFromUrl
      : 'day'
  )

  const [breakdown, setBreakdown] = useState<BreakdownDimension>(
    breakdownFromUrl && BREAKDOWN_OPTIONS.some((o) => o.value === breakdownFromUrl)
      ? breakdownFromUrl
      : 'none'
  )

  // ── Состояние фильтров ─────────────────────────────────────────────────────

  const [dateFrom, setDateFrom] = useState<string>(getDefaultDateFrom)
  const [dateTo, setDateTo]     = useState<string>(getDefaultDateTo)
  // groupBy — теперь только измерения, дефолт utm_source
  // Разрез сводной таблицы привязан к фильтру «Розбити за».
  // Если разбивки нет ('none') — группируем по «Джерело» (дефолт).
  const groupBy: GroupBy = breakdown === 'none' ? 'utm_source' : (breakdown as GroupBy)
  // Выбранное кастом-поле для разреза «Додаткове поле» (group_by=custom_field).
  const [customFieldId, setCustomFieldId] = useState<string>(customFieldIdFromUrl ?? '')
  const [filterUtmSource,  setFilterUtmSource]  = useState('all')
  const [filterService,    setFilterService]    = useState('all')
  const [filterAssigneeIds, setFilterAssigneeIds] = useState<string[]>([])
  const [filterStatusIds,  setFilterStatusIds]  = useState<string[]>([])
  // Реферальная ссылка: 'all' | 'none' (без ссылки) | UUID ссылки.
  const [filterReferralLinkId, setFilterReferralLinkId] = useState<string>(() =>
    referralLinkIdFromUrl && (referralLinkIdFromUrl === 'none' || UUID_RE.test(referralLinkIdFromUrl))
      ? referralLinkIdFromUrl
      : 'all',
  )
  // Разворачивание блока со сводкой по каждому менеджеру (таблица из report.byAssignee
  // + график динамики заявок по каждому менеджеру на тех же фильтрах).
  const [showPerAssignee, setShowPerAssignee] = useState(false)
  // Закреплённое (по клику) окно тултипа графика — фиксируется на месте точки, прокручиваемое.
  const [pinnedAssignee, setPinnedAssignee] =
    useState<{ label: string; groups: BreakdownGroup[]; x: number; y: number } | null>(null)
  // Последняя наведённая точка графика по ответственным (для фиксации по клику).
  const assigneeHoverRef = useRef<HoverCap | null>(null)
  // Контейнер графика (для вычисления границ при позиционировании закреплённого окна).
  const assigneeChartBoxRef = useRef<HTMLDivElement | null>(null)

  // То же для нижнего графика «Динаміка заявок» (разбивка ИЛИ обычные метрики).
  const [pinnedMain, setPinnedMain] =
    useState<{ label: string; x: number; y: number; groups?: BreakdownGroup[]; metrics?: MetricItem[] } | null>(null)
  const mainHoverRef = useRef<HoverCap | null>(null)
  const mainChartBoxRef = useRef<HTMLDivElement | null>(null)
  const [assigneeTs, setAssigneeTs] =
    useState<NonNullable<ReportResponse['timeseriesBreakdown']> | null>(null)
  const [assigneeTsLoading, setAssigneeTsLoading] = useState(false)
  // filterGclid — константа 'any', без отдельного контрола (промпт 025)
  const filterGclid = 'any' as const

  // ── Состояние данных ───────────────────────────────────────────────────────

  const [report,  setReport]  = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  // Разрез «Додаткове поле» требует выбора конкретного поля. Пока оно не выбрано —
  // показываем мягкую подсказку вместо технической ошибки валидации с сервера.
  const [needsField, setNeedsField] = useState(false)

  // ── Состояние диалога конструктора выгрузки ────────────────────────────────
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // ── Справочники ────────────────────────────────────────────────────────────

  const [assignees,     setAssignees]     = useState<Assignee[]>([])
  const [statuses,      setStatuses]      = useState<Status[]>([])
  const [customFields,  setCustomFields]  = useState<CustomField[]>([])
  const [referralLinks, setReferralLinks] = useState<ReferralRef[]>([])

  // ── Состояние таблицы ─────────────────────────────────────────────────────

  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Загрузка справочников ──────────────────────────────────────────────────

  useEffect(() => {
    // Справочники — из клиентского кэша (общего со списком и карточкой заявок).
    fetchDictionary<{ data?: Assignee[] }>('/api/admin/assignees').then((j) => setAssignees(j.data ?? []))
    fetchDictionary<{ data?: Status[] }>('/api/admin/lead-statuses').then((j) => setStatuses(j.data ?? []))
    fetchDictionary<{ data?: CustomField[] } | CustomField[]>('/api/admin/custom-fields').then((j) => {
      setCustomFields(Array.isArray(j) ? j : (j.data ?? []))
    })
    // Реферальные ссылки (справочник названий партнёров; без права — пустой список)
    fetchDictionary<{ data?: ReferralRef[] }>('/api/admin/referral-links').then((j) => setReferralLinks(j.data ?? []))
  }, [])


  // ── Обновление URL при смене метрик / гранулярности / breakdown ────────────

  function updateUrlParams(
    metrics: MetricKey[],
    granularity: TsGranularity,
    bd: BreakdownDimension,
    cfId: string = customFieldId,
  ) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('metrics', metrics.join(','))
    params.set('granularity', granularity)
    params.set('breakdown', bd)
    // custom_field_id храним в URL только для разреза «Додаткове поле».
    if (bd === 'custom_field' && cfId) params.set('custom_field_id', cfId)
    else params.delete('custom_field_id')
    // URL обновляем через History API: router.replace на динамической странице — это лишний серверный
    // проход (middleware + гард + RSC) на каждый клик по контролу; useSearchParams видит изменение и так.
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
  }

  function handleMetricsChange(keys: MetricKey[]) {
    setSelectedMetrics(keys)
    updateUrlParams(keys, tsGranularity, breakdown)
    // В режиме breakdown набор метрик влияет на серверные серии → перезапрос.
    // (useEffect ниже и так сработает, потому что selectedMetrics в зависимостях fetchReport.)
  }

  function handleGranularityChange(val: string) {
    if (!val || !['day', 'week', 'month'].includes(val)) return
    const g = val as TsGranularity
    setTsGranularity(g)
    updateUrlParams(selectedMetrics, g, breakdown)
    // Отчёт перезапросит useEffect (tsGranularity в зависимостях fetchReport) — без второго запроса.
  }

  function handleBreakdownChange(val: BreakdownDimension) {
    setBreakdown(val)
    updateUrlParams(selectedMetrics, tsGranularity, val)
    // Перезапрос — через useEffect (breakdown в зависимостях fetchReport).
  }

  function handleCustomFieldChange(id: string) {
    setCustomFieldId(id)
    updateUrlParams(selectedMetrics, tsGranularity, breakdown, id)
    // Перезапрос — через useEffect (customFieldId в зависимостях fetchReport).
  }

  // Сброс всех фильтров к дефолтам. Отчёт перезагрузится сам (фильтры в deps fetchReport).
  function resetFilters() {
    setDateFrom(getDefaultDateFrom())
    setDateTo(getDefaultDateTo())
    setFilterUtmSource('all')
    setFilterService('all')
    setFilterAssigneeIds([])
    setFilterStatusIds([])
    setFilterReferralLinkId('all')
    setBreakdown('none')
    setCustomFieldId('')
    // Сброс оставляет одну метрику — «Заявки» (а не дефолтные две)
    setSelectedMetrics(['total'])
    updateUrlParams(['total'], tsGranularity, 'none', '')
  }

  // ── Фетч отчёта ────────────────────────────────────────────────────────────

  const fetchReport = useCallback(async () => {
    await fetchReportWith({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, groupBy, customFieldId, filterUtmSource, filterService, filterAssigneeIds, filterStatusIds, filterReferralLinkId, tsGranularity, breakdown, selectedMetrics])

  async function fetchReportWith({
    overrideGranularity,
    overrideBreakdown,
    overrideCustomFieldId,
  }: {
    overrideGranularity?: TsGranularity
    overrideBreakdown?: BreakdownDimension
    overrideCustomFieldId?: string
  }) {
    // Разрез таблицы = текущая разбивка (none → «Джерело»). Берём от bd/cfId
    // (override), чтобы немедленный refetch после смены «Розбити за» / поля не
    // использовал устаревшее значение стейта.
    const bd = overrideBreakdown ?? breakdown
    const gb: GroupBy = bd === 'none' ? 'utm_source' : (bd as GroupBy)
    const cfId = overrideCustomFieldId ?? customFieldId

    // Разрез «Додаткове поле» без выбранного поля — не шлём запрос (сервер ответил бы
    // технической ошибкой про custom_field_id). Вместо этого показываем подсказку.
    if (gb === 'custom_field' && !cfId) {
      setNeedsField(true)
      setError(null)
      setReport(null)
      setLoading(false)
      return
    }
    setNeedsField(false)
    setLoading(true)
    setError(null)
    try {
      const g  = overrideGranularity ?? tsGranularity
      // Таймсерия-разбивка по кастом-полю на бэкенде не поддерживается: для
      // custom_field график остаётся совокупным (breakdown='none'), а сводная
      // таблица группируется по значению поля (group_by='custom_field').
      const serverBreakdown: BreakdownDimension = bd === 'custom_field' ? 'none' : bd

      const params = new URLSearchParams({
        date_from:       dateFrom,
        date_to:         dateTo,
        group_by:        gb,
        ts_granularity:  g,
        breakdown:       serverBreakdown,
      })
      // В режиме breakdown передаём набор метрик (мультилинии: измерение × метрика)
      if (serverBreakdown !== 'none') {
        params.set('breakdown_metrics', toBreakdownMetrics(selectedMetrics).join(','))
      }
      if (filterUtmSource  && filterUtmSource  !== 'all') params.set('filter_utm_source',  filterUtmSource)
      if (filterService    && filterService    !== 'all') params.set('filter_service',     filterService)
      if (filterAssigneeIds.length > 0) params.set('filter_assignee_ids', filterAssigneeIds.join(','))
      if (filterStatusIds.length > 0) params.set('filter_status_ids', filterStatusIds.join(','))
      if (filterReferralLinkId !== 'all') params.set('filter_referral_link_id', filterReferralLinkId)
      if (gb === 'custom_field' && cfId) params.set('custom_field_id', cfId)
      // filter_gclid='any' — не передаём (дефолт на сервере)

      const res = await fetch(`/api/admin/analytics/report?${params}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const serverMsg = (j as { error?: string }).error ?? ''
        if ((j as { code?: string }).code === 'TOO_MANY_ROWS') {
          setError('Забагато даних. Звузіть діапазон дат.')
        } else if (serverMsg.includes('custom_field_id')) {
          // Техническую валидационную ошибку показываем человеческим языком.
          setError('Оберіть додаткове поле у списку «Оберіть поле», щоб побудувати звіт.')
        } else {
          setError(serverMsg || `Помилка сервера (${res.status})`)
        }
        return
      }
      const data: ReportResponse = await res.json()
      setReport(data)
    } catch {
      setError('Не вдалося завантажити звіт. Перевірте підключення.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  // График по менеджерам рисует КАЖДУЮ выбранную метрику отдельной линией на менеджера
  // (без суммирования): менеджер × метрика. Если метрик не выбрано — «Заявки» (total).
  const assigneeMetrics: MetricKeyForBreakdown[] = (() => {
    const sel = toBreakdownMetrics(selectedMetrics)
    return sel.length > 0 ? sel : ['total']
  })()
  const assigneeMetricsParam = assigneeMetrics.join(',')

  // Динамика по каждому менеджеру (breakdown=assigned_to) на тех же фильтрах, что и отчёт.
  // Серии = менеджер × метрика. Тянем только когда блок развёрнут.
  useEffect(() => {
    if (!showPerAssignee) return
    let cancelled = false
    setAssigneeTsLoading(true)
    const params = new URLSearchParams({
      date_from:         dateFrom,
      date_to:           dateTo,
      group_by:          'assigned_to',
      ts_granularity:    tsGranularity,
      breakdown:         'assigned_to',
      breakdown_metrics: assigneeMetricsParam,
    })
    if (filterUtmSource && filterUtmSource !== 'all') params.set('filter_utm_source', filterUtmSource)
    if (filterService && filterService !== 'all') params.set('filter_service', filterService)
    if (filterAssigneeIds.length > 0) params.set('filter_assignee_ids', filterAssigneeIds.join(','))
    if (filterStatusIds.length > 0) params.set('filter_status_ids', filterStatusIds.join(','))
    if (filterReferralLinkId !== 'all') params.set('filter_referral_link_id', filterReferralLinkId)

    fetch(`/api/admin/analytics/report?${params}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setAssigneeTs(j.timeseriesBreakdown ?? null) })
      .catch(() => { if (!cancelled) setAssigneeTs(null) })
      .finally(() => { if (!cancelled) setAssigneeTsLoading(false) })

    return () => { cancelled = true }
  }, [showPerAssignee, dateFrom, dateTo, tsGranularity, assigneeMetricsParam,
      filterUtmSource, filterService, filterAssigneeIds, filterStatusIds, filterReferralLinkId])

  // ── Сортировка таблицы ─────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function getSortDir(key: SortKey): SortDir {
    return sortKey === key ? sortDir : null
  }

  const sortedRows = report
    ? [...report.rows].sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        const diff =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv), 'uk')
        return sortDir === 'asc' ? diff : -diff
      })
    : []

  // ── Клик-заголовок таблицы ─────────────────────────────────────────────────

  function Th({
    col,
    children,
    className = '',
  }: {
    col: SortKey
    children: React.ReactNode
    className?: string
  }) {
    return (
      <TableHead
        className={`cursor-pointer select-none whitespace-nowrap ${className}`}
        onClick={() => handleSort(col)}
      >
        {children}
        <SortIcon dir={getSortDir(col)} />
      </TableHead>
    )
  }

  // Название текущего разреза — для заголовка таблицы и шапки колонки,
  // чтобы было видно, что сводная таблица отображает именно выбранный разрез.
  const groupByLabel =
    groupBy === 'custom_field'
      ? customFields.find((cf) => cf.id === customFieldId)?.name ?? 'Додаткове поле'
      : GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'Розріз'

  // ── Метрики графика, доступные с учётом флагов ────────────────────────────

  const visibleMetrics = report
    ? METRICS.filter((m) => !m.requiresFlag || report.flags[m.requiresFlag])
    : METRICS.filter((m) => !m.requiresFlag)

  // Метрики только из selected, которые реально отображаются
  const activeMetrics = visibleMetrics.filter((m) => selectedMetrics.includes(m.key))
  const hasMoneyMetric = activeMetrics.some((m) => m.isMoney)

  // Очищенные подписи серий для легенд/тултипов (убирают дублированный разрез)
  const breakdownSeriesLabels = report?.timeseriesBreakdown
    ? buildSeriesLabelMap(report.timeseriesBreakdown.series)
    : null
  // График по менеджерам: серии = менеджер × метрика (как главный breakdown).
  const assigneeSeriesLabels = assigneeTs ? buildSeriesLabelMap(assigneeTs.series) : null
  const assigneeMulti = assigneeMetrics.length > 1
  const assigneeAllMoney =
    assigneeMetrics.length > 0 &&
    assigneeMetrics.every((k) => METRICS.find((m) => m.key === k)?.isMoney)
  const assigneeMetricLabels = assigneeMetrics.map(
    (k) => METRICS.find((m) => m.key === k)?.label ?? k,
  )
  // Метаданные серий (измерение + метрика + денежная) для сгруппированного тултипа
  const assigneeSeriesMeta = new Map<string, BreakdownSeriesMeta>()
  if (assigneeTs) {
    const single = assigneeMetricLabels[0] ?? ''
    for (const s of assigneeTs.series) {
      const sep = s.label.indexOf(' · ')
      if (sep >= 0) {
        const metricLabel = s.label.slice(sep + 3)
        assigneeSeriesMeta.set(s.key, {
          dim: s.label.slice(0, sep),
          metricLabel,
          isMoney: !!METRICS.find((m) => m.label === metricLabel)?.isMoney,
        })
      } else {
        assigneeSeriesMeta.set(s.key, { dim: s.label, metricLabel: single, isMoney: assigneeAllMoney })
      }
    }
  }
  const assigneeDims = Array.from(new Set(Array.from(assigneeSeriesMeta.values()).map((m) => m.dim)))
  // Если выбраны и счётные, и денежные метрики — деньги выносим на правую ось,
  // иначе денежные линии (десятки тысяч) «задавят» счётные (единицы).
  const assigneeHasMoney = assigneeMetrics.some((k) => METRICS.find((m) => m.key === k)?.isMoney)
  const assigneeHasCount = assigneeMetrics.some((k) => !METRICS.find((m) => m.key === k)?.isMoney)
  const assigneeMixed = assigneeHasMoney && assigneeHasCount
  // Значение метрики для строки итоговой таблицы (ключи метрик = поля AssigneeRow/ReportRow)
  const assigneeCell = (row: Record<string, number>, k: MetricKeyForBreakdown): string | number => {
    const v = Number(row[k] ?? 0)
    return METRICS.find((m) => m.key === k)?.isMoney ? fmtAmount(v) : v
  }

  // Все ли линии графика — денежная метрика (тогда форматируем суммы с валютой и округлением,
  // иначе из-за float получается «14752.230000000001»).
  const breakdownMetricKeys = toBreakdownMetrics(selectedMetrics)
  const breakdownAllMoney =
    breakdownMetricKeys.length > 0 &&
    breakdownMetricKeys.every((k) => METRICS.find((m) => m.key === k)?.isMoney)

  // Метаданные серий разбивки (измерение + метрика + денежная) для сгруппированного тултипа
  const singleMetricLabel = METRICS.find((m) => m.key === breakdownMetricKeys[0])?.label ?? ''
  const breakdownSeriesMeta = new Map<string, BreakdownSeriesMeta>()
  if (report?.timeseriesBreakdown) {
    for (const s of report.timeseriesBreakdown.series) {
      const sep = s.label.indexOf(' · ')
      if (sep >= 0) {
        const metricLabel = s.label.slice(sep + 3)
        breakdownSeriesMeta.set(s.key, {
          dim: s.label.slice(0, sep),
          metricLabel,
          isMoney: !!METRICS.find((m) => m.label === metricLabel)?.isMoney,
        })
      } else {
        // одна метрика → в подписи только измерение
        breakdownSeriesMeta.set(s.key, {
          dim: s.label,
          metricLabel: singleMetricLabel,
          isMoney: breakdownAllMoney,
        })
      }
    }
  }
  // Для компактной легенды при нескольких метриках: отдельно перечни разрезов и метрик
  const breakdownMulti = breakdownMetricKeys.length > 1
  const breakdownDims = Array.from(new Set(Array.from(breakdownSeriesMeta.values()).map((m) => m.dim)))
  const breakdownMetricLabels = breakdownMetricKeys.map(
    (k) => METRICS.find((m) => m.key === k)?.label ?? k,
  )

  // ── Breakdown-режим: активен ли ───────────────────────────────────────────

  const isBreakdownMode = breakdown !== 'none' && !!report?.timeseriesBreakdown

  // ── Рендер ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Панель фильтров ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Фільтри</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Строка 1: Диапазон дат.
              Быстрые пресеты убраны — остался только ручной выбор периода.
              «Період» (День/Тиждень/Місяць) живёт над графиком. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-2">
              <DatePicker
                value={dateFrom}
                onChange={setDateFrom}
                ariaLabel="Дата від"
              />
              <span className="text-muted-foreground text-sm">—</span>
              <DatePicker
                value={dateTo}
                onChange={setDateTo}
                ariaLabel="Дата до"
              />
            </div>
          </div>

          {/* Строка 2: Дополнительные фильтры.
              «Розріз» убран — сводная таблица всегда группируется по «Джерело». */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Источник */}
            <Select value={filterUtmSource} onValueChange={setFilterUtmSource}>
              <SelectTrigger className="h-9 w-40" aria-label="Джерело">
                <SelectValue placeholder="Всі джерела" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі джерела</SelectItem>
                {['google', 'facebook', 'instagram', 'tiktok', 'organic', 'direct'].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Услуга */}
            <Select value={filterService} onValueChange={setFilterService}>
              <SelectTrigger className="h-9 w-44" aria-label="Послуга">
                <SelectValue placeholder="Всі послуги" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі послуги</SelectItem>
                {SERVICE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Ответственные — мультиселект */}
            <AssigneeMultiSelect
              assignees={assignees}
              selected={filterAssigneeIds}
              onChange={setFilterAssigneeIds}
            />

            {/* Стадия — мультиселект */}
            <StatusMultiSelect
              statuses={statuses}
              selected={filterStatusIds}
              onChange={setFilterStatusIds}
            />

            {/* Реферальная ссылка (партнёр) */}
            <Select value={filterReferralLinkId} onValueChange={setFilterReferralLinkId}>
              <SelectTrigger className="h-9 w-48" aria-label="Реферальне посилання">
                <SelectValue placeholder="Всі партнери" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі партнери</SelectItem>
                <SelectItem value="none">Без посилання</SelectItem>
                {referralLinks.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}{l.is_active ? '' : ' (вимкнене)'}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* «Розбити за» — разбивка графика по измерению (перенесено из шапки графика) */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Розбити за:</span>
              <Select
                value={breakdown}
                onValueChange={(v) => handleBreakdownChange(v as BreakdownDimension)}
              >
                <SelectTrigger className="h-9 w-44" aria-label="Розбити за">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREAKDOWN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Пикер конкретного кастом-поля — только для разреза «Додаткове поле» */}
            {breakdown === 'custom_field' && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Поле:</span>
                <Select value={customFieldId} onValueChange={handleCustomFieldChange}>
                  <SelectTrigger className="h-9 w-44" aria-label="Оберіть додаткове поле">
                    <SelectValue placeholder="Оберіть поле" />
                  </SelectTrigger>
                  <SelectContent>
                    {customFields.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Немає додаткових полів
                      </div>
                    ) : (
                      customFields.map((cf) => (
                        <SelectItem key={cf.id} value={cf.id}>{cf.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Метрики графика — компактный мультивыбор (перенесено из шапки графика) */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Метрики:</span>
              <MetricMultiSelect
                metrics={breakdown !== 'none'
                  ? METRICS.filter((m) => m.key !== 'dealAdjustments')
                  : METRICS}
                selected={selectedMetrics}
                onChange={handleMetricsChange}
                flags={report?.flags ?? { hasProfitStages: false, hasDealAdjustmentStages: false }}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              aria-label="Скинути всі фільтри"
              className="h-9"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Скинути фільтри
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Скелетон / ошибка ── */}
      {/* Скелетон — ТОЛЬКО при первой загрузке (пока отчёта ещё нет).
          При смене фильтров/разбивки отчёт остаётся на месте, без мигания. */}
      {loading && !report && <ReportSkeleton />}

      {!loading && needsField && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Оберіть додаткове поле у списку «Оберіть поле» праворуч від розрізу, щоб
              побачити звіт у розрізі цього поля.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !needsField && error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void fetchReport()}>
              Спробувати ще раз
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Отчёт показываем, если он есть и нет ошибки — даже во время фонового
          обновления (loading=true). Во время обновления немного приглушаем для фидбэка. */}
      {!error && report && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* ── Карточки метрик ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {/* Заявки */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Заявки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.total.total}</div>
                <p className="text-xs text-muted-foreground mt-1">За вибраний період</p>
              </CardContent>
            </Card>

            {/* Целевые лиды */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Цільові ліди</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.total.targetLeads}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtPct(report.total.conversionToTarget)} конверсія
                </p>
              </CardContent>
            </Card>

            {/* Нецелевые лиды */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Нецільові ліди</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.total.nonTargetLeads}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtPct(report.total.conversionToNonTarget)} від заявок
                </p>
              </CardContent>
            </Card>

            {/* Сделки */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Угоди</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.total.deals}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtPct(report.total.conversionToDeal)} конверсія
                </p>
              </CardContent>
            </Card>

            {/* Повторные сделки — только если есть соответствующие стадии */}
            {report.flags.hasDealAdjustmentStages && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Повторні угоди</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{report.total.dealAdjustments}</div>
                  <p className="text-xs text-muted-foreground mt-1">Корекції угод</p>
                </CardContent>
              </Card>
            )}

            {/* Сумма сделок */}
            <Card className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Сума угод</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmtAmount(report.total.dealAmountSum)}</div>
                {/* Прибыль — только если есть стадии с amount_is_profit */}
                {report.flags.hasProfitStages && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Прибуток: {fmtAmount(report.total.dealProfitSum)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Сводка по каждому менеджеру (разворачивается) ── */}
          {report.byAssignee.length > 0 && (
            <Card>
              <button
                type="button"
                onClick={() => setShowPerAssignee((v) => !v)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
                aria-expanded={showPerAssignee}
              >
                <div>
                  <CardTitle className="text-base">Зведення по кожному відповідальному</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {report.byAssignee.length}{' '}
                    {report.byAssignee.length === 1 ? 'відповідальний' : 'відповідальних'} ·{' '}
                    {assigneeMetricLabels.join(', ')} · ті самі фільтри ·{' '}
                    натисніть на точку, щоб зафіксувати підказку
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition-transform ${showPerAssignee ? 'rotate-180' : ''}`}
                />
              </button>
              {showPerAssignee && (
                <CardContent className="pt-0 space-y-4">
                  {/* Динамика: отдельная линия на КАЖДУЮ метрику каждого ответственного (без суммирования) */}
                  <div className="relative" ref={assigneeChartBoxRef}>
                    {assigneeTsLoading && !assigneeTs ? (
                      <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                        Завантаження…
                      </div>
                    ) : assigneeTs && assigneeTs.series.length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart
                          data={assigneeTs.points}
                          margin={{ left: assigneeAllMoney ? 8 : -10, right: assigneeMixed ? 16 : 8, top: 4, bottom: 4 }}
                          onClick={() => {
                            const cap = assigneeHoverRef.current
                            if (!cap || !cap.payload.length) return
                            setPinnedAssignee({
                              label: cap.label,
                              groups: groupBreakdownPayload(cap.payload, assigneeSeriesMeta),
                              x: cap.x,
                              y: cap.y,
                            })
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11 }}
                            interval={
                              assigneeTs.points.length > 30 ? 6
                              : assigneeTs.points.length > 14 ? 2
                              : 0
                            }
                          />
                          {/* Левая ось — счётные (или все, если одна единица) */}
                          <YAxis
                            yAxisId="count"
                            tick={{ fontSize: 11 }}
                            allowDecimals={false}
                            width={assigneeAllMoney ? 64 : 36}
                            tickFormatter={assigneeAllMoney ? (v) => fmtAmount(Number(v)) : undefined}
                          />
                          {/* Правая ось — денежные, только при смешанном выборе */}
                          {assigneeMixed && (
                            <YAxis
                              yAxisId="money"
                              orientation="right"
                              tick={{ fontSize: 11 }}
                              width={80}
                              tickFormatter={(v: number) =>
                                new Intl.NumberFormat('uk-UA', {
                                  notation: 'compact',
                                  maximumFractionDigits: 1,
                                }).format(v) + ' грн'
                              }
                            />
                          )}
                          <Tooltip content={<CapturingBreakdownTooltip meta={assigneeSeriesMeta} captureRef={assigneeHoverRef} suppress={!!pinnedAssignee} />} />
                          {assigneeMulti ? (
                            <Legend
                              content={() => (
                                <div className="text-xs text-muted-foreground pt-2 px-2 leading-relaxed text-center">
                                  <span className="font-medium text-foreground">Метрики:</span>{' '}
                                  {assigneeMetricLabels.join(', ')}
                                  {' · '}
                                  <span className="font-medium text-foreground">Відповідальні:</span>{' '}
                                  {assigneeDims.join(', ')}
                                  {' — значення у підказці при наведенні'}
                                </div>
                              )}
                            />
                          ) : (
                            <Legend
                              formatter={(value) => assigneeSeriesLabels?.get(String(value)) ?? value}
                            />
                          )}
                          {assigneeTs.series.map((s) => (
                            <Line
                              key={s.key}
                              yAxisId={assigneeMixed && assigneeSeriesMeta.get(s.key)?.isMoney ? 'money' : 'count'}
                              type="monotone"
                              dataKey={(p: { values?: Record<string, number> }) => p?.values?.[s.key] ?? 0}
                              stroke={s.color}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                              name={s.key}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                        Немає даних за період
                      </div>
                    )}

                    {/* Закреплённое окно (по клику) — фиксируется на месте точки, прокручиваемое */}
                    {pinnedAssignee && (() => {
                      const PANEL_W = 300
                      const boxW = assigneeChartBoxRef.current?.clientWidth ?? 0
                      // Если точка в правой части — показываем окно слева от неё, иначе справа.
                      const left = boxW && pinnedAssignee.x + 12 + PANEL_W > boxW
                        ? Math.max(4, pinnedAssignee.x - PANEL_W - 12)
                        : pinnedAssignee.x + 12
                      const top = Math.max(4, pinnedAssignee.y - 12)
                      return (
                      <div
                        className="absolute z-10 w-[300px] max-h-[280px] overflow-y-auto rounded-md border bg-background px-3 py-2 text-xs shadow-lg"
                        style={{ left, top }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5 sticky top-0 bg-background pb-1">
                          <span className="font-medium flex items-center gap-1">
                            <Pin className="h-3 w-3 text-primary" />
                            {pinnedAssignee.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPinnedAssignee(null)}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                            aria-label="Закрити"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <BreakdownGroupsGrid groups={pinnedAssignee.groups} />
                      </div>
                      )
                    })()}
                  </div>

                  {/* Итог за весь выбранный период — строка на ответственного, колонки = выбранные метрики */}
                  <div className="overflow-x-auto border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
                      Підсумок за період
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Відповідальний</TableHead>
                          {assigneeMetrics.map((k) => (
                            <TableHead key={k} className="text-right">
                              {METRICS.find((m) => m.key === k)?.label ?? k}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.byAssignee.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">{row.label}</TableCell>
                            {assigneeMetrics.map((k) => (
                              <TableCell key={k} className="text-right tabular-nums">
                                {assigneeCell(row as unknown as Record<string, number>, k)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold border-t-2">
                          <TableCell>Разом</TableCell>
                          {assigneeMetrics.map((k) => (
                            <TableCell key={k} className="text-right tabular-nums">
                              {assigneeCell(report.total as unknown as Record<string, number>, k)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* ── Главный график ── */}
          {(report.timeseries.length > 0 || report.timeseriesBreakdown) && (
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base">Динаміка заявок</CardTitle>
                  {/* Переключатель гранулярности — всегда видимый */}
                  <ToggleGroup
                    type="single"
                    value={tsGranularity}
                    onValueChange={handleGranularityChange}
                    className="border rounded-md p-0.5"
                  >
                    <ToggleGroupItem value="day"   className="text-xs px-3 py-1.5">По днях</ToggleGroupItem>
                    <ToggleGroupItem value="week"  className="text-xs px-3 py-1.5">По тижнях</ToggleGroupItem>
                    <ToggleGroupItem value="month" className="text-xs px-3 py-1.5">По місяцях</ToggleGroupItem>
                  </ToggleGroup>
                </div>

              </CardHeader>
              <CardContent>
               <div className="relative" ref={mainChartBoxRef}>
                {/* нажмите на точку, чтобы зафиксировать подсказку */}
                {/* Режим breakdown: отдельные линии по измерению */}
                {isBreakdownMode && report.timeseriesBreakdown ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={report.timeseriesBreakdown.points}
                      margin={{ left: -10, right: 8, top: 4, bottom: 4 }}
                      onClick={() => {
                        const cap = mainHoverRef.current
                        if (!cap || !cap.payload.length) return
                        setPinnedMain({
                          label: cap.label, x: cap.x, y: cap.y,
                          groups: groupBreakdownPayload(cap.payload, breakdownSeriesMeta),
                        })
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        interval={
                          report.timeseriesBreakdown.points.length > 30 ? 6
                          : report.timeseriesBreakdown.points.length > 14 ? 2
                          : 0
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                        width={breakdownAllMoney ? 64 : 36}
                        tickFormatter={breakdownAllMoney ? (v) => fmtAmount(Number(v)) : undefined}
                      />
                      <Tooltip content={<CapturingBreakdownTooltip meta={breakdownSeriesMeta} captureRef={mainHoverRef} suppress={!!pinnedMain} />} />
                      {breakdownMulti ? (
                        // Компактная легенда: без кросс-произведения (источник×метрика).
                        // Детали/значения — в подсказке при наведении.
                        <Legend
                          content={() => (
                            <div className="text-xs text-muted-foreground pt-2 px-2 leading-relaxed text-center">
                              <span className="font-medium text-foreground">Метрики:</span>{' '}
                              {breakdownMetricLabels.join(', ')}
                              {' · '}
                              <span className="font-medium text-foreground">Розрізи:</span>{' '}
                              {breakdownDims.join(', ')}
                              {' — значення у підказці при наведенні'}
                            </div>
                          )}
                        />
                      ) : (
                        <Legend
                          formatter={(value) => breakdownSeriesLabels?.get(String(value)) ?? value}
                        />
                      )}
                      {report.timeseriesBreakdown.series.map((s) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={(p: { values?: Record<string, number> }) => p?.values?.[s.key] ?? 0}
                          stroke={s.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          name={s.key}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  /* Стандартный режим: мультиметрики */
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={report.timeseries}
                      margin={{ left: hasMoneyMetric ? 8 : -10, right: hasMoneyMetric ? 16 : 8, top: 4, bottom: 4 }}
                      onClick={() => {
                        const cap = mainHoverRef.current
                        if (!cap || !cap.payload.length) return
                        setPinnedMain({ label: cap.label, x: cap.x, y: cap.y, metrics: payloadToMetrics(cap.payload) })
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        interval={
                          report.timeseries.length > 30 ? 6
                          : report.timeseries.length > 14 ? 2
                          : 0
                        }
                      />
                      {/* Левая ось — количественные метрики */}
                      <YAxis
                        yAxisId="count"
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                        width={36}
                      />
                      {/* Правая ось — денежные метрики (только если есть) */}
                      {hasMoneyMetric && (
                        <YAxis
                          yAxisId="money"
                          orientation="right"
                          tick={{ fontSize: 11 }}
                          width={80}
                          tickFormatter={(v: number) =>
                            new Intl.NumberFormat('uk-UA', {
                              notation: 'compact',
                              maximumFractionDigits: 1,
                            }).format(v) + ' грн'
                          }
                        />
                      )}
                      <Tooltip content={<CapturingMetricTooltip captureRef={mainHoverRef} suppress={!!pinnedMain} />} />
                      <Legend
                        formatter={(value) => METRICS.find((m) => m.key === value)?.label ?? value}
                      />
                      {activeMetrics.map((m) => (
                        <Line
                          key={m.key}
                          yAxisId={m.isMoney ? 'money' : 'count'}
                          type="monotone"
                          dataKey={m.key}
                          stroke={m.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          name={m.key}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {/* Закреплённое окно (по клику) — фиксируется на месте точки, прокручиваемое */}
                {pinnedMain && (() => {
                  const PANEL_W = 280
                  const boxW = mainChartBoxRef.current?.clientWidth ?? 0
                  const left = boxW && pinnedMain.x + 12 + PANEL_W > boxW
                    ? Math.max(4, pinnedMain.x - PANEL_W - 12)
                    : pinnedMain.x + 12
                  const top = Math.max(4, pinnedMain.y - 12)
                  return (
                    <div
                      className="absolute z-10 w-[280px] max-h-[260px] overflow-y-auto rounded-md border bg-background px-3 py-2 text-xs shadow-lg"
                      style={{ left, top }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5 sticky top-0 bg-background pb-1">
                        <span className="font-medium flex items-center gap-1">
                          <Pin className="h-3 w-3 text-primary" />
                          {pinnedMain.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPinnedMain(null)}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          aria-label="Закрити"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {pinnedMain.groups
                        ? <BreakdownGroupsGrid groups={pinnedMain.groups} />
                        : <MetricsList items={pinnedMain.metrics ?? []} />}
                    </div>
                  )
                })()}
               </div>
              </CardContent>
            </Card>
          )}


          {/* ── Сводная таблица ── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">
                Зведена таблиця · розріз: {groupByLabel}
                {report.filteredCount > 0 && (
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    ({report.filteredCount} заявок)
                  </span>
                )}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportDialogOpen(true)}
                aria-label="Відкрити конструктор вивантаження"
              >
                <Download className="h-4 w-4 mr-1" />
                Експорт
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {report.rows.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  За вибраний період заявок не знайдено.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <Th col="label">{groupByLabel}</Th>
                        <Th col="total"              className="text-right">Заявки</Th>
                        <Th col="targetLeads"        className="text-right">Цільові</Th>
                        <Th col="nonTargetLeads"     className="text-right">Нецільові</Th>
                        {/* Порядок колонок = SUMMARY_COLUMN_ORDER (core/domain/analytics/export): «Конв. цільові»
                            сразу после «Нецільові»; шапка, строки и «Разом» меняются ТОЛЬКО вместе. */}
                        <Th col="conversionToTarget" className="text-right">Конв. цільові</Th>
                        <Th col="deals"              className="text-right">Угоди</Th>
                        {report.flags.hasDealAdjustmentStages && (
                          <Th col="dealAdjustments"  className="text-right">Повторні</Th>
                        )}
                        <Th col="dealAmountSum"      className="text-right">Сума угод</Th>
                        {report.flags.hasProfitStages && (
                          <Th col="dealProfitSum"    className="text-right">Прибуток</Th>
                        )}
                        <Th col="conversionToDeal"   className="text-right">Конв. угоди</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {row.color && (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: row.color }}
                                />
                              )}
                              <span>
                                {groupBy === 'service'
                                  ? getServiceLabel(row.label)
                                  : row.label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.targetLeads}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.nonTargetLeads}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(row.conversionToTarget)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.deals}</TableCell>
                          {report.flags.hasDealAdjustmentStages && (
                            <TableCell className="text-right tabular-nums">{row.dealAdjustments}</TableCell>
                          )}
                          <TableCell className="text-right tabular-nums">{fmtAmount(row.dealAmountSum)}</TableCell>
                          {report.flags.hasProfitStages && (
                            <TableCell className="text-right tabular-nums">{fmtAmount(row.dealProfitSum)}</TableCell>
                          )}
                          <TableCell className="text-right tabular-nums">{fmtPct(row.conversionToDeal)}</TableCell>
                        </TableRow>
                      ))}

                      {/* Строка «Разом» — всегда внизу, вне сортировки */}
                      <TableRow className="bg-muted/50 font-semibold border-t-2">
                        <TableCell>Разом</TableCell>
                        <TableCell className="text-right tabular-nums">{report.total.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{report.total.targetLeads}</TableCell>
                        <TableCell className="text-right tabular-nums">{report.total.nonTargetLeads}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(report.total.conversionToTarget)}</TableCell>
                        <TableCell className="text-right tabular-nums">{report.total.deals}</TableCell>
                        {report.flags.hasDealAdjustmentStages && (
                          <TableCell className="text-right tabular-nums">{report.total.dealAdjustments}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">{fmtAmount(report.total.dealAmountSum)}</TableCell>
                        {report.flags.hasProfitStages && (
                          <TableCell className="text-right tabular-nums">{fmtAmount(report.total.dealProfitSum)}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">{fmtPct(report.total.conversionToDeal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Диалог конструктора выгрузки ── */}
      <ExportBuilderDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        dateFrom={dateFrom}
        dateTo={dateTo}
        filterUtmSource={filterUtmSource}
        filterService={filterService}
        filterAssigneeIds={filterAssigneeIds}
        filterStatusIds={filterStatusIds}
        filterReferralLinkId={filterReferralLinkId}
        filterGclid={filterGclid}
        granularity={tsGranularity}
        flags={{
          hasProfitStages: report?.flags.hasProfitStages ?? false,
          hasDealAdjustmentStages: report?.flags.hasDealAdjustmentStages ?? false,
        }}
      />
    </div>
  )
}
