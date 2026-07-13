'use client'

// Панель налаштувань /admin/settings. 4 секції в одному компоненті:
// • Загальні (валюта)
// • Дедуплікація (флаги + вікно годин)
// • Стадії лідів (CRUD + dnd reorder + is_initial + conversion_type + conversion_action)
// • Кастомні поля (CRUD + опції для select)

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, GripVertical, HelpCircle, Plus, RefreshCw, Save, Send, Trash2, Upload, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { validateConversionAction } from '@/lib/conversion-action'
import { StatusBadge } from './status-badge'
import { AnalyticsEventsSection } from './analytics-events-section'
import { DevToolsSection } from './dev-tools-section'

// ── Типи ─────────────────────────────────────────────────────────────────────
type SettingRow = { key: string; value: string; type: string; updated_at: string }

type ConversionType = 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment' | null

type Status = {
  id: string
  name: string
  color: string
  position: number
  is_final: boolean
  is_initial: boolean
  conversion_type: ConversionType
  conversion_action: string | null
  requires_amount: boolean
  amount_is_profit: boolean
  allowed_next_status_ids: string[]
  allowed_prev_status_ids: string[]
}

type CustomField = {
  id: string
  name: string
  field_key: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options: string[] | null
  required: boolean
  position: number
}

type Tab = 'general' | 'dedup' | 'statuses' | 'fields' | 'telephony' | 'gsheets' | 'analytics' | 'devtools'

// Dev tools — приховано за env-прапором. Клієнт (навіть Власник) вкладки не бачить
// і не має до неї доступу. Розробник вмикає у своєму оточенні: NEXT_PUBLIC_DEV_TOOLS=1.
const DEV_TOOLS_ENABLED = process.env.NEXT_PUBLIC_DEV_TOOLS === '1'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'Загальні' },
  { id: 'dedup', label: 'Дедуплікація' },
  { id: 'statuses', label: 'Стадії лідів' },
  { id: 'fields', label: 'Кастомні поля' },
  { id: 'telephony', label: 'Телефонія' },
  { id: 'gsheets', label: 'Google Sheets' },
  { id: 'analytics', label: 'Події аналітики' },
  ...(DEV_TOOLS_ENABLED ? [{ id: 'devtools' as Tab, label: 'Dev tools' }] : []),
]

// ── Кореневий компонент ─────────────────────────────────────────────────────
export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('general')

  return (
    <div className="space-y-4">
      <div className="flex border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-5">
        {activeTab === 'general' && <GeneralSection />}
        {activeTab === 'dedup' && <DedupSection />}
        {activeTab === 'statuses' && <StatusesSection />}
        {activeTab === 'fields' && <CustomFieldsSection />}
        {activeTab === 'telephony' && <TelephonySection />}
        {activeTab === 'gsheets' && <GoogleSheetsSection />}
        {activeTab === 'analytics' && <AnalyticsEventsSection />}
        {DEV_TOOLS_ENABLED && activeTab === 'devtools' && <DevToolsSection />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секція: ЗАГАЛЬНІ — валюта
// ─────────────────────────────────────────────────────────────────────────────
function GeneralSection() {
  const [currency, setCurrency] = useState<string>('UAH')
  const [conversionAction, setConversionAction] = useState<string>('Lead')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((j) => {
        const rows: SettingRow[] = j.data ?? []
        const find = (k: string) => rows.find((r) => r.key === k)?.value
        setCurrency(find('internal_currency') ?? 'UAH')
        setConversionAction(find('google_ads_conversion_action') ?? 'Lead')
        // deal_amount_type більше не читаємо — логіка перенесена на рівень стадії (amount_is_profit)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { key: 'internal_currency', value: currency, type: 'string' },
            { key: 'google_ads_conversion_action', value: conversionAction.trim() || 'Lead', type: 'string' },
          ],
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return
      }
      toast.success('Збережено')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-32 w-full" />

  return (
    <div className="space-y-5 max-w-md">
      <div>
        <h2 className="font-semibold">Загальні налаштування</h2>
      </div>

      <div>
        <Label className="text-xs mb-1.5 block">Внутрішня валюта</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Використовується для відображення сум угод у CRM.
        </p>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UAH">UAH — гривня</SelectItem>
            <SelectItem value="USD">USD — долар США</SelectItem>
            <SelectItem value="EUR">EUR — євро</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs mb-1.5 block">Назва конверсії Google Ads (глобальна)</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Запасне значення. Для кожної стадії можна вказати окрему назву конверсії у розділі «Стадії лідів».
        </p>
        <Input
          value={conversionAction}
          onChange={(e) => setConversionAction(e.target.value)}
          placeholder="Lead"
          className="w-48"
          maxLength={64}
        />
      </div>

      <Button onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" /> Зберегти
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секція: ДЕДУПЛІКАЦІЯ
// ─────────────────────────────────────────────────────────────────────────────
function DedupSection() {
  const [byPhone, setByPhone] = useState(true)
  const [byIp, setByIp] = useState(true)
  const [hours, setHours] = useState('24')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((j) => {
        const rows: SettingRow[] = j.data ?? []
        const find = (k: string) => rows.find((r) => r.key === k)?.value
        setByPhone((find('dedup_by_phone') ?? 'true') === 'true')
        setByIp((find('dedup_by_ip') ?? 'true') === 'true')
        setHours(find('dedup_ip_window_hours') ?? '24')
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    const h = parseInt(hours, 10)
    if (!Number.isFinite(h) || h <= 0) {
      toast.error('Вікно: ціле число > 0')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { key: 'dedup_by_phone', value: byPhone, type: 'boolean' },
            { key: 'dedup_by_ip', value: byIp, type: 'boolean' },
            { key: 'dedup_ip_window_hours', value: h, type: 'number' },
          ],
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return
      }
      toast.success('Збережено')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="font-semibold">Дедуплікація лідів</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Повторні звернення не створюють нові ліди — оригінал маркується як 🔄
          з system-комментарем у журналі.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={byPhone}
            onCheckedChange={(v) => setByPhone(v === true)}
          />
          <div>
            <div className="text-sm font-medium">За номером телефону</div>
            <div className="text-xs text-muted-foreground">
              Точне співпадіння нормалізованого +380XXXXXXXXX
            </div>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={byIp}
            onCheckedChange={(v) => setByIp(v === true)}
          />
          <div>
            <div className="text-sm font-medium">За IP-адресою</div>
            <div className="text-xs text-muted-foreground">У межах вікна часу</div>
          </div>
        </label>

        <div className="ml-7">
          <Label className="text-xs mb-1.5 block">Вікно дедупу по IP (годин)</Label>
          <Input
            type="number"
            min="1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-32"
            disabled={!byIp}
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" /> Зберегти
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секція: СТАДІЇ ЛІДІВ — список + dnd reorder + conversion_type + conversion_action
// ─────────────────────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#059669', '#ec4899', '#06b6d4', '#6b7280', '#0ea5e9',
]

const CONVERSION_TYPE_LABELS: Record<NonNullable<ConversionType>, string> = {
  target_lead:     'Цільовий лід',
  non_target_lead: 'Нецільовий лід',
  deal:            'Угода',
  deal_adjustment: 'Корекція угоди (частина 2)',
}

// Tooltips для полів форми стадії
const TOOLTIPS = {
  isInitial: 'Нові заявки автоматично потрапляють у цю стадію. Лише одна стадія може бути первинною — при виборі нової попередня скидається.',
  isFinal: 'Стадія, після якої лід вважається закритим. Якщо задано тип конверсії — прапор виставляється автоматично.',
  conversionType: 'Визначає тип офлайн-конверсії для Google Ads. При переведенні ліда у цю стадію буде зафіксовано конверсію відповідного типу.',
  conversionAction: 'Імʼя конверсії з Google Ads. Використовується в офлайн-листі та корекціях.',
  requiresAmount: 'Якщо увімкнено — при переведенні ліда у цю стадію з\'явиться попап для введення суми угоди.',
  amountIsProfit: 'Якщо увімкнено — введена сума буде вважатися чистим прибутком, а не загальною сумою угоди.',
} as const

// ── Допоміжний компонент: іконка підказки ────────────────────────────────────
function FieldTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ml-1"
            aria-label="Підказка"
            tabIndex={-1}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Один рядок статусу у DnD-списку ──────────────────────────────────────────
type StatusRowProps = {
  status: Status
  allStatuses: Status[]
  pipelinesEnabled: boolean
  onColorChange: (s: Status, color: string) => void
  onIsInitialToggle: (s: Status) => void
  onIsFinalChange: (s: Status, val: boolean) => void
  onConversionTypeChange: (s: Status, val: ConversionType) => void
  onConversionActionBlur: (s: Status, val: string) => void
  onRequiresAmountChange: (s: Status, val: boolean) => void
  onAmountIsProfitChange: (s: Status, val: boolean) => void
  onRemove: (s: Status) => void
  onAllowedPrevToggle: (statusId: string, prevId: string, checked: boolean) => void
  onAllowedNextToggle: (s: Status, targetId: string, checked: boolean) => void
}

function StatusRow({
  status: s,
  allStatuses,
  pipelinesEnabled,
  onColorChange,
  onIsInitialToggle,
  onIsFinalChange,
  onConversionTypeChange,
  onConversionActionBlur,
  onRequiresAmountChange,
  onAmountIsProfitChange,
  onRemove,
  onAllowedPrevToggle,
  onAllowedNextToggle,
}: StatusRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  // Локальний стан для conversion_action щоб не блокувати набір тексту
  const [convLocal, setConvLocal] = useState(s.conversion_action ?? '')
  // Помилка формату Conversion Name (null = валідно або порожньо)
  const convError = validateConversionAction(convLocal)
  // Синхронізуємо якщо пропс змінився зовні (після збереження)
  useEffect(() => {
    setConvLocal(s.conversion_action ?? '')
  }, [s.conversion_action])

  // Стан розгорнутості блоку переходів
  const [transitionsOpen, setTransitionsOpen] = useState(false)

  // Інші статуси (крім поточного) — для вибору prev/next
  const otherStatuses = useMemo(
    () => allStatuses.filter((x) => x.id !== s.id),
    [allStatuses, s.id]
  )

  // is_final disabled якщо conversion_type != null (бекенд примусово ставить true)
  const isFinalDisabled = s.conversion_type !== null

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="p-3 border-b last:border-b-0"
    >
      {/* ── Перший рядок: drag handle + колір + бейдж + is_initial + is_final + видалити ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Drag handle */}
        <button
          type="button"
          className="touch-none flex items-center justify-center h-6 w-6 text-muted-foreground cursor-grab active:cursor-grabbing hover:text-foreground"
          aria-label="Перетягнути"
          {...{ ...attributes, ...listeners }}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Color picker */}
        <input
          type="color"
          value={s.color}
          onChange={(e) => onColorChange(s, e.target.value)}
          className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
          aria-label="Колір стадії"
        />

        {/* Бейдж */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <StatusBadge name={s.name} color={s.color} />
        </div>

        {/* Radio-індикатор «Первинна» — radio-логіка: клік на неактивній → PATCH */}
        <button
          type="button"
          onClick={() => onIsInitialToggle(s)}
          className={`flex items-center gap-1.5 text-xs flex-shrink-0 transition-colors ${
            s.is_initial
              ? 'text-emerald-700 font-medium cursor-default'
              : 'text-muted-foreground hover:text-emerald-700 cursor-pointer'
          }`}
          title={s.is_initial ? 'Первинна стадія' : 'Зробити первинною'}
          aria-label={s.is_initial ? 'Первинна стадія' : 'Зробити первинною'}
        >
          {/* Кругла radio-іконка */}
          <span className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
            s.is_initial ? 'border-emerald-600 bg-emerald-600' : 'border-current'
          }`}>
            {s.is_initial && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          Первинна
        </button>

        {/* Чекбокс «Кінцева стадія» */}
        <label className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${
          isFinalDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer text-blue-700'
        }`}>
          <Checkbox
            checked={s.is_final}
            disabled={isFinalDisabled}
            onCheckedChange={(v) => onIsFinalChange(s, v === true)}
          />
          Кінцева
        </label>

        {/* Видалити — доступно для будь-якої стадії */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(s)}
          title="Видалити стадію"
          className="flex-shrink-0"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* ── Блок конверсії (показується тільки якщо is_final = true) ── */}
      {s.is_final && (
        <div className="mt-3 ml-9 space-y-3">
          {/* Radio-група «Тип конверсії» */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs font-medium text-muted-foreground">Тип конверсії</span>
              <FieldTooltip text={TOOLTIPS.conversionType} />
            </div>
            <div className="space-y-1.5">
              {/* Без конверсії */}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name={`conv-${s.id}`}
                  checked={s.conversion_type === null}
                  onChange={() => onConversionTypeChange(s, null)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Без конверсії
              </label>
              {/* Решта типів */}
              {(Object.entries(CONVERSION_TYPE_LABELS) as [NonNullable<ConversionType>, string][]).map(
                ([val, label]) => (
                  <label key={val} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`conv-${s.id}`}
                      checked={s.conversion_type === val}
                      onChange={() => onConversionTypeChange(s, val)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {label}
                  </label>
                )
              )}
            </div>
          </div>

          {/* Поле «Назва конверсії Google Ads» — якщо conversion_type != null */}
          {s.conversion_type !== null && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs text-muted-foreground">Назва конверсії (Google Ads)</span>
                <FieldTooltip text={TOOLTIPS.conversionAction} />
              </div>
              <Input
                value={convLocal}
                onChange={(e) => setConvLocal(e.target.value)}
                onBlur={() => {
                  // Невалідний формат не зберігаємо — показуємо підказку під полем
                  if (!convError) onConversionActionBlur(s, convLocal)
                }}
                placeholder="напр. lead_form_offline"
                className={`h-7 text-xs max-w-xs ${
                  convError
                    ? 'border-red-500 focus-visible:ring-red-500'
                    : !convLocal.trim()
                      ? 'border-amber-400 focus-visible:ring-amber-400'
                      : ''
                }`}
                maxLength={100}
              />
              {convError ? (
                <p className="text-xs text-red-600 mt-0.5">{convError}</p>
              ) : !convLocal.trim() ? (
                <p className="text-xs text-amber-600 mt-0.5">Необхідно вказати назву конверсії</p>
              ) : null}
            </div>
          )}

          {/* requires_amount — тільки для deal / deal_adjustment */}
          {(s.conversion_type === 'deal' || s.conversion_type === 'deal_adjustment') && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={s.requires_amount}
                  onCheckedChange={(v) => onRequiresAmountChange(s, v === true)}
                />
                <span>Потрібна сума при переведенні у стадію</span>
                <FieldTooltip text={TOOLTIPS.requiresAmount} />
              </label>

              {/* amount_is_profit — тільки якщо requires_amount = true */}
              {s.requires_amount && (
                <label className="flex items-center gap-2 text-xs cursor-pointer ml-5">
                  <Checkbox
                    checked={s.amount_is_profit}
                    onCheckedChange={(v) => onAmountIsProfitChange(s, v === true)}
                  />
                  <span>Сума є чистим прибутком</span>
                  <FieldTooltip text={TOOLTIPS.amountIsProfit} />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Блок: Дозволені переходи (тільки якщо pipelines_enabled) ── */}
      {pipelinesEnabled && (
        <div className="mt-2 ml-9">
          <button
            type="button"
            onClick={() => setTransitionsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {transitionsOpen
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
            Дозволені переходи
          </button>

          {transitionsOpen && (
            <div className="mt-2 space-y-3 border rounded-md p-3 bg-muted/30">
              {/* Дозволені попередні стадії (multi-select) */}
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">
                  Дозволені попередні стадії
                </Label>
                {otherStatuses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Немає інших стадій</p>
                ) : (
                  <ul className="space-y-1">
                    {otherStatuses.map((os) => {
                      const checked = (s.allowed_prev_status_ids ?? []).includes(os.id)
                      return (
                        <li key={os.id}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                onAllowedPrevToggle(s.id, os.id, v === true)
                              }
                            />
                            <span className="flex items-center gap-1.5 text-xs">
                              <span
                                className="h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: os.color }}
                              />
                              {os.name}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">
                  Не позначено жодного — без обмежень.
                </p>
              </div>

              {/* Дозволені наступні стадії */}
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">
                  Дозволені наступні стадії
                </Label>
                {otherStatuses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Немає інших стадій</p>
                ) : (
                  <ul className="space-y-1">
                    {otherStatuses.map((os) => {
                      const checked = (s.allowed_next_status_ids ?? []).includes(os.id)
                      return (
                        <li key={os.id}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                onAllowedNextToggle(s, os.id, v === true)
                              }
                            />
                            <span className="flex items-center gap-1.5 text-xs">
                              <span
                                className="h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: os.color }}
                              />
                              {os.name}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// ── Основна секція ─────────────────────────────────────────────────────────────
function StatusesSection() {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [pipelinesEnabled, setPipelinesEnabled] = useState(false)
  const [pipelinesSaving, setPipelinesSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Форма нової стадії
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newIsInitial, setNewIsInitial] = useState(false)
  const [newIsFinal, setNewIsFinal] = useState(false)
  const [newConversionType, setNewConversionType] = useState<ConversionType>(null)
  const [newConversionAction, setNewConversionAction] = useState('')
  const [newRequiresAmount, setNewRequiresAmount] = useState(false)
  const [newAmountIsProfit, setNewAmountIsProfit] = useState(false)
  // Помилка формату Conversion Name у формі нової стадії (null = ок/порожньо)
  const newConvError = validateConversionAction(newConversionAction)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lead-statuses')
      const j = await res.json()
      const normalized: Status[] = (j.data ?? []).map((s: Status) => ({
        ...s,
        allowed_prev_status_ids: s.allowed_prev_status_ids ?? [],
        allowed_next_status_ids: s.allowed_next_status_ids ?? [],
        is_initial: s.is_initial ?? false,
        conversion_type: s.conversion_type ?? null,
        requires_amount: s.requires_amount ?? false,
        amount_is_profit: s.amount_is_profit ?? false,
      }))
      setStatuses(normalized)
      setPipelinesEnabled(!!j.pipelines_enabled)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Зберегти pipelines_enabled у /api/admin/settings ──────────────────────
  const handlePipelinesToggle = async (val: boolean) => {
    setPipelinesEnabled(val)
    setPipelinesSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ key: 'pipelines_enabled', value: val, type: 'boolean' }],
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        setPipelinesEnabled(!val)
        return
      }
      toast.success(val ? 'Обмеження переходів увімкнено' : 'Обмеження переходів вимкнено')
      load()
    } finally {
      setPipelinesSaving(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  // Інваріант I1: хоча б одна стадія з is_initial=true
  const hasInitialStatus = useMemo(
    () => statuses.some((s) => s.is_initial),
    [statuses]
  )

  // Інваріант I2: хоча б одна стадія з будь-яким conversion_type
  const hasAnyConversionStatus = useMemo(
    () => statuses.some((s) => s.conversion_type !== null),
    [statuses]
  )

  // ── DnD ────────────────────────────────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = statuses.findIndex((s) => s.id === active.id)
    const newIdx = statuses.findIndex((s) => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = arrayMove(statuses, oldIdx, newIdx).map((s, i) => ({
      ...s,
      position: i + 1,
    }))
    setStatuses(reordered)

    const res = await fetch('/api/admin/lead-statuses/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: reordered.map((s) => ({ id: s.id, position: s.position })),
      }),
    })
    if (!res.ok) {
      toast.error('Помилка зміни порядку')
      load()
    }
  }

  // ── Зміна кольору ──────────────────────────────────────────────────────────
  const handleColorChange = async (s: Status, color: string) => {
    setStatuses((prev) => prev.map((x) => (x.id === s.id ? { ...x, color } : x)))
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (!res.ok) {
      toast.error('Помилка зміни кольору')
      load()
    }
  }

  // ── is_initial: radio-логіка — тільки якщо стадія не є вже первинною ──────
  const handleIsInitialToggle = async (s: Status) => {
    if (s.is_initial) return // клік на вже активній — нічого

    // Оптимістично: знімаємо у всіх, ставимо у поточній
    setStatuses((prev) =>
      prev.map((x) => ({ ...x, is_initial: x.id === s.id }))
    )
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_initial: true }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Не вдалося зберегти')
    }
    // Завжди перезавантажуємо — бекенд атомарно скидає у решти
    load()
  }

  // ── Зміна is_final ─────────────────────────────────────────────────────────
  const handleIsFinalChange = async (s: Status, val: boolean) => {
    // Якщо conversion_type != null — чекбокс disabled, цей хендлер не викликається
    setStatuses((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, is_final: val } : x))
    )
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_final: val }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Не вдалося оновити')
      load()
    }
  }

  // ── Зміна conversion_type ──────────────────────────────────────────────────
  const handleConversionTypeChange = async (s: Status, value: ConversionType) => {
    // conversion_type != null примусово виставляє is_final = true;
    // повернення на «Без конверсії» скидає is_final у false (щоб прапор не залипав)
    const newIsFinal = value !== null
    // Якщо скидаємо — оптимістично скидаємо requires_amount / amount_is_profit
    const newRequires = value !== null ? s.requires_amount : false
    const newProfit = value !== null ? s.amount_is_profit : false

    setStatuses((prev) =>
      prev.map((x) =>
        x.id === s.id
          ? {
              ...x,
              conversion_type: value,
              is_final: newIsFinal,
              requires_amount: newRequires,
              amount_is_profit: newProfit,
            }
          : x
      )
    )
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversion_type: value, is_final: newIsFinal }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Не вдалося оновити')
      load()
    }
  }

  // ── Зміна conversion_action (blur) ─────────────────────────────────────────
  const handleConversionActionBlur = async (s: Status, val: string) => {
    const trimmed = val.trim() || null
    if (trimmed === (s.conversion_action ?? null)) return

    setStatuses((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, conversion_action: trimmed } : x))
    )
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversion_action: trimmed }),
    })
    if (!res.ok) {
      toast.error('Не вдалося зберегти конверсію')
      load()
    }
  }

  // ── Зміна requires_amount ──────────────────────────────────────────────────
  const handleRequiresAmountChange = async (s: Status, val: boolean) => {
    // Якщо знімаємо — оптимістично скидаємо amount_is_profit
    setStatuses((prev) =>
      prev.map((x) =>
        x.id === s.id
          ? { ...x, requires_amount: val, amount_is_profit: val ? x.amount_is_profit : false }
          : x
      )
    )
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requires_amount: val }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Не вдалося оновити')
      load()
    }
  }

  // ── Зміна amount_is_profit ─────────────────────────────────────────────────
  const handleAmountIsProfitChange = async (s: Status, val: boolean) => {
    setStatuses((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, amount_is_profit: val } : x))
    )
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_is_profit: val }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Не вдалося оновити')
      load()
    }
  }

  // ── Перемикання одного дозволеного попереднього статусу (multi) ──────────
  const handleAllowedPrevToggle = useCallback(
    async (statusId: string, prevId: string, checked: boolean) => {
      // Оптимістичний апдейт — обчислюємо новий масив на базі поточного стану
      let nextArr: string[] = []
      setStatuses((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== statusId) return s
          const current = s.allowed_prev_status_ids ?? []
          const next = checked
            ? Array.from(new Set([...current, prevId]))
            : current.filter((id) => id !== prevId)
          nextArr = next
          return { ...s, allowed_prev_status_ids: next }
        })
        return updated
      })
      // Якщо після setState nextArr ще порожній (edge-case) — обчислюємо знову
      const currentEntry = statuses.find((s) => s.id === statusId)
      if (nextArr.length === 0 && !checked) {
        const base = currentEntry?.allowed_prev_status_ids ?? []
        nextArr = base.filter((id) => id !== prevId)
      } else if (nextArr.length === 0 && checked) {
        const base = currentEntry?.allowed_prev_status_ids ?? []
        nextArr = Array.from(new Set([...base, prevId]))
      }
      const res = await fetch(`/api/admin/lead-statuses/${statusId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_prev_status_ids: nextArr }),
      })
      if (!res.ok) {
        toast.error('Не вдалося зберегти дозволені попередні стадії')
        load()
      }
    },
    [statuses, load],
  )

  // ── Перемикання одного дозволеного наступного статусу ─────────────────────
  const handleAllowedNextToggle = async (s: Status, targetId: string, checked: boolean) => {
    const current = s.allowed_next_status_ids ?? []
    const next = checked
      ? [...current, targetId]
      : current.filter((id) => id !== targetId)

    setStatuses((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, allowed_next_status_ids: next } : x))
    )

    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_next_status_ids: next }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Не вдалося зберегти')
      load()
    }
  }

  // ── Видалення ──────────────────────────────────────────────────────────────
  const handleRemove = async (s: Status) => {
    if (!confirm(`Видалити стадію "${s.name}"?`)) return
    const res = await fetch(`/api/admin/lead-statuses/${s.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'Не вдалось видалити стадію' }))
      toast.error(j.error ?? 'Не вдалось видалити стадію')
      return
    }
    toast.success('Стадію видалено')
    load()
  }

  // ── Створення нової стадії ─────────────────────────────────────────────────
  const resetDialog = () => {
    setNewName('')
    setNewColor(PRESET_COLORS[0])
    setNewIsInitial(false)
    setNewIsFinal(false)
    setNewConversionType(null)
    setNewConversionAction('')
    setNewRequiresAmount(false)
    setNewAmountIsProfit(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Введіть назву')
      return
    }
    // conversion_type != null → conversion_action обов'язковий
    if (newConversionType !== null && !newConversionAction.trim()) {
      toast.error('Введіть назву конверсії в Google Ads')
      return
    }
    // Формат Conversion Name (та сама перевірка, що й на API)
    if (newConversionType !== null && newConvError) {
      toast.error(newConvError)
      return
    }
    // requires_amount тільки для deal / deal_adjustment
    if (newRequiresAmount && newConversionType !== 'deal' && newConversionType !== 'deal_adjustment') {
      toast.error('Сума угоди можлива тільки для типів «Угода» або «Корекція угоди»')
      return
    }
    setSaving(true)
    try {
      // conversion_type != null → is_final = true
      const isFinal = newConversionType !== null ? true : newIsFinal
      const conversionAction = newConversionType !== null ? (newConversionAction.trim() || null) : null

      const res = await fetch('/api/admin/lead-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          is_initial: newIsInitial,
          is_final: isFinal,
          conversion_type: newConversionType,
          conversion_action: conversionAction,
          requires_amount: newRequiresAmount,
          amount_is_profit: newAmountIsProfit,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка')
        return
      }
      toast.success('Створено')
      resetDialog()
      setDialogOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Тогл: обмеження переходів між стадіями ── */}
      <div className="rounded-md border p-4 space-y-1">
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={pipelinesEnabled}
            disabled={pipelinesSaving || loading}
            onCheckedChange={(v) => handlePipelinesToggle(v === true)}
          />
          <div>
            <div className="text-sm font-medium">Увімкнути обмеження переходів між стадіями</div>
            <div className="text-xs text-muted-foreground">
              Якщо вимкнено — відповідальний бачить усі стадії у дропдауні ліда.
              Якщо ввімкнено — тільки дозволені, налаштовані нижче для кожної стадії.
            </div>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Стадії воронки</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Усі стадії рівноправні: можна видаляти, перейменовувати, змінювати колір і порядок.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Додати стадію
        </Button>
      </div>

      {/* Warning I1: немає жодної первинної стадії */}
      {!loading && !hasInitialStatus && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Увага:</strong> має існувати щонайменше одна первинна стадія (індикатор «Первинна»).
          Нові ліди не отримуватимуть стадію автоматично.
        </div>
      )}

      {/* Info I2: жодна стадія не має типу конверсії */}
      {!loading && !hasAnyConversionStatus && (
        <div className="rounded-md border border-sky-300/60 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <strong>Інформація:</strong> не налаштовано жодної стадії з типом конверсії.
          Офлайн-конверсії у Google Ads не фіксуватимуться.
        </div>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={statuses.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="border rounded-md divide-y">
              {statuses.map((s) => (
                <StatusRow
                  key={s.id}
                  status={s}
                  allStatuses={statuses}
                  pipelinesEnabled={pipelinesEnabled}
                  onColorChange={handleColorChange}
                  onIsInitialToggle={handleIsInitialToggle}
                  onIsFinalChange={handleIsFinalChange}
                  onConversionTypeChange={handleConversionTypeChange}
                  onConversionActionBlur={handleConversionActionBlur}
                  onRequiresAmountChange={handleRequiresAmountChange}
                  onAmountIsProfitChange={handleAmountIsProfitChange}
                  onRemove={handleRemove}
                  onAllowedPrevToggle={handleAllowedPrevToggle}
                  onAllowedNextToggle={handleAllowedNextToggle}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* ── Dialog: нова стадія ─────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) resetDialog()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Нова стадія</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Назва */}
            <div>
              <Label className="text-xs mb-1.5 block">Назва</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Наприклад: Очікує оплати"
                maxLength={64}
              />
            </div>

            {/* Колір */}
            <div>
              <Label className="text-xs mb-1.5 block">Колір</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-7 w-7 rounded-full border-2 ${
                      newColor === c ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-7 w-12 rounded border cursor-pointer"
                />
              </div>
            </div>

            {/* Первинна стадія */}
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={newIsInitial}
                onCheckedChange={(v) => setNewIsInitial(v === true)}
              />
              <span className="font-medium">Первинна стадія</span>
              <FieldTooltip text={TOOLTIPS.isInitial} />
            </label>

            {/* Кінцева стадія */}
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={newConversionType !== null ? true : newIsFinal}
                disabled={newConversionType !== null}
                onCheckedChange={(v) => setNewIsFinal(v === true)}
              />
              <span className="font-medium">Кінцева стадія</span>
              <FieldTooltip text={TOOLTIPS.isFinal} />
            </label>

            {/* Тип конверсії */}
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Label className="text-xs">Тип конверсії</Label>
                <FieldTooltip text={TOOLTIPS.conversionType} />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="new-conv-type"
                    checked={newConversionType === null}
                    onChange={() => {
                      setNewConversionType(null)
                      // Повернення на «Без конверсії» скидає «Кінцева стадія»
                      setNewIsFinal(false)
                      setNewRequiresAmount(false)
                      setNewAmountIsProfit(false)
                    }}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Без конверсії
                </label>
                {(Object.entries(CONVERSION_TYPE_LABELS) as [NonNullable<ConversionType>, string][])
                  .filter(([val]) => val !== 'deal_adjustment')
                  .map(
                  ([val, label]) => (
                    <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="new-conv-type"
                        checked={newConversionType === val}
                        onChange={() => {
                          setNewConversionType(val)
                          setNewIsFinal(true)
                          if (val !== 'deal' && val !== 'deal_adjustment') {
                            setNewRequiresAmount(false)
                            setNewAmountIsProfit(false)
                          }
                        }}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {label}
                    </label>
                  )
                )}
              </div>
            </div>

            {/* conversion_action — показується якщо conversion_type != null */}
            {newConversionType !== null && (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Label className="text-xs">Назва конверсії в Google Ads</Label>
                  <FieldTooltip text={TOOLTIPS.conversionAction} />
                </div>
                <Input
                  value={newConversionAction}
                  onChange={(e) => setNewConversionAction(e.target.value)}
                  placeholder="напр. lead_form_offline"
                  maxLength={100}
                  className={
                    newConvError
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : !newConversionAction.trim()
                        ? 'border-amber-400'
                        : ''
                  }
                />
                {newConvError ? (
                  <p className="text-xs text-red-600 mt-0.5">{newConvError}</p>
                ) : !newConversionAction.trim() ? (
                  <p className="text-xs text-amber-600 mt-0.5">Необхідно вказати назву конверсії</p>
                ) : null}
              </div>
            )}

            {/* requires_amount — для deal / deal_adjustment */}
            {(newConversionType === 'deal' || newConversionType === 'deal_adjustment') && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={newRequiresAmount}
                    onCheckedChange={(v) => {
                      setNewRequiresAmount(v === true)
                      if (v !== true) setNewAmountIsProfit(false)
                    }}
                  />
                  <span>Потрібна сума при переведенні у стадію</span>
                  <FieldTooltip text={TOOLTIPS.requiresAmount} />
                </label>

                {newRequiresAmount && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer ml-5">
                    <Checkbox
                      checked={newAmountIsProfit}
                      onCheckedChange={(v) => setNewAmountIsProfit(v === true)}
                    />
                    <span>Сума є чистим прибутком</span>
                    <FieldTooltip text={TOOLTIPS.amountIsProfit} />
                  </label>
                )}
              </div>
            )}

            {/* Превʼю */}
            {newName && (
              <div className="text-sm">
                Превʼю: <StatusBadge name={newName} color={newColor} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Скасувати
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                saving ||
                !newName.trim() ||
                (newConversionType !== null &&
                  (!newConversionAction.trim() || newConvError !== null))
              }
            >
              <Plus className="h-4 w-4 mr-1.5" /> Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секція: КАСТОМНІ ПОЛЯ
// ─────────────────────────────────────────────────────────────────────────────
const FIELD_TYPE_LABELS: Record<CustomField['type'], string> = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  select: 'Вибір',
  boolean: 'Так/Ні',
}

function CustomFieldsSection() {
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Форма створення
  const [fName, setFName] = useState('')
  const [fKey, setFKey] = useState('')
  const [fType, setFType] = useState<CustomField['type']>('text')
  const [fOptionsRaw, setFOptionsRaw] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/custom-fields')
      const j = await res.json()
      setFields(j.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Авто-генерація field_key з назви
  const autoKey = useMemo(() => {
    return fName
      .toLowerCase()
      .replace(/[ьъ']/g, '')
      .replace(/[іїй]/g, 'i')
      .replace(/[єе]/g, 'e')
      .replace(/[щ]/g, 'sch')
      .replace(/[ш]/g, 'sh')
      .replace(/[ч]/g, 'ch')
      .replace(/[ц]/g, 'ts')
      .replace(/[ю]/g, 'yu')
      .replace(/[я]/g, 'ya')
      .replace(/[ы]/g, 'y')
      .replace(/[а-яё]/g, (c) => {
        const map: Record<string, string> = {
          а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', ж: 'zh', з: 'z',
          к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
          т: 't', у: 'u', ф: 'f', х: 'h',
        }
        return map[c] ?? '_'
      })
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64)
  }, [fName])

  useEffect(() => {
    // Підтягуємо ключ автоматично якщо користувач його не редагував вручну
    setFKey((prev) => (prev === '' || prev === autoKey ? autoKey : prev))
  }, [autoKey])

  const resetForm = () => {
    setFName('')
    setFKey('')
    setFType('text')
    setFOptionsRaw('')
  }

  const create = async () => {
    if (!fName.trim() || !fKey.trim()) {
      toast.error('Назва і ключ обовʼязкові')
      return
    }
    let options: string[] | undefined
    if (fType === 'select') {
      options = fOptionsRaw
        .split('\n')
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
      if (options.length === 0) {
        toast.error('Для select потрібен список опцій (по одній на рядок)')
        return
      }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fName.trim(),
          field_key: fKey.trim(),
          type: fType,
          options,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка')
        return
      }
      toast.success('Створено')
      resetForm()
      setDialogOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (f: CustomField) => {
    if (!confirm(`Видалити поле "${f.name}"? Усі значення для цього поля видаляться.`)) return
    const res = await fetch(`/api/admin/custom-fields/${f.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Помилка видалення')
      return
    }
    toast.success('Видалено')
    load()
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Кастомні поля лідів</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Додаткові поля, які можна заповнювати на сторінці лида.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Додати поле
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : fields.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10 border rounded-md">
          Кастомних полів ще немає
        </p>
      ) : (
        <ul className="border rounded-md divide-y">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{f.name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <code className="bg-muted px-1.5 py-0.5 rounded">{f.field_key}</code>
                  {' • '}
                  {FIELD_TYPE_LABELS[f.type]}
                  {f.type === 'select' && f.options && (
                    <> • {f.options.length} опц.</>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(f)}
                title="Видалити"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нове поле</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1.5 block">Назва</Label>
              <Input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="Наприклад: Бюджет клієнта"
                maxLength={64}
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Ключ (латиниця, для API)</Label>
              <Input
                value={fKey}
                onChange={(e) => setFKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="budget"
                maxLength={64}
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Тип</Label>
              <Select value={fType} onValueChange={(v) => setFType(v as CustomField['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Текст</SelectItem>
                  <SelectItem value="number">Число</SelectItem>
                  <SelectItem value="date">Дата</SelectItem>
                  <SelectItem value="select">Вибір (список)</SelectItem>
                  <SelectItem value="boolean">Так/Ні</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fType === 'select' && (
              <div>
                <Label className="text-xs mb-1.5 block">Опції (по одній на рядок)</Label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={fOptionsRaw}
                  onChange={(e) => setFOptionsRaw(e.target.value)}
                  placeholder="Низький&#10;Середній&#10;Високий"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="h-4 w-4 mr-1.5" /> Скасувати
            </Button>
            <Button onClick={create} disabled={saving}>
              <Plus className="h-4 w-4 mr-1.5" /> Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секція: ТЕЛЕФОНІЯ — секрет + URL вебхуків по провайдерах
// ─────────────────────────────────────────────────────────────────────────────
const TELEPHONY_PROVIDERS = ['binotel', 'ringostat', 'unitel', 'generic'] as const

const PROVIDER_LABELS: Record<string, string> = {
  binotel: 'Binotel',
  ringostat: 'Ringostat',
  unitel: 'Unitel',
  generic: 'Generic (будь-який провайдер)',
}

function TelephonySection() {
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((j) => {
        const rows: SettingRow[] = j.data ?? []
        const row = rows.find((r) => r.key === 'telephony_secret')
        setSecret(row?.value ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ key: 'telephony_secret', value: secret.trim(), type: 'secret' }],
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return
      }
      toast.success('Збережено')
    } finally {
      setSaving(false)
    }
  }

  const generate = () => {
    const arr = new Uint8Array(20)
    crypto.getRandomValues(arr)
    setSecret(Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join(''))
  }

  const copyUrl = async (provider: string) => {
    const url = `${origin}/api/telephony/webhook?provider=${provider}&token=${secret}`
    await navigator.clipboard.writeText(url)
    setCopied(provider)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <Skeleton className="h-40 w-full" />

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="font-semibold">Телефонія</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Підключіть VoIP-провайдера — дзвінки автоматично стають лідами або повторними зверненнями.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Секрет вебхуку</Label>
        <div className="flex gap-2">
          <Input
            type={showSecret ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Не налаштовано — вебхуки не приймаються"
            className="font-mono text-sm flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSecret((v) => !v)}
            title={showSecret ? 'Приховати' : 'Показати'}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button variant="outline" onClick={generate}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Генерувати
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Передається провайдером у ?token= або заголовку Authorization: Bearer.
          Без секрету вебхуки повертають 503.
        </p>
      </div>

      <Button onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" /> Зберегти
      </Button>

      {secret && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">URL вебхуків</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Скопіюйте потрібний URL і вставте у налаштування вебхуків свого провайдера (POST).
            </p>
          </div>
          <ul className="space-y-2">
            {TELEPHONY_PROVIDERS.map((p) => {
              const url = `${origin}/api/telephony/webhook?provider=${p}&token=${secret}`
              return (
                <li key={p} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{PROVIDER_LABELS[p]}</span>
                    <Button variant="outline" size="sm" onClick={() => copyUrl(p)}>
                      {copied === p
                        ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />Скопійовано</>
                        : <><Copy className="h-3.5 w-3.5 mr-1.5" />Копіювати</>
                      }
                    </Button>
                  </div>
                  <code className="block text-xs text-muted-foreground break-all">{url}</code>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секція: GOOGLE SHEETS — налаштування інтеграції
// ─────────────────────────────────────────────────────────────────────────────

type IntegrationRow = {
  key: string
  is_set: boolean
  masked_value: string | null
  value?: string | null
  updated_at: string | null
}

// Рядок результату тесту зʼєднання Google Sheets (per-table).
type TestLine = { level: 'ok' | 'warn' | 'error'; text: string }

function GoogleSheetsSection() {
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [adjustmentsSpreadsheetId, setAdjustmentsSpreadsheetId] = useState('')
  const [serviceAccountJson, setServiceAccountJson] = useState('')
  const [maskedSaJson, setMaskedSaJson] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestLine[] | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showSaJson, setShowSaJson] = useState(false)

  // Прихований file input для вибору JSON
  const fileInputRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.value = ''
  }, [])

  // Завантаження поточних masked-значень
  const loadIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/integrations')
      const j = await res.json()
      const rows: IntegrationRow[] = j.data ?? []
      const saRow = rows.find((r) => r.key === 'google_sheets_service_account_json')
      const sidRow = rows.find((r) => r.key === 'google_spreadsheet_id')
      const adjRow = rows.find((r) => r.key === 'google_adjustments_spreadsheet_id')
      setMaskedSaJson(saRow?.is_set ? (saRow.masked_value ?? '***') : null)
      // Spreadsheet ID — не секрет: prefill реальним значенням (редаговане)
      setSpreadsheetId(sidRow?.value ?? '')
      setAdjustmentsSpreadsheetId(adjRow?.value ?? '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  // Читання JSON-файлу через FileReader
  function readJsonFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text === 'string') {
        setServiceAccountJson(text)
        setShowSaJson(true)
      }
    }
    reader.readAsText(file)
  }

  // Drag-and-drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave() {
    setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readJsonFile(file)
  }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readJsonFile(file)
  }

  // Збереження
  const save = async () => {
    const sidTrimmed = spreadsheetId.trim()
    const adjTrimmed = adjustmentsSpreadsheetId.trim()
    const saTrimmed = serviceAccountJson.trim()

    if (!sidTrimmed && !adjTrimmed && !saTrimmed) {
      toast.info('Нічого зберігати')
      return
    }

    setSaving(true)
    try {
      const promises: Promise<Response>[] = []

      if (sidTrimmed) {
        promises.push(
          fetch('/api/admin/integrations/google_spreadsheet_id', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: sidTrimmed }),
          })
        )
      }

      if (adjTrimmed) {
        promises.push(
          fetch('/api/admin/integrations/google_adjustments_spreadsheet_id', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: adjTrimmed }),
          })
        )
      }

      if (saTrimmed) {
        // Базова валідація JSON перед відправкою
        try {
          JSON.parse(saTrimmed)
        } catch {
          toast.error('JSON некоректний')
          return
        }
        promises.push(
          fetch('/api/admin/integrations/google_sheets_service_account_json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: saTrimmed }),
          })
        )
      }

      const results = await Promise.all(promises)
      const failed = results.find((r) => !r.ok)
      if (failed) {
        const j = await failed.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return
      }

      toast.success('Збережено')
      // SA JSON — очищаємо (write-only). Spreadsheet ID — не чіпаємо,
      // loadIntegrations() перечитає збережені значення в поля.
      setServiceAccountJson('')
      setShowSaJson(false)
      await loadIntegrations()
    } finally {
      setSaving(false)
    }
  }

  // Перевірка з'єднання — тестує обидві таблиці, per-table результат
  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/integrations/google-sheets/test', { method: 'POST' })
      const j = await res.json().catch(() => null)
      if (!j) {
        setTestResult([{ level: 'error', text: 'Не вдалося перевірити зʼєднання' }])
        return
      }

      const lines: TestLine[] = []

      if (!j.ok) {
        // Основна таблиця недоступна
        const msg = j.main?.message ?? j.message ?? 'немає доступу'
        lines.push({ level: 'error', text: `Основна таблиця: ${msg}` })
        setTestResult(lines)
        return
      }

      // Основна таблиця доступна
      lines.push({ level: 'ok', text: `Основна таблиця: «${j.main.title}»` })

      // Таблиця корекцій
      const adj = j.adjustments
      if (adj?.status === 'ok') {
        lines.push({ level: 'ok', text: `Таблиця корекцій: «${adj.title}»` })
      } else if (adj?.status === 'not_configured') {
        lines.push({ level: 'warn', text: 'Таблиця корекцій не задана' })
      } else if (adj?.status === 'error') {
        lines.push({
          level: 'error',
          text: 'Таблиця корекцій: немає доступу — розшарте таблицю на service account (Editor)',
        })
      }

      setTestResult(lines)
    } catch (err) {
      setTestResult([{ level: 'error', text: String(err) }])
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-6 max-w-xl">
      {/* Заголовок */}
      <div>
        <h2 className="font-semibold">Інтеграція з Google Sheets</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Конверсії з фінальних статусів автоматично потрапляють у вашу таблицю.
          Налаштування — у три кліки.
        </p>
      </div>

      {/* Кнопка допомоги */}
      <Button
        variant="outline"
        size="sm"
        className="border-orange-400 text-orange-600 hover:bg-orange-50"
        onClick={() => setHelpOpen(true)}
      >
        Покрокова інструкція як отримати ці значення
      </Button>

      {/* Поле Spreadsheet ID */}
      <div className="space-y-1.5">
        <Label className="text-xs">Spreadsheet ID</Label>
        <Input
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        />
      </div>

      {/* Поле Adjustments Spreadsheet ID (окрема таблиця корекцій RETRACT/RESTATE) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Adjustments Spreadsheet ID (таблиця корекцій)</Label>
        <Input
          value={adjustmentsSpreadsheetId}
          onChange={(e) => setAdjustmentsSpreadsheetId(e.target.value)}
          placeholder="Окрема таблиця для корекцій конверсій (RETRACT/RESTATE)"
        />
        <p className="text-xs text-muted-foreground">
          Окрема Google-таблиця для фіду корекцій. Той самий Service Account (поділіться з ним і цією таблицею).
        </p>
      </div>

      {/* Поле Service Account JSON */}
      <div className="space-y-2">
        <Label className="text-xs">Service Account JSON</Label>

        {/* Drag-and-drop зона */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Перетягніть .json файл або{' '}
            <label className="text-primary cursor-pointer underline underline-offset-2">
              виберіть файл
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </p>
        </div>

        {/* Textarea для перегляду/редагування JSON */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {serviceAccountJson ? 'JSON завантажено — перевірте перед збереженням' : 'Або вставте JSON текстом'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowSaJson((v) => !v)}
              type="button"
            >
              {showSaJson
                ? <><EyeOff className="h-3.5 w-3.5 mr-1" />Приховати</>
                : <><Eye className="h-3.5 w-3.5 mr-1" />Показати JSON</>
              }
            </Button>
          </div>
          {showSaJson && (
            <Textarea
              value={serviceAccountJson}
              onChange={(e) => setServiceAccountJson(e.target.value)}
              placeholder='{"type":"service_account","project_id":"...","private_key":"..."}'
              className="font-mono text-xs min-h-[200px] resize-y"
            />
          )}
        </div>

        {maskedSaJson && (
          <p className="text-xs text-muted-foreground">
            Поточне значення:{' '}
            <code className="bg-muted px-1 rounded">{maskedSaJson}</code>
            {' '}· якщо залишити порожнім — не змінювати
          </p>
        )}
      </div>

      {/* Результат тесту — per-table рядки, рамка за найгіршим рівнем */}
      {testResult && testResult.length > 0 && (() => {
        const worst = testResult.some((l) => l.level === 'error')
          ? 'error'
          : testResult.some((l) => l.level === 'warn')
            ? 'warn'
            : 'ok'
        const boxClass =
          worst === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : worst === 'warn'
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-green-50 border-green-200 text-green-800'
        const icon = (level: TestLine['level']) =>
          level === 'ok' ? '✓' : level === 'warn' ? '⚠' : '✗'
        return (
          <div className={`rounded-md px-4 py-3 text-sm border space-y-1 ${boxClass}`}>
            {testResult.map((l, i) => (
              <div key={i}>{icon(l.level)} {l.text}</div>
            ))}
          </div>
        )
      })()}

      {/* Кнопки дій */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Збереження…' : 'Зберегти'}
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${testing ? 'animate-spin' : ''}`} />
          {testing ? 'Перевірка…' : 'Перевірити з\'єднання'}
        </Button>
      </div>

      {/* Dialog: покрокова інструкція */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Як підключити Google Sheets</DialogTitle>
            <DialogDescription>
              Покрокова інструкція для налаштування Service Account
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
              <div>
                Зайдіть у{' '}
                <a
                  href="https://console.cloud.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Google Cloud Console
                </a>{' '}
                → створіть новий проєкт або оберіть існуючий.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
              <div>
                <strong>APIs &amp; Services → Library</strong> → знайдіть{' '}
                <em>Google Sheets API</em> → натисніть <strong>Enable</strong>.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
              <div>
                <strong>IAM &amp; Admin → Service Accounts → Create service account</strong> → введіть
                будь-яке ім'я → натисніть <strong>Done</strong>.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
              <div>
                Перейдіть у щойно створений Service Account → вкладка{' '}
                <strong>Keys → Add Key → Create new key → JSON</strong> → завантажиться файл.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
              <div>
                Створіть Google таблицю → кнопка <strong>«Поділитися»</strong> →
                вставте адресу <code className="bg-muted px-1 rounded">client_email</code> зі
                скачаного JSON → роль <strong>Редактор</strong> → відправити.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">6</span>
              <div>
                URL таблиці має вигляд:{' '}
                <code className="bg-muted px-1 rounded text-xs break-all">
                  https://docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
                </code>
                <br />
                Скопіюйте частину <strong>SPREADSHEET_ID</strong> і вставте у поле вище.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">7</span>
              <div>
                Завантажте скачаний JSON у поле <strong>«Service Account JSON»</strong> нижче
                (перетягніть файл або вставте текстом) → збережіть → перевірте з'єднання.
              </div>
            </li>
          </ol>
          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>Зрозуміло</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
