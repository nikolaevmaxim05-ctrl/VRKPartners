'use client'

// Діалог конструктора вивантаження (промпт 023).
// Вкладка 1: вивантаження по лідах з вибором полів.
// Вкладка 2: загальна аналітика з показниками і порівняльними періодами.

import { useState, useEffect } from 'react'
import { Download, Loader2, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Checkbox } from '@/shared/ui/checkbox'
import { Label } from '@/shared/ui/label'
import { Input } from '@/shared/ui/input'
import { DatePicker } from '@/shared/ui/date-picker'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'
import type { TsGranularity } from '@core/domain/analytics/report'
import type { LeadExportField as LeadField } from '@core/domain/analytics/export-request'

// ─── Типи ────────────────────────────────────────────────────────────────────

type SummaryColumn =
  | 'total'
  | 'nonTargetLeads'
  | 'targetLeads'
  | 'deals'
  | 'dealAmountSum'
  | 'dealProfitSum'
  | 'conversionToNonTarget'
  | 'conversionToTarget'
  | 'conversionToDeal'

type ExportFormat = 'csv' | 'xlsx'

type ComparePeriod = {
  id: string
  date_from: string
  date_to: string
}

export type ExportBuilderProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Фільтри з поточного стану сторінки */
  dateFrom: string
  dateTo: string
  filterUtmSource: string
  filterService: string
  filterAssigneeIds: string[]
  filterStatusIds: string[]
  /** 'all' | 'none' | UUID реферального посилання */
  filterReferralLinkId: string
  filterGclid: 'any' | 'with' | 'without'
  /** Поточна гранулярність на сторінці (використовується як дефолт для вкладки 2) */
  granularity: TsGranularity
  /** Прапорці з відповіді сервера */
  flags: {
    hasProfitStages: boolean
    hasDealAdjustmentStages?: boolean
  }
}

// ─── Дефолти полів ───────────────────────────────────────────────────────────

const DEFAULT_LEAD_FIELDS: LeadField[] = [
  'dates',
  'utm_source',
  'status',
  'phone',
  'service',
  'assigned_to',
]

const DEFAULT_SUMMARY_COLUMNS: SummaryColumn[] = ['total', 'targetLeads']

// ─── Допоміжні функції ────────────────────────────────────────────────────────

function getFilenameFromResponse(res: Response, format: ExportFormat): string {
  const cd = res.headers.get('Content-Disposition') ?? ''
  // шукаємо filename="..." або filename*=UTF-8''...
  const match = cd.match(/filename[^;=\n]*=(['"]?)([^'";\n]+)\1/)
  if (match?.[2]) return match[2]
  return `export.${format}`
}

function newId(): string {
  return Math.random().toString(36).slice(2)
}

// ─── Компонент CheckboxRow — рядок з чекбоксом і підписом ────────────────────

function CheckboxRow({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5 shrink-0"
      />
      <div className="flex flex-col">
        <Label htmlFor={id} className={`text-sm cursor-pointer leading-snug ${disabled ? 'text-muted-foreground' : ''}`}>
          {label}
        </Label>
        {description && (
          <span className="text-xs text-muted-foreground mt-0.5">{description}</span>
        )}
      </div>
    </div>
  )
}

// ─── Вкладка 1: вивантаження по лідах ────────────────────────────────────────

function LeadsTab({
  fields,
  onFieldsChange,
  dealAmountFrom,
  dealAmountTo,
  onDealAmountFromChange,
  onDealAmountToChange,
}: {
  fields: LeadField[]
  onFieldsChange: (fields: LeadField[]) => void
  dealAmountFrom: string
  dealAmountTo: string
  onDealAmountFromChange: (v: string) => void
  onDealAmountToChange: (v: string) => void
}) {
  function toggle(field: LeadField) {
    if (fields.includes(field)) {
      onFieldsChange(fields.filter((f) => f !== field))
    } else {
      onFieldsChange([...fields, field])
    }
  }

  // Валідація діапазону суми угоди
  const isDealAmountChecked = fields.includes('deal_amount')
  const amountFromNum = dealAmountFrom !== '' ? Number(dealAmountFrom) : null
  const amountToNum = dealAmountTo !== '' ? Number(dealAmountTo) : null
  const isDealRangeInvalid =
    isDealAmountChecked &&
    amountFromNum !== null &&
    amountToNum !== null &&
    amountFromNum > amountToNum

  return (
    <div className="space-y-4">
      {/* Дати */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Дати</p>
        <CheckboxRow
          id="field-dates"
          checked={fields.includes('dates')}
          onCheckedChange={() => toggle('dates')}
          label="Дати"
          description="Дата створення + остання зміна стадії"
        />
      </div>

      {/* Мітки */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Мітки</p>
        <CheckboxRow
          id="field-utm_source"
          checked={fields.includes('utm_source')}
          onCheckedChange={() => toggle('utm_source')}
          label="Джерело (utm_source)"
        />
        <CheckboxRow
          id="field-referral_link"
          checked={fields.includes('referral_link')}
          onCheckedChange={() => toggle('referral_link')}
          label="Реферальне посилання"
          description="Назва партнера; лише код — якщо посилання не знайдено або вимкнене"
        />
        <CheckboxRow
          id="field-all_utm"
          checked={fields.includes('all_utm')}
          onCheckedChange={() => toggle('all_utm')}
          label="Всі мітки"
          description="medium, campaign, term, content, gclid, fbclid, ttclid, referrer"
        />
      </div>

      {/* Лід */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Лід</p>
        <CheckboxRow
          id="field-phone"
          checked={fields.includes('phone')}
          onCheckedChange={() => toggle('phone')}
          label="Телефон"
        />
        <CheckboxRow
          id="field-email"
          checked={fields.includes('email')}
          onCheckedChange={() => toggle('email')}
          label="Email"
        />
        <CheckboxRow
          id="field-service"
          checked={fields.includes('service')}
          onCheckedChange={() => toggle('service')}
          label="Послуга"
        />
        <CheckboxRow
          id="field-status"
          checked={fields.includes('status')}
          onCheckedChange={() => toggle('status')}
          label="Стадія"
        />
        <CheckboxRow
          id="field-assigned_to"
          checked={fields.includes('assigned_to')}
          onCheckedChange={() => toggle('assigned_to')}
          label="Відповідальний"
        />
      </div>

      {/* Додатково */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Додатково</p>
        <CheckboxRow
          id="field-custom_fields"
          checked={fields.includes('custom_fields')}
          onCheckedChange={() => toggle('custom_fields')}
          label="Додаткові поля"
        />
        <CheckboxRow
          id="field-manager_history"
          checked={fields.includes('manager_history')}
          onCheckedChange={() => toggle('manager_history')}
          label="Історія стадій"
        />
        <CheckboxRow
          id="field-comments"
          checked={fields.includes('comments')}
          onCheckedChange={() => toggle('comments')}
          label="Чат і нотатки"
        />
        <CheckboxRow
          id="field-was_target"
          checked={fields.includes('was_target')}
          onCheckedChange={() => toggle('was_target')}
          label="Був цільовим"
        />
        <CheckboxRow
          id="field-was_non_target"
          checked={fields.includes('was_non_target')}
          onCheckedChange={() => toggle('was_non_target')}
          label="Був нецільовим"
        />
      </div>

      {/* Угода */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Угода</p>
        <div className="flex items-start gap-2.5 py-1.5 flex-wrap">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="field-deal_amount"
              checked={isDealAmountChecked}
              onCheckedChange={() => toggle('deal_amount')}
              className="mt-0.5 shrink-0"
            />
            <Label htmlFor="field-deal_amount" className="text-sm cursor-pointer leading-snug mt-0.5">
              Сума угоди
            </Label>
          </div>
          {/* Інлайн-поля від/до — активні тільки якщо чекбокс відмічено */}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-muted-foreground">від</span>
            <Input
              type="number"
              min={0}
              value={dealAmountFrom}
              onChange={(e) => onDealAmountFromChange(e.target.value)}
              disabled={!isDealAmountChecked}
              className={`h-7 w-24 text-sm ${isDealRangeInvalid ? 'border-destructive' : ''}`}
              placeholder="0"
              aria-label="Сума угоди від"
            />
            <span className="text-xs text-muted-foreground">до</span>
            <Input
              type="number"
              min={0}
              value={dealAmountTo}
              onChange={(e) => onDealAmountToChange(e.target.value)}
              disabled={!isDealAmountChecked}
              className={`h-7 w-24 text-sm ${isDealRangeInvalid ? 'border-destructive' : ''}`}
              placeholder="∞"
              aria-label="Сума угоди до"
            />
          </div>
          {isDealRangeInvalid && (
            <p className="w-full text-xs text-destructive mt-0.5 ml-7">
              «Від» не може бути більше за «до»
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Вкладка 2: загальна аналітика ───────────────────────────────────────────

function SummaryTab({
  columns,
  onColumnsChange,
  includeDateBreakdown,
  onIncludeDateBreakdownChange,
  granularity,
  onGranularityChange,
  comparePeriods,
  onComparePeriodAdd,
  onComparePeriodRemove,
  onComparePeriodChange,
  mainDateFrom,
  mainDateTo,
  onMainDateChange,
  mainPeriodInvalid,
  hasProfitStages,
}: {
  columns: SummaryColumn[]
  onColumnsChange: (cols: SummaryColumn[]) => void
  includeDateBreakdown: boolean
  onIncludeDateBreakdownChange: (v: boolean) => void
  granularity: TsGranularity
  onGranularityChange: (v: TsGranularity) => void
  comparePeriods: ComparePeriod[]
  onComparePeriodAdd: () => void
  onComparePeriodRemove: (id: string) => void
  onComparePeriodChange: (id: string, field: 'date_from' | 'date_to', value: string) => void
  mainDateFrom: string
  mainDateTo: string
  onMainDateChange: (field: 'date_from' | 'date_to', value: string) => void
  mainPeriodInvalid: boolean
  hasProfitStages: boolean
}) {
  function toggleColumn(col: SummaryColumn) {
    if (columns.includes(col)) {
      onColumnsChange(columns.filter((c) => c !== col))
    } else {
      onColumnsChange([...columns, col])
    }
  }

  // Перевірка валідності кожного порівняльного періоду
  function isPeriodInvalid(p: ComparePeriod): boolean {
    return !!(p.date_from && p.date_to && p.date_from > p.date_to)
  }

  function isPeriodIncomplete(p: ComparePeriod): boolean {
    return !p.date_from || !p.date_to
  }

  return (
    <div className="space-y-4">
      {/* Показники */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Показники</p>
        <CheckboxRow
          id="col-total"
          checked={columns.includes('total')}
          onCheckedChange={() => toggleColumn('total')}
          label="Заявки"
        />
        <CheckboxRow
          id="col-nonTargetLeads"
          checked={columns.includes('nonTargetLeads')}
          onCheckedChange={() => toggleColumn('nonTargetLeads')}
          label="Нецільові ліди"
        />
        <CheckboxRow
          id="col-targetLeads"
          checked={columns.includes('targetLeads')}
          onCheckedChange={() => toggleColumn('targetLeads')}
          label="Цільові ліди"
        />
        <CheckboxRow
          id="col-deals"
          checked={columns.includes('deals')}
          onCheckedChange={() => toggleColumn('deals')}
          label="Угоди"
        />
        <CheckboxRow
          id="col-dealAmountSum"
          checked={columns.includes('dealAmountSum')}
          onCheckedChange={() => toggleColumn('dealAmountSum')}
          label="Сума угод (грн)"
        />
        {/* Прибуток — тільки якщо є відповідні стадії */}
        {hasProfitStages && (
          <CheckboxRow
            id="col-dealProfitSum"
            checked={columns.includes('dealProfitSum')}
            onCheckedChange={() => toggleColumn('dealProfitSum')}
            label="Прибуток (грн)"
          />
        )}
        <CheckboxRow
          id="col-conversionToNonTarget"
          checked={columns.includes('conversionToNonTarget')}
          onCheckedChange={() => toggleColumn('conversionToNonTarget')}
          label="Конверсія у нецільові (%)"
        />
        <CheckboxRow
          id="col-conversionToTarget"
          checked={columns.includes('conversionToTarget')}
          onCheckedChange={() => toggleColumn('conversionToTarget')}
          label="Конверсія у цільові (%)"
        />
        <CheckboxRow
          id="col-conversionToDeal"
          checked={columns.includes('conversionToDeal')}
          onCheckedChange={() => toggleColumn('conversionToDeal')}
          label="Конверсія в угоду (%)"
        />
      </div>

      {/* Розріз дат */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Розріз дат</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="include-date-breakdown"
              checked={includeDateBreakdown}
              onCheckedChange={(v) => onIncludeDateBreakdownChange(v === true)}
            />
            <Label htmlFor="include-date-breakdown" className="text-sm cursor-pointer">
              Розбивка по датах
            </Label>
          </div>
          {includeDateBreakdown && (
            <ToggleGroup
              type="single"
              value={granularity}
              onValueChange={(v) => {
                if (v && ['day', 'week', 'month'].includes(v)) {
                  onGranularityChange(v as TsGranularity)
                }
              }}
              className="border rounded-md p-0.5 h-8"
            >
              <ToggleGroupItem value="day"   className="text-xs px-2.5 py-1">День</ToggleGroupItem>
              <ToggleGroupItem value="week"  className="text-xs px-2.5 py-1">Тиждень</ToggleGroupItem>
              <ToggleGroupItem value="month" className="text-xs px-2.5 py-1">Місяць</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </div>

      {/* Порівняльні періоди */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Періоди</p>
        {/* Основний період — редагований (за замовчуванням із фільтрів сторінки) */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mt-2 w-24 shrink-0">
            Основний:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <DatePicker
              value={mainDateFrom}
              onChange={(v) => onMainDateChange('date_from', v)}
              invalid={mainPeriodInvalid}
              clearable={false}
              className="h-8 text-sm"
              ariaLabel="Початок основного періоду"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <DatePicker
              value={mainDateTo}
              onChange={(v) => onMainDateChange('date_to', v)}
              invalid={mainPeriodInvalid}
              clearable={false}
              className="h-8 text-sm"
              ariaLabel="Кінець основного періоду"
            />
          </div>
          {mainPeriodInvalid && (
            <p className="w-full text-xs text-destructive mt-0.5">
              Дата початку не може бути пізніше дати кінця
            </p>
          )}
        </div>

        {/* Додаткові порівняльні періоди */}
        {comparePeriods.map((p, idx) => {
          const invalid = isPeriodInvalid(p)
          return (
            <div key={p.id} className="flex items-start gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground mt-2 w-24 shrink-0">
                Порівняти {idx + 1}:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <DatePicker
                  value={p.date_from}
                  onChange={(v) => onComparePeriodChange(p.id, 'date_from', v)}
                  invalid={invalid}
                  clearable={false}
                  className="h-8 text-sm"
                  ariaLabel={`Початок порівняльного періоду ${idx + 1}`}
                />
                <span className="text-muted-foreground text-sm">—</span>
                <DatePicker
                  value={p.date_to}
                  onChange={(v) => onComparePeriodChange(p.id, 'date_to', v)}
                  invalid={invalid}
                  clearable={false}
                  className="h-8 text-sm"
                  ariaLabel={`Кінець порівняльного періоду ${idx + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onComparePeriodRemove(p.id)}
                  aria-label={`Видалити порівняльний період ${idx + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {invalid && (
                <p className="w-full text-xs text-destructive mt-0.5">
                  Дата початку не може бути пізніше дати кінця
                </p>
              )}
              {isPeriodIncomplete(p) && !invalid && (
                <p className="w-full text-xs text-amber-600 mt-0.5">
                  Заповніть обидві дати
                </p>
              )}
            </div>
          )
        })}

        {/* Кнопка додавання (максимум 5) */}
        {comparePeriods.length < 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onComparePeriodAdd}
          >
            <Plus className="h-3.5 w-3.5" />
            Додати період для порівняння
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Головний компонент ExportBuilderDialog ────────────────────────────────────

export function ExportBuilderDialog({
  open,
  onOpenChange,
  dateFrom,
  dateTo,
  filterUtmSource,
  filterService,
  filterAssigneeIds,
  filterStatusIds,
  filterReferralLinkId,
  filterGclid,
  granularity,
  flags,
}: ExportBuilderProps) {
  // ── Стан вкладок ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'leads' | 'summary'>('leads')

  // ── Стан вкладки «Ліди» ──────────────────────────────────────────────────────
  const [leadFields, setLeadFields] = useState<LeadField[]>(DEFAULT_LEAD_FIELDS)
  const [dealAmountFrom, setDealAmountFrom] = useState('')
  const [dealAmountTo, setDealAmountTo] = useState('')

  // ── Стан вкладки «Загальна аналітика» ────────────────────────────────────────
  const [summaryColumns, setSummaryColumns] = useState<SummaryColumn[]>(DEFAULT_SUMMARY_COLUMNS)
  const [includeDateBreakdown, setIncludeDateBreakdown] = useState(true)
  const [summaryGranularity, setSummaryGranularity] = useState<TsGranularity>(granularity)
  const [comparePeriods, setComparePeriods] = useState<ComparePeriod[]>([])

  // Основний період — редагований у діалозі. За замовчуванням = фільтри сторінки,
  // але користувач може змінити дати прямо тут (не чіпаючи фільтри сторінки).
  const [mainFrom, setMainFrom] = useState(dateFrom)
  const [mainTo, setMainTo] = useState(dateTo)
  // Синхронізуємо з фільтрами сторінки при кожному відкритті діалогу.
  useEffect(() => {
    if (open) {
      setMainFrom(dateFrom)
      setMainTo(dateTo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Формат ───────────────────────────────────────────────────────────────────
  const [format, setFormat] = useState<ExportFormat>('xlsx')

  // ── Стан завантаження ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)

  // ── Валідація ────────────────────────────────────────────────────────────────

  // Чи валідний діапазон суми угоди
  const amountFromNum = dealAmountFrom !== '' ? Number(dealAmountFrom) : null
  const amountToNum = dealAmountTo !== '' ? Number(dealAmountTo) : null
  const isDealRangeInvalid =
    leadFields.includes('deal_amount') &&
    amountFromNum !== null &&
    amountToNum !== null &&
    amountFromNum > amountToNum

  // Чи валідні порівняльні періоди
  const hasInvalidPeriod = comparePeriods.some(
    (p) => !!(p.date_from && p.date_to && p.date_from > p.date_to)
  )
  const hasIncompletePeriod = comparePeriods.some((p) => !p.date_from || !p.date_to)

  // Валідність основного періоду (редагується в діалозі)
  const isMainPeriodIncomplete = !mainFrom || !mainTo
  const isMainPeriodInvalid = !!(mainFrom && mainTo && mainFrom > mainTo)

  // Чи доступна кнопка «Завантажити»
  const isLeadsTabValid =
    activeTab === 'leads' &&
    leadFields.length > 0 &&
    !isDealRangeInvalid &&
    !isMainPeriodInvalid &&
    !isMainPeriodIncomplete
  const isSummaryTabValid =
    activeTab === 'summary' &&
    summaryColumns.length > 0 &&
    !hasInvalidPeriod &&
    !hasIncompletePeriod &&
    !isMainPeriodInvalid &&
    !isMainPeriodIncomplete
  const canDownload = isLeadsTabValid || isSummaryTabValid

  // Підказка чому кнопка вимкнена
  function getDisabledReason(): string | null {
    if (activeTab === 'leads') {
      if (leadFields.length === 0) return 'Оберіть хоча б одне поле'
      if (isDealRangeInvalid) return 'Невалідний діапазон суми угоди'
    }
    if (activeTab === 'summary') {
      if (summaryColumns.length === 0) return 'Оберіть хоча б один показник'
      if (hasInvalidPeriod) return 'Один із порівняльних періодів невалідний'
      if (hasIncompletePeriod) return 'Заповніть усі порівняльні періоди'
    }
    if (isMainPeriodIncomplete) return 'Заповніть основний період'
    if (isMainPeriodInvalid) return 'Дата початку основного періоду пізніше дати кінця'
    return null
  }

  // ── Скидання стану при закритті ──────────────────────────────────────────────
  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      // Скидаємо все до дефолтів при кожному відкритті
      setActiveTab('leads')
      setLeadFields(DEFAULT_LEAD_FIELDS)
      setDealAmountFrom('')
      setDealAmountTo('')
      setSummaryColumns(DEFAULT_SUMMARY_COLUMNS)
      setIncludeDateBreakdown(true)
      setSummaryGranularity(granularity)
      setComparePeriods([])
      setFormat('xlsx')
    }
    onOpenChange(isOpen)
  }

  // ── Порівняльні періоди ───────────────────────────────────────────────────────

  function addComparePeriod() {
    if (comparePeriods.length >= 5) return
    setComparePeriods((prev) => [...prev, { id: newId(), date_from: '', date_to: '' }])
  }

  function removeComparePeriod(id: string) {
    setComparePeriods((prev) => prev.filter((p) => p.id !== id))
  }

  function updateComparePeriod(id: string, field: 'date_from' | 'date_to', value: string) {
    setComparePeriods((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  // ── Завантаження файлу ────────────────────────────────────────────────────────

  async function handleDownload() {
    if (!canDownload || loading) return
    setLoading(true)

    // Основний період беремо з редагованих полів діалогу (за замовчуванням = фільтри сторінки)
    const filters: Record<string, unknown> = {
      date_from: mainFrom,
      date_to: mainTo,
    }
    if (filterUtmSource && filterUtmSource !== 'all') filters.filter_utm_source = filterUtmSource
    if (filterService && filterService !== 'all') filters.filter_service = filterService
    if (filterAssigneeIds.length > 0) filters.filter_assignee_ids = filterAssigneeIds
    if (filterStatusIds.length > 0) filters.filter_status_ids = filterStatusIds
    if (filterReferralLinkId && filterReferralLinkId !== 'all') filters.filter_referral_link_id = filterReferralLinkId
    if (filterGclid !== 'any') filters.filter_gclid = filterGclid

    // Тіло запиту
    type RequestBody = {
      format: ExportFormat
      tab: 'leads' | 'summary'
      filters: Record<string, unknown>
      leadFields?: LeadField[]
      dealAmountFrom?: number | null
      dealAmountTo?: number | null
      summaryColumns?: SummaryColumn[]
      includeDateBreakdown?: boolean
      granularity?: TsGranularity
      comparePeriods?: { date_from: string; date_to: string }[]
    }

    const body: RequestBody = {
      format,
      tab: activeTab,
      filters,
    }

    if (activeTab === 'leads') {
      body.leadFields = leadFields
      if (leadFields.includes('deal_amount')) {
        body.dealAmountFrom = dealAmountFrom !== '' ? Number(dealAmountFrom) : null
        body.dealAmountTo = dealAmountTo !== '' ? Number(dealAmountTo) : null
      }
    } else {
      body.summaryColumns = summaryColumns
      body.includeDateBreakdown = includeDateBreakdown
      if (includeDateBreakdown) {
        body.granularity = summaryGranularity
      }
      if (comparePeriods.length > 0) {
        body.comparePeriods = comparePeriods.map(({ date_from, date_to }) => ({ date_from, date_to }))
      }
    }

    try {
      const res = await fetch('/api/admin/analytics/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        let errorMsg = 'Помилка експорту'
        try {
          const json = (await res.json()) as { error?: string }
          if (json.error) errorMsg = json.error
        } catch {
          // ігноруємо помилку парсингу
        }
        toast.error(errorMsg)
        return
      }

      // Завантаження blob-у
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename = getFilenameFromResponse(res, format)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Закриваємо діалог після успішного завантаження
      handleOpenChange(false)
    } catch {
      toast.error('Помилка експорту. Перевірте підключення.')
    } finally {
      setLoading(false)
    }
  }

  // ── Рендер ────────────────────────────────────────────────────────────────────

  const disabledReason = getDisabledReason()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-full flex flex-col max-h-[90vh] p-0 gap-0">
        {/* Заголовок */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Конструктор вивантаження</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Налаштуйте поля та формат для вивантаження даних
          </DialogDescription>
        </DialogHeader>

        {/* Вкладки + контент — скролиться */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'leads' | 'summary')}
          >
            <TabsList className="w-full mb-4">
              <TabsTrigger value="leads" className="flex-1 text-sm">
                Вивантаження по лідах
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex-1 text-sm">
                Загальна аналітика
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leads">
              <LeadsTab
                fields={leadFields}
                onFieldsChange={setLeadFields}
                dealAmountFrom={dealAmountFrom}
                dealAmountTo={dealAmountTo}
                onDealAmountFromChange={setDealAmountFrom}
                onDealAmountToChange={setDealAmountTo}
              />
            </TabsContent>

            <TabsContent value="summary">
              <SummaryTab
                columns={summaryColumns}
                onColumnsChange={setSummaryColumns}
                includeDateBreakdown={includeDateBreakdown}
                onIncludeDateBreakdownChange={setIncludeDateBreakdown}
                granularity={summaryGranularity}
                onGranularityChange={setSummaryGranularity}
                comparePeriods={comparePeriods}
                onComparePeriodAdd={addComparePeriod}
                onComparePeriodRemove={removeComparePeriod}
                onComparePeriodChange={updateComparePeriod}
                mainDateFrom={mainFrom}
                mainDateTo={mainTo}
                onMainDateChange={(field, value) =>
                  field === 'date_from' ? setMainFrom(value) : setMainTo(value)
                }
                mainPeriodInvalid={isMainPeriodInvalid}
                hasProfitStages={flags.hasProfitStages}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Підвал — фіксований */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center gap-3 flex-wrap justify-between">
          {/* Підказка якщо кнопка вимкнена */}
          <div className="flex-1 min-w-0">
            {!canDownload && disabledReason && (
              <p className="text-xs text-muted-foreground truncate">{disabledReason}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Вибір формату */}
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger className="h-9 w-28" aria-label="Формат файлу">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">XLSX</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>

            {/* Скасувати */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Скасувати
            </Button>

            {/* Завантажити */}
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => void handleDownload()}
              disabled={!canDownload || loading}
              aria-label="Завантажити файл"
              title={!canDownload ? (disabledReason ?? '') : ''}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Завантажити
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
