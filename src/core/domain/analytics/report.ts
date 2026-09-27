/**
 * analytics-report.ts
 *
 * Контракт типів і чисті агрегаторні функції для вкладки «Аналітика».
 *
 * АРХІТЕКТУРНІ РІШЕННЯ (зафіксовані тут, деталі — prompts/020-plan.md):
 *
 * 1. АГРЕГАЦІЯ — select рядків + JS-агрегація в route.ts.
 *    Лідген-БД містить < 10k рядків, тому SQL RPC не потрібен.
 *    Переваги: простіше тестувати (без міграцій), легше розширювати метрики.
 *    Поріг перегляду: якщо count > 10_000 — route повертає 503 з порадою
 *    звузити період, але SQL RPC залишається опцією для майбутнього.
 *
 * 2. ТАЙМЗОНА — date-fns вже є в залежностях (^4.1.0).
 *    Використовуємо Intl.DateTimeFormat з timeZone: 'Europe/Kyiv' для
 *    форматування ключів групування (YYYY-MM-DD, YYYY-Www, YYYY-MM).
 *    date-fns-tz НЕ потрібен — Intl достатньо і не додає вагу до бандлу.
 *    Конкретна реалізація: функція toKyivDateKey() нижче.
 *
 * 3. СЕМАНТИКА МЕТРИК — через conversion_type стадій (міграція 012).
 *    «Цільовий лід»    = поточна стадія ліда має conversion_type = 'target_lead'.
 *    «Нецільовий лід»  = conversion_type = 'non_target_lead'.
 *    «Угода»           = conversion_type = 'deal'.
 *    «Повторна угода»  = conversion_type = 'deal_adjustment'.
 *    Жодного хардкоду назв стадій — лише conversion_type.
 *
 * 4. ПРАВА — permission 'view_reports' (вже є в lib/permissions.ts).
 *    GET /api/admin/analytics/report  → hasPermission(user.id, 'view_reports')
 *    GET /api/admin/analytics/export  → hasPermission(user.id, 'view_reports')
 */

// ─── Вхідні параметри ────────────────────────────────────────────────────────

/** Розрізи (groupBy) — відповідають UI-селекту «Розріз». */
export type GroupBy =
  | 'utm_source'    // Джерело
  | 'utm_medium'    // UTM Medium
  | 'utm_campaign'  // UTM Campaign
  | 'utm_term'      // UTM Term
  | 'utm_content'   // UTM Content
  | 'status'        // Стадія
  | 'service'       // Послуга
  | 'assigned_to'   // Відповідальний
  | 'referral_link' // Реферальне посилання (партнер)
  | 'day'           // День
  | 'week'          // Тиждень
  | 'month'         // Місяць
  | 'custom_field'  // Додаткове поле (потребує customFieldId)

/** Гранулярність таймсерії. */
export type TsGranularity = 'day' | 'week' | 'month'

/**
 * Параметри запиту аналітичного звіту.
 * Усі поля з query string — рядки; парсинг/валідація в route.ts через Zod.
 */
export interface ReportParams {
  /** ISO-дата початку (включно), напр. '2025-01-01'. */
  dateFrom: string
  /** ISO-дата кінця (включно), напр. '2025-01-31'. */
  dateTo: string
  /** Розріз агрегації. Default: 'day'. */
  groupBy: GroupBy
  /** При groupBy='custom_field' — обов'язковий UUID кастомного поля. */
  customFieldId?: string
  /** Гранулярність таймсерії. Default: 'day'. */
  tsGranularity?: TsGranularity
  /** Доп. фільтр: джерело (utm_source). Порожній рядок = всі. */
  filterUtmSource?: string
  /** Доп. фільтр: послуга (service). Порожній рядок = всі. */
  filterService?: string
  /** Доп. фільтр: відповідальний (assigned_to UUID). Порожній рядок = всі. */
  filterAssignedTo?: string
  /** Доп. фільтр: кілька відповідальних (список UUID). Має пріоритет над filterAssignedTo. */
  filterAssigneeIds?: string[]
  /** Доп. фільтр: стадії (список UUID). Порожній масив = всі. */
  filterStatusIds?: string[]
  /** Доп. фільтр: наявність gclid. Default: 'any'. */
  filterGclid?: 'any' | 'with' | 'without'
  /** Доп. фільтр: реферальне посилання — UUID або 'none' (без посилання). Порожній = всі. */
  filterReferralLinkId?: string
  /**
   * Доп. фільтр по КОНКРЕТНОМУ значенню поточного розрізу (groupBy).
   * Напр. groupBy='utm_campaign' + filterGroupValue='spring_sale' → лишити
   * тільки ліди цієї кампанії. Порожній рядок = всі значення.
   * Фільтрація через getGroupKey, тому працює для всіх вимірів однаково.
   */
  filterGroupValue?: string
  /** Розбивка графіка по виміру. Default: 'none'. */
  breakdown?: BreakdownDimension
  /** Метрика для breakdown-ліній. Default: 'total'. */
  breakdownMetric?: MetricKeyForBreakdown
}

// ─── Внутрішні моделі (вхід для агрегатора) ─────────────────────────────────

/**
 * Скорочена модель ліда — тільки поля, потрібні для агрегації.
 * Route передає сюди рядки з БД після select.
 */
export interface LeadForAggregation {
  id: string
  created_at: string            // ISO UTC, напр. '2025-06-11T13:45:00.000Z'
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  service: string | null
  assigned_to: string | null
  deal_amount: number | null
  deal_profit: number | null
  /** conversion_type поточної стадії. Null якщо стадії немає. */
  status_conversion_type: 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment' | null
  /** Назва стадії для групування по 'status'. */
  status_name: string | null
  /** ID стадії. */
  status_id: string | null
  /** Колір стадії — для UI. */
  status_color: string | null
  /** Реферальне посилання (партнер), за яким прийшла заявка; null — без посилання. */
  referral_link_id: string | null
  /** Назва партнера з embed referral_links (для міток розрізу/розбивки). */
  referral_link_name: string | null
  /** Код з переходу, якщо посилання не знайдено/вимкнене на момент заявки. */
  referral_code: string | null
  /**
   * Значення обраного кастомного поля для цього ліда.
   * Підставляється route-ом при group_by=custom_field або відповідних фільтрах.
   */
  custom_field_value?: string | null
}

// ─── Вихідні типи (відповідь API) ────────────────────────────────────────────

/**
 * Одна рядок зведеної таблиці.
 */
export interface ReportRow {
  /** Технічний ключ розрізу. */
  key: string
  /** Відображувана назва в UI. */
  label: string
  /** Колір рядка (для стадій). Null для інших розрізів. */
  color: string | null

  /** Загальна кількість заявок. */
  total: number
  /** conversion_type = 'target_lead'. */
  targetLeads: number
  /** conversion_type = 'non_target_lead'. */
  nonTargetLeads: number
  /** conversion_type = 'deal'. */
  deals: number
  /** conversion_type = 'deal_adjustment'. */
  dealAdjustments: number
  /** SUM(deal_amount). */
  dealAmountSum: number
  /** SUM(deal_profit). */
  dealProfitSum: number
  /** targetLeads / total * 100. */
  conversionToTarget: number
  /** deals / total * 100. */
  conversionToDeal: number
  /** nonTargetLeads / total * 100. */
  conversionToNonTarget: number
}

/**
 * Один бакет таймсерії (день / тиждень / місяць).
 */
export interface TimeseriesPoint {
  /** Ключ бакету: 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM' */
  dateIso: string
  /** Мітка для осі X: 'dd.MM' | 'Тиж. NN' | 'MM.YYYY' */
  label: string
  total: number
  targetLeads: number
  nonTargetLeads: number
  deals: number
  dealAdjustments: number
  dealAmountSum: number
  dealProfitSum: number
}

/**
 * Рядок блоку «По відповідальних».
 */
export interface AssigneeRow {
  /** user id або '__unassigned__' */
  key: string
  /** Ім'я/email | 'Без відповідального' */
  label: string
  total: number
  targetLeads: number
  nonTargetLeads: number
  deals: number
  dealAdjustments: number
  dealAmountSum: number
  dealProfitSum: number
}

/**
 * Одна серія розбивки (лінія) для timeseriesBreakdown.
 */
export interface BreakdownSeries {
  /** Технічний ключ серії (значення виміру або '__other__'). */
  key: string
  /** Відображувана назва серії. */
  label: string
  /** Колір лінії (призначається на сервері). */
  color: string
}

/**
 * Таймсерія з розбивкою по одному виміру (для графіка).
 * Присутня тільки якщо запитаний breakdown != 'none'.
 */
export interface TimeseriesBreakdown {
  /** Метрики, що відображаються на лініях (одна або декілька). */
  metrics: MetricKeyForBreakdown[]
  /** Серії: топ-виміри × обрані метрики (+ «Інші» на кожну метрику). */
  series: BreakdownSeries[]
  /** Точки часу з даними по кожній серії. */
  points: {
    dateIso: string
    label: string
    values: Record<string, number>
  }[]
}

/** Метрики доступні для breakdown-режиму графіка. */
export type MetricKeyForBreakdown =
  | 'total'
  | 'targetLeads'
  | 'nonTargetLeads'
  | 'deals'
  | 'dealAmountSum'
  | 'dealProfitSum'

/**
 * Виміри для селектора «Розбити за».
 * utm-виміри, status, service, assigned_to працюють і для зведеної таблиці
 * (group_by), і для розбивки графіка (timeseriesBreakdown).
 * 'custom_field' — лише розріз зведеної таблиці (group_by); таймсерія-розбивка
 * по кастом-полю на бекенді не підтримується, тож для нього графік лишається
 * сукупним (фронт шле breakdown='none', а group_by='custom_field').
 */
export type BreakdownDimension =
  | 'none'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_term'
  | 'utm_content'
  | 'status'
  | 'service'
  | 'assigned_to'
  | 'referral_link'
  | 'custom_field'

/** Ключ групи «без реферального посилання» (розріз/розбивка referral_link). */
export const NO_REFERRAL_KEY = '(без посилання)'
/** Підпис групи «без реферального посилання» в UI/експорті. */
export const NO_REFERRAL_LABEL = 'Без посилання'

/**
 * Повна відповідь GET /api/admin/analytics/report.
 */
export interface ReportResponse {
  /** Рядки зведеної таблиці (відсортовані за total DESC). */
  rows: ReportRow[]
  /** Сумарний рядок «Разом» по всіх рядках. */
  total: ReportRow
  /** Таймсерія за вибраний період з урахуванням tsGranularity. */
  timeseries: TimeseriesPoint[]
  /**
   * Таймсерія з розбивкою по виміру.
   * Присутня тільки якщо в запиті breakdown != 'none'.
   */
  timeseriesBreakdown?: TimeseriesBreakdown
  /** Розбивка по відповідальних. */
  byAssignee: AssigneeRow[]
  /**
   * Серверні флаги наявності типів стадій у БД.
   * hasProfitStages: є хоч одна стадія з amount_is_profit=true.
   * hasDealAdjustmentStages: є хоч одна стадія з conversion_type='deal_adjustment'.
   */
  flags: {
    hasProfitStages: boolean
    hasDealAdjustmentStages: boolean
  }
  /** Повторює вхідні params. */
  params: ReportParams
  /** Кількість лідів після фільтрів. */
  filteredCount: number
}

// ─── Утиліти таймзони ────────────────────────────────────────────────────────

const KYIV_TZ = 'Europe/Kyiv'

/**
 * Форматує UTC ISO-рядок у локальний ключ для groupBy = 'day'.
 * Результат: 'YYYY-MM-DD' за таймзоною Europe/Kyiv.
 */
export function toKyivDateKey(isoUtc: string): string {
  const d = new Date(isoUtc)
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d)
}

/**
 * Форматує UTC ISO-рядок у ключ для groupBy = 'week' (ISO-тиждень).
 * Результат: 'YYYY-Www', напр. '2025-W24'.
 */
export function toKyivWeekKey(isoUtc: string): string {
  const localDateStr = toKyivDateKey(isoUtc)
  const [y, m, dd] = localDateStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, dd))
  const dayOfWeek = d.getUTCDay() || 7 // 1=Mon..7=Sun
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + (4 - dayOfWeek))
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const isoYear = thursday.getUTCFullYear()
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Форматує UTC ISO-рядок у ключ для groupBy = 'month'.
 * Результат: 'YYYY-MM', напр. '2025-06'.
 */
export function toKyivMonthKey(isoUtc: string): string {
  return toKyivDateKey(isoUtc).substring(0, 7)
}

/**
 * Повертає ключ для дати залежно від groupBy.
 * Для нетимчасових розрізів повертає null.
 */
export function getDateKey(
  isoUtc: string,
  groupBy: GroupBy,
): string | null {
  if (groupBy === 'day')   return toKyivDateKey(isoUtc)
  if (groupBy === 'week')  return toKyivWeekKey(isoUtc)
  if (groupBy === 'month') return toKyivMonthKey(isoUtc)
  return null
}

// ─── Утиліти міток таймсерії ─────────────────────────────────────────────────

/** Повертає мітку осі X для бакету day: 'dd.MM' */
function dayLabel(dateIso: string): string {
  const [, mm, dd] = dateIso.split('-')
  return `${dd}.${mm}`
}

/** Повертає мітку осі X для бакету week: 'Тиж. NN' */
function weekLabel(weekKey: string): string {
  // weekKey = 'YYYY-Www'
  const num = weekKey.split('-W')[1] ?? weekKey
  return `Тиж. ${num}`
}

/** Повертає мітку осі X для бакету month: 'MM.YYYY' */
function monthLabel(monthKey: string): string {
  const [yyyy, mm] = monthKey.split('-')
  return `${mm}.${yyyy}`
}

// ─── Ітератор бакетів таймсерії ─────────────────────────────────────────────

/**
 * Генерує всі ключі бакетів від dateFrom до dateTo включно.
 * Повертає масив { dateIso, label } у хронологічному порядку.
 * Експортована для використання в analytics-report-server.ts.
 */
export function generateBuckets(
  dateFrom: string,
  dateTo: string,
  granularity: TsGranularity,
): Array<{ dateIso: string; label: string }> {
  const result: Array<{ dateIso: string; label: string }> = []
  const seen = new Set<string>()

  // Ітеруємо по днях і збираємо унікальні бакети
  const cursor = new Date(dateFrom + 'T00:00:00Z')
  const end    = new Date(dateTo   + 'T00:00:00Z')

  while (cursor <= end) {
    const isoDay = cursor.toISOString().substring(0, 10)
    let key: string
    let lbl: string

    if (granularity === 'day') {
      key = isoDay
      lbl = dayLabel(isoDay)
    } else if (granularity === 'week') {
      // Потрібно рахувати ISO-тиждень як для UTC-дати, що відповідає цьому дню
      key = toKyivWeekKey(cursor.toISOString())
      lbl = weekLabel(key)
    } else {
      key = isoDay.substring(0, 7)
      lbl = monthLabel(key)
    }

    if (!seen.has(key)) {
      seen.add(key)
      result.push({ dateIso: key, label: lbl })
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return result
}

// ─── Чисті агрегаторні функції (без DB) ─────────────────────────────────────

/**
 * Витягує значення розрізу з ліда для заданого groupBy.
 */
export function getGroupKey(lead: LeadForAggregation, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'utm_source':
      return lead.utm_source ?? '(невідомо)'
    case 'utm_medium':
      return lead.utm_medium ?? '(невідомо)'
    case 'utm_campaign':
      return lead.utm_campaign ?? '(невідомо)'
    case 'utm_term':
      return lead.utm_term ?? '(невідомо)'
    case 'utm_content':
      return lead.utm_content ?? '(невідомо)'
    case 'service':
      return lead.service ?? '(невідомо)'
    case 'assigned_to':
      return lead.assigned_to ?? '(невідомо)'
    case 'status':
      return lead.status_id ?? '(невідомо)'
    case 'referral_link':
      return lead.referral_link_id ?? NO_REFERRAL_KEY
    case 'day':
      return toKyivDateKey(lead.created_at)
    case 'week':
      return toKyivWeekKey(lead.created_at)
    case 'month':
      return toKyivMonthKey(lead.created_at)
    case 'custom_field':
      return lead.custom_field_value ?? '(не заповнено)'
  }
}

/** Внутрішня фабрика порожнього ReportRow. */
function emptyReportRow(key: string, label: string, color: string | null = null): ReportRow {
  return {
    key,
    label,
    color,
    total: 0,
    targetLeads: 0,
    nonTargetLeads: 0,
    deals: 0,
    dealAdjustments: 0,
    dealAmountSum: 0,
    dealProfitSum: 0,
    conversionToTarget: 0,
    conversionToDeal: 0,
    conversionToNonTarget: 0,
  }
}

/** Розраховує відсоткові конверсії для рядка (мутує). */
function calcConversions(row: ReportRow): void {
  row.conversionToTarget    = row.total > 0 ? (row.targetLeads    / row.total) * 100 : 0
  row.conversionToDeal      = row.total > 0 ? (row.deals          / row.total) * 100 : 0
  row.conversionToNonTarget = row.total > 0 ? (row.nonTargetLeads / row.total) * 100 : 0
}

/**
 * Агрегує масив лідів у зведену таблицю за заданим розрізом.
 *
 * @param leads    — Масив лідів після фільтрів
 * @param groupBy  — Розріз агрегації
 * @param labelMap — Словник key → label для нечислових розрізів.
 * @param colorMap — Словник key → color (тільки для 'status').
 * @returns        ReportRow[] відсортований DESC по total.
 */
export function aggregateLeads(
  leads: LeadForAggregation[],
  groupBy: GroupBy,
  labelMap: Record<string, string> = {},
  colorMap: Record<string, string> = {},
): ReportRow[] {
  const map = new Map<string, ReportRow>()

  for (const lead of leads) {
    const key = getGroupKey(lead, groupBy)

    let row = map.get(key)
    if (!row) {
      const label = labelMap[key] ?? key
      const color = colorMap[key] ?? null
      row = emptyReportRow(key, label, color)
      map.set(key, row)
    }

    row.total += 1

    if (lead.status_conversion_type === 'target_lead')    row.targetLeads    += 1
    if (lead.status_conversion_type === 'non_target_lead') row.nonTargetLeads += 1
    if (lead.status_conversion_type === 'deal')            row.deals          += 1
    if (lead.status_conversion_type === 'deal_adjustment') row.dealAdjustments += 1

    if (lead.deal_amount != null) row.dealAmountSum += lead.deal_amount
    if (lead.deal_profit != null) row.dealProfitSum += lead.deal_profit
  }

  for (const row of map.values()) {
    calcConversions(row)
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

/**
 * Обчислює підсумковий рядок «Разом» із масиву рядків.
 */
export function computeTotalRow(rows: ReportRow[]): ReportRow {
  const total = emptyReportRow('__total__', 'Разом')

  for (const r of rows) {
    total.total            += r.total
    total.targetLeads      += r.targetLeads
    total.nonTargetLeads   += r.nonTargetLeads
    total.deals            += r.deals
    total.dealAdjustments  += r.dealAdjustments
    total.dealAmountSum    += r.dealAmountSum
    total.dealProfitSum    += r.dealProfitSum
  }

  calcConversions(total)
  return total
}

/**
 * Будує таймсерію за заданою гранулярністю у таймзоні Europe/Kyiv.
 *
 * Генерує ВСІ бакети діапазону (включно з пустими нулями).
 *
 * @param leads       — Масив лідів за вибраний період
 * @param dateFrom    — Початок у форматі 'YYYY-MM-DD' (Kyiv)
 * @param dateTo      — Кінець у форматі 'YYYY-MM-DD' (Kyiv)
 * @param granularity — 'day' | 'week' | 'month' (default: 'day')
 */
export function buildTimeseries(
  leads: LeadForAggregation[],
  dateFrom: string,
  dateTo: string,
  granularity: TsGranularity = 'day',
): TimeseriesPoint[] {
  // Агрегуємо по бакетах
  type Bucket = {
    total: number
    targetLeads: number
    nonTargetLeads: number
    deals: number
    dealAdjustments: number
    dealAmountSum: number
    dealProfitSum: number
  }

  const bucketMap = new Map<string, Bucket>()

  for (const lead of leads) {
    let key: string
    if (granularity === 'day') {
      key = toKyivDateKey(lead.created_at)
    } else if (granularity === 'week') {
      key = toKyivWeekKey(lead.created_at)
    } else {
      key = toKyivMonthKey(lead.created_at)
    }

    const existing = bucketMap.get(key) ?? {
      total: 0, targetLeads: 0, nonTargetLeads: 0,
      deals: 0, dealAdjustments: 0, dealAmountSum: 0, dealProfitSum: 0,
    }

    existing.total += 1
    if (lead.status_conversion_type === 'target_lead')    existing.targetLeads    += 1
    if (lead.status_conversion_type === 'non_target_lead') existing.nonTargetLeads += 1
    if (lead.status_conversion_type === 'deal')            existing.deals          += 1
    if (lead.status_conversion_type === 'deal_adjustment') existing.dealAdjustments += 1
    if (lead.deal_amount != null) existing.dealAmountSum += lead.deal_amount
    if (lead.deal_profit != null) existing.dealProfitSum += lead.deal_profit

    bucketMap.set(key, existing)
  }

  // Генеруємо всі бакети діапазону (включаючи пусті)
  const buckets = generateBuckets(dateFrom, dateTo, granularity)

  return buckets.map(({ dateIso, label }) => {
    const agg = bucketMap.get(dateIso) ?? {
      total: 0, targetLeads: 0, nonTargetLeads: 0,
      deals: 0, dealAdjustments: 0, dealAmountSum: 0, dealProfitSum: 0,
    }
    return {
      dateIso,
      label,
      ...agg,
    }
  })
}

/**
 * Агрегує ліди по відповідальних.
 *
 * @param leads    — Масив лідів після фільтрів
 * @param labelMap — Словник userId → displayName/email
 * @returns        AssigneeRow[], відсортований по total DESC, __unassigned__ завжди останній
 */
export function aggregateByAssignee(
  leads: LeadForAggregation[],
  labelMap: Record<string, string> = {},
): AssigneeRow[] {
  const map = new Map<string, AssigneeRow>()

  for (const lead of leads) {
    const isAssigned = !!lead.assigned_to
    const key   = isAssigned ? lead.assigned_to! : '__unassigned__'
    const label = isAssigned
      ? (labelMap[lead.assigned_to!] ?? lead.assigned_to!)
      : 'Без відповідального'

    let row = map.get(key)
    if (!row) {
      row = {
        key,
        label,
        total: 0,
        targetLeads: 0,
        nonTargetLeads: 0,
        deals: 0,
        dealAdjustments: 0,
        dealAmountSum: 0,
        dealProfitSum: 0,
      }
      map.set(key, row)
    }

    row.total += 1
    if (lead.status_conversion_type === 'target_lead')    row.targetLeads    += 1
    if (lead.status_conversion_type === 'non_target_lead') row.nonTargetLeads += 1
    if (lead.status_conversion_type === 'deal')            row.deals          += 1
    if (lead.status_conversion_type === 'deal_adjustment') row.dealAdjustments += 1
    if (lead.deal_amount != null) row.dealAmountSum += lead.deal_amount
    if (lead.deal_profit != null) row.dealProfitSum += lead.deal_profit
  }

  const unassigned = map.get('__unassigned__')
  const assigned   = Array.from(map.values())
    .filter((r) => r.key !== '__unassigned__')
    .sort((a, b) => b.total - a.total)

  // __unassigned__ завжди останній, і тільки якщо є такі ліди
  return unassigned ? [...assigned, unassigned] : assigned
}

/**
 * Застосовує додаткові фільтри до масиву лідів.
 * Виконується до агрегації; вхід не мутується.
 */
export function filterLeads(
  leads: LeadForAggregation[],
  params: Pick<
    ReportParams,
    | 'filterUtmSource'
    | 'filterService'
    | 'filterAssignedTo'
    | 'filterAssigneeIds'
    | 'filterStatusIds'
    | 'filterGclid'
    | 'filterReferralLinkId'
    | 'filterGroupValue'
  > & { groupBy?: GroupBy },
): LeadForAggregation[] {
  return leads.filter((lead) => {
    if (params.filterUtmSource  && lead.utm_source   !== params.filterUtmSource)  return false
    if (params.filterService    && lead.service      !== params.filterService)     return false

    // Кілька відповідальних має пріоритет; інакше — одиночний filterAssignedTo
    if (params.filterAssigneeIds && params.filterAssigneeIds.length > 0) {
      if (!lead.assigned_to || !params.filterAssigneeIds.includes(lead.assigned_to)) return false
    } else if (params.filterAssignedTo && lead.assigned_to !== params.filterAssignedTo) {
      return false
    }

    // Фільтр по стадіях (multi)
    if (params.filterStatusIds && params.filterStatusIds.length > 0) {
      if (!lead.status_id || !params.filterStatusIds.includes(lead.status_id)) return false
    }

    // Фільтр по gclid
    if (params.filterGclid === 'with' && !lead.gclid)   return false
    if (params.filterGclid === 'without' && !!lead.gclid) return false

    // Фільтр по реферальному посиланню: 'none' — лише без посилання, інакше — конкретне
    if (params.filterReferralLinkId === 'none') {
      if (lead.referral_link_id) return false
    } else if (params.filterReferralLinkId && lead.referral_link_id !== params.filterReferralLinkId) {
      return false
    }

    // Універсальний фільтр по значенню поточного розрізу.
    // getGroupKey коректно витягує значення для будь-якого виміру
    // (utm_*, status→id, assigned_to→id, service, custom_field→value).
    if (params.filterGroupValue && params.groupBy) {
      if (getGroupKey(lead, params.groupBy) !== params.filterGroupValue) return false
    }

    return true
  })
}

/**
 * Головний агрегатор — orchestrates filterLeads + aggregateLeads +
 * computeTotalRow + buildTimeseries + aggregateByAssignee в одну відповідь ReportResponse.
 *
 * @param allLeads         — Рядки з БД за [dateFrom, dateTo]
 * @param params           — Параметри запиту
 * @param labelMap         — Словник ключ → мітка для нечислових розрізів (groupBy)
 * @param colorMap         — Словник ключ → колір (для стадій)
 * @param flags            — Серверні флаги (передає route після select по lead_statuses)
 * @param assigneeLabelMap — Окремий словник userId → displayName для блоку byAssignee.
 *                          Якщо не передано — використовується labelMap.
 */
export function buildReport(
  allLeads: LeadForAggregation[],
  params: ReportParams,
  labelMap: Record<string, string> = {},
  colorMap: Record<string, string> = {},
  flags: ReportResponse['flags'] = { hasProfitStages: false, hasDealAdjustmentStages: false },
  assigneeLabelMap?: Record<string, string>,
): ReportResponse {
  const filtered   = filterLeads(allLeads, params)
  const rows       = aggregateLeads(filtered, params.groupBy, labelMap, colorMap)
  const total      = computeTotalRow(rows)
  const granularity: TsGranularity = params.tsGranularity ?? 'day'
  const timeseries = buildTimeseries(filtered, params.dateFrom, params.dateTo, granularity)
  // byAssignee завжди будується з окремим assigneeLabelMap або з labelMap
  const byAssignee = aggregateByAssignee(filtered, assigneeLabelMap ?? labelMap)

  return {
    rows,
    total,
    timeseries,
    byAssignee,
    flags,
    params,
    filteredCount: filtered.length,
  }
}
