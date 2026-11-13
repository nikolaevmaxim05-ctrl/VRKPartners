/**
 * analytics-report.ts
 *
 * Контракт типов и чистые агрегирующие функции для вкладки «Аналітика».
 *
 * АРХИТЕКТУРНЫЕ РЕШЕНИЯ (зафиксированы здесь, детали — prompts/020-plan.md):
 *
 * 1. АГРЕГАЦИЯ — select строк + JS-агрегация в route.ts.
 *    Лидген-БД содержит < 10k строк, поэтому SQL RPC не нужен.
 *    Преимущества: проще тестировать (без миграций), легче расширять метрики.
 *    Порог пересмотра: если count > 10_000 — route возвращает 503 с советом
 *    сузить период, но SQL RPC остаётся опцией на будущее.
 *
 * 2. ТАЙМЗОНА — date-fns уже есть в зависимостях (^4.1.0).
 *    Используем Intl.DateTimeFormat с timeZone: 'Europe/Kyiv' для
 *    форматирования ключей группировки (YYYY-MM-DD, YYYY-Www, YYYY-MM).
 *    date-fns-tz НЕ нужен — Intl достаточно, и он не добавляет вес к бандлу.
 *    Конкретная реализация: функция toKyivDateKey() ниже.
 *
 * 3. СЕМАНТИКА МЕТРИК — через conversion_type стадий (миграция 012).
 *    «Цільовий лід»    = текущая стадия лида имеет conversion_type = 'target_lead'.
 *    «Нецільовий лід»  = conversion_type = 'non_target_lead'.
 *    «Угода»           = conversion_type = 'deal'.
 *    «Повторна угода»  = conversion_type = 'deal_adjustment'.
 *    Ни одного хардкода названий стадий — только conversion_type.
 *
 * 4. ПРАВА — permission 'view_reports' (уже есть в lib/permissions.ts).
 *    GET /api/admin/analytics/report  → hasPermission(user.id, 'view_reports')
 *    GET /api/admin/analytics/export  → hasPermission(user.id, 'view_reports')
 */

// ─── Входные параметры ───────────────────────────────────────────────────────

/** Разрезы (groupBy) — соответствуют UI-селекту «Розріз». */
export type GroupBy =
  | 'utm_source'    // Источник
  | 'utm_medium'    // UTM Medium
  | 'utm_campaign'  // UTM Campaign
  | 'utm_term'      // UTM Term
  | 'utm_content'   // UTM Content
  | 'status'        // Стадия
  | 'service'       // Услуга
  | 'assigned_to'   // Ответственный
  | 'referral_link' // Реферальная ссылка (партнёр)
  | 'day'           // День
  | 'week'          // Неделя
  | 'month'         // Месяц
  | 'custom_field'  // Дополнительное поле (требует customFieldId)

/** Гранулярность таймсерии. */
export type TsGranularity = 'day' | 'week' | 'month'

/**
 * Параметры запроса аналитического отчёта.
 * Все поля из query string — строки; парсинг/валидация в route.ts через Zod.
 */
export interface ReportParams {
  /** ISO-дата начала (включительно), напр. '2025-01-01'. */
  dateFrom: string
  /** ISO-дата конца (включительно), напр. '2025-01-31'. */
  dateTo: string
  /** Разрез агрегации. Default: 'day'. */
  groupBy: GroupBy
  /** При groupBy='custom_field' — обязательный UUID кастомного поля. */
  customFieldId?: string
  /** Гранулярность таймсерии. Default: 'day'. */
  tsGranularity?: TsGranularity
  /** Доп. фильтр: источник (utm_source). Пустая строка = все. */
  filterUtmSource?: string
  /** Доп. фильтр: услуга (service). Пустая строка = все. */
  filterService?: string
  /** Доп. фильтр: ответственный (assigned_to UUID). Пустая строка = все. */
  filterAssignedTo?: string
  /** Доп. фильтр: несколько ответственных (список UUID). Имеет приоритет над filterAssignedTo. */
  filterAssigneeIds?: string[]
  /** Доп. фильтр: стадии (список UUID). Пустой массив = все. */
  filterStatusIds?: string[]
  /** Доп. фильтр: наличие gclid. Default: 'any'. */
  filterGclid?: 'any' | 'with' | 'without'
  /** Доп. фильтр: реферальная ссылка — UUID или 'none' (без ссылки). Пусто = все. */
  filterReferralLinkId?: string
  /**
   * Доп. фильтр по КОНКРЕТНОМУ значению текущего разреза (groupBy).
   * Напр. groupBy='utm_campaign' + filterGroupValue='spring_sale' → оставить
   * только лиды этой кампании. Пустая строка = все значения.
   * Фильтрация через getGroupKey, поэтому работает для всех измерений одинаково.
   */
  filterGroupValue?: string
  /** Разбивка графика по измерению. Default: 'none'. */
  breakdown?: BreakdownDimension
  /** Метрика для breakdown-линий. Default: 'total'. */
  breakdownMetric?: MetricKeyForBreakdown
}

// ─── Внутренние модели (вход для агрегатора) ────────────────────────────────

/**
 * Сокращённая модель лида — только поля, нужные для агрегации.
 * Route передаёт сюда строки из БД после select.
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
  /** conversion_type текущей стадии. Null, если стадии нет. */
  status_conversion_type: 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment' | null
  /** Название стадии для группировки по 'status'. */
  status_name: string | null
  /** ID стадии. */
  status_id: string | null
  /** Цвет стадии — для UI. */
  status_color: string | null
  /** Реферальная ссылка (партнёр), по которой пришла заявка; null — без ссылки. */
  referral_link_id: string | null
  /** Название партнёра из embed referral_links (для меток разреза/разбивки). */
  referral_link_name: string | null
  /** Код из перехода, если ссылка не найдена/выключена на момент заявки. */
  referral_code: string | null
  /**
   * Значение выбранного кастомного поля для этого лида.
   * Подставляется route-ом при group_by=custom_field или соответствующих фильтрах.
   */
  custom_field_value?: string | null
}

// ─── Выходные типы (ответ API) ───────────────────────────────────────────────

/**
 * Одна строка сводной таблицы.
 */
export interface ReportRow {
  /** Технический ключ разреза. */
  key: string
  /** Отображаемое название в UI. */
  label: string
  /** Цвет строки (для стадий). Null для других разрезов. */
  color: string | null

  /** Общее количество заявок. */
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
 * Один бакет таймсерии (день / неделя / месяц).
 */
export interface TimeseriesPoint {
  /** Ключ бакета: 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM' */
  dateIso: string
  /** Метка для оси X: 'dd.MM' | 'Тиж. NN' | 'MM.YYYY' */
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
 * Строка блока «По відповідальних».
 */
export interface AssigneeRow {
  /** user id или '__unassigned__' */
  key: string
  /** Имя/email | 'Без відповідального' */
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
 * Одна серия разбивки (линия) для timeseriesBreakdown.
 */
export interface BreakdownSeries {
  /** Технический ключ серии (значение измерения или '__other__'). */
  key: string
  /** Отображаемое название серии. */
  label: string
  /** Цвет линии (назначается на сервере). */
  color: string
}

/**
 * Таймсерия с разбивкой по одному измерению (для графика).
 * Присутствует, только если запрошен breakdown != 'none'.
 */
export interface TimeseriesBreakdown {
  /** Метрики, отображаемые на линиях (одна или несколько). */
  metrics: MetricKeyForBreakdown[]
  /** Серии: топ-измерения × выбранные метрики (+ «Інші» на каждую метрику). */
  series: BreakdownSeries[]
  /** Точки времени с данными по каждой серии. */
  points: {
    dateIso: string
    label: string
    values: Record<string, number>
  }[]
}

/** Метрики, доступные для breakdown-режима графика. */
export type MetricKeyForBreakdown =
  | 'total'
  | 'targetLeads'
  | 'nonTargetLeads'
  | 'deals'
  | 'dealAmountSum'
  | 'dealProfitSum'

/**
 * Измерения для селектора «Розбити за».
 * utm-измерения, status, service, assigned_to работают и для сводной таблицы
 * (group_by), и для разбивки графика (timeseriesBreakdown).
 * 'custom_field' — только разрез сводной таблицы (group_by); таймсерия-разбивка
 * по кастом-полю на бэкенде не поддерживается, так что для него график остаётся
 * совокупным (фронт шлёт breakdown='none', а group_by='custom_field').
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

/** Ключ группы «без реферальной ссылки» (разрез/разбивка referral_link). */
export const NO_REFERRAL_KEY = '(без посилання)'
/** Подпись группы «без реферальной ссылки» в UI/экспорте. */
export const NO_REFERRAL_LABEL = 'Без посилання'

/**
 * Полный ответ GET /api/admin/analytics/report.
 */
export interface ReportResponse {
  /** Строки сводной таблицы (отсортированы по total DESC). */
  rows: ReportRow[]
  /** Суммарная строка «Разом» по всем строкам. */
  total: ReportRow
  /** Таймсерия за выбранный период с учётом tsGranularity. */
  timeseries: TimeseriesPoint[]
  /**
   * Таймсерия с разбивкой по измерению.
   * Присутствует, только если в запросе breakdown != 'none'.
   */
  timeseriesBreakdown?: TimeseriesBreakdown
  /** Разбивка по ответственным. */
  byAssignee: AssigneeRow[]
  /**
   * Серверные флаги наличия типов стадий в БД.
   * hasProfitStages: есть хоть одна стадия с amount_is_profit=true.
   * hasDealAdjustmentStages: есть хоть одна стадия с conversion_type='deal_adjustment'.
   */
  flags: {
    hasProfitStages: boolean
    hasDealAdjustmentStages: boolean
  }
  /** Повторяет входные params. */
  params: ReportParams
  /** Количество лидов после фильтров. */
  filteredCount: number
}

// ─── Утилиты таймзоны ────────────────────────────────────────────────────────

const KYIV_TZ = 'Europe/Kyiv'

/**
 * Форматирует UTC ISO-строку в локальный ключ для groupBy = 'day'.
 * Результат: 'YYYY-MM-DD' по таймзоне Europe/Kyiv.
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
 * Форматирует UTC ISO-строку в ключ для groupBy = 'week' (ISO-неделя).
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
 * Форматирует UTC ISO-строку в ключ для groupBy = 'month'.
 * Результат: 'YYYY-MM', напр. '2025-06'.
 */
export function toKyivMonthKey(isoUtc: string): string {
  return toKyivDateKey(isoUtc).substring(0, 7)
}

/**
 * Возвращает ключ для даты в зависимости от groupBy.
 * Для невременных разрезов возвращает null.
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

// ─── Утилиты меток таймсерии ─────────────────────────────────────────────────

/** Возвращает метку оси X для бакета day: 'dd.MM' */
function dayLabel(dateIso: string): string {
  const [, mm, dd] = dateIso.split('-')
  return `${dd}.${mm}`
}

/** Возвращает метку оси X для бакета week: 'Тиж. NN' */
function weekLabel(weekKey: string): string {
  // weekKey = 'YYYY-Www'
  const num = weekKey.split('-W')[1] ?? weekKey
  return `Тиж. ${num}`
}

/** Возвращает метку оси X для бакета month: 'MM.YYYY' */
function monthLabel(monthKey: string): string {
  const [yyyy, mm] = monthKey.split('-')
  return `${mm}.${yyyy}`
}

// ─── Итератор бакетов таймсерии ─────────────────────────────────────────────

/**
 * Генерирует все ключи бакетов от dateFrom до dateTo включительно.
 * Возвращает массив { dateIso, label } в хронологическом порядке.
 * Экспортирована для использования в analytics-report-server.ts.
 */
export function generateBuckets(
  dateFrom: string,
  dateTo: string,
  granularity: TsGranularity,
): Array<{ dateIso: string; label: string }> {
  const result: Array<{ dateIso: string; label: string }> = []
  const seen = new Set<string>()

  // Итерируем по дням и собираем уникальные бакеты
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
      // Нужно считать ISO-неделю как для UTC-даты, соответствующей этому дню
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

// ─── Чистые агрегирующие функции (без DB) ───────────────────────────────────

/**
 * Извлекает значение разреза из лида для заданного groupBy.
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

/** Внутренняя фабрика пустого ReportRow. */
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

/** Рассчитывает процентные конверсии для строки (мутирует). */
function calcConversions(row: ReportRow): void {
  row.conversionToTarget    = row.total > 0 ? (row.targetLeads    / row.total) * 100 : 0
  row.conversionToDeal      = row.total > 0 ? (row.deals          / row.total) * 100 : 0
  row.conversionToNonTarget = row.total > 0 ? (row.nonTargetLeads / row.total) * 100 : 0
}

/**
 * Агрегирует массив лидов в сводную таблицу по заданному разрезу.
 *
 * @param leads    — Массив лидов после фильтров
 * @param groupBy  — Разрез агрегации
 * @param labelMap — Словарь key → label для нечисловых разрезов.
 * @param colorMap — Словарь key → color (только для 'status').
 * @returns        ReportRow[], отсортированный DESC по total.
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
 * Вычисляет итоговую строку «Разом» из массива строк.
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
 * Строит таймсерию с заданной гранулярностью в таймзоне Europe/Kyiv.
 *
 * Генерирует ВСЕ бакеты диапазона (включая пустые нули).
 *
 * @param leads       — Массив лидов за выбранный период
 * @param dateFrom    — Начало в формате 'YYYY-MM-DD' (Kyiv)
 * @param dateTo      — Конец в формате 'YYYY-MM-DD' (Kyiv)
 * @param granularity — 'day' | 'week' | 'month' (default: 'day')
 */
export function buildTimeseries(
  leads: LeadForAggregation[],
  dateFrom: string,
  dateTo: string,
  granularity: TsGranularity = 'day',
): TimeseriesPoint[] {
  // Агрегируем по бакетам
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

  // Генерируем все бакеты диапазона (включая пустые)
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
 * Агрегирует лиды по ответственным.
 *
 * @param leads    — Массив лидов после фильтров
 * @param labelMap — Словарь userId → displayName/email
 * @returns        AssigneeRow[], отсортированный по total DESC, __unassigned__ всегда последний
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

  // __unassigned__ всегда последний, и только если есть такие лиды
  return unassigned ? [...assigned, unassigned] : assigned
}

/**
 * Применяет дополнительные фильтры к массиву лидов.
 * Выполняется до агрегации; вход не мутируется.
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

    // Несколько ответственных имеют приоритет; иначе — одиночный filterAssignedTo
    if (params.filterAssigneeIds && params.filterAssigneeIds.length > 0) {
      if (!lead.assigned_to || !params.filterAssigneeIds.includes(lead.assigned_to)) return false
    } else if (params.filterAssignedTo && lead.assigned_to !== params.filterAssignedTo) {
      return false
    }

    // Фильтр по стадиям (multi)
    if (params.filterStatusIds && params.filterStatusIds.length > 0) {
      if (!lead.status_id || !params.filterStatusIds.includes(lead.status_id)) return false
    }

    // Фильтр по gclid
    if (params.filterGclid === 'with' && !lead.gclid)   return false
    if (params.filterGclid === 'without' && !!lead.gclid) return false

    // Фильтр по реферальной ссылке: 'none' — только без ссылки, иначе — конкретная
    if (params.filterReferralLinkId === 'none') {
      if (lead.referral_link_id) return false
    } else if (params.filterReferralLinkId && lead.referral_link_id !== params.filterReferralLinkId) {
      return false
    }

    // Универсальный фильтр по значению текущего разреза.
    // getGroupKey корректно извлекает значение для любого измерения
    // (utm_*, status→id, assigned_to→id, service, custom_field→value).
    if (params.filterGroupValue && params.groupBy) {
      if (getGroupKey(lead, params.groupBy) !== params.filterGroupValue) return false
    }

    return true
  })
}

/**
 * Главный агрегатор — orchestrates filterLeads + aggregateLeads +
 * computeTotalRow + buildTimeseries + aggregateByAssignee в один ответ ReportResponse.
 *
 * @param allLeads         — Строки из БД за [dateFrom, dateTo]
 * @param params           — Параметры запроса
 * @param labelMap         — Словарь ключ → метка для нечисловых разрезов (groupBy)
 * @param colorMap         — Словарь ключ → цвет (для стадий)
 * @param flags            — Серверные флаги (передаёт route после select по lead_statuses)
 * @param assigneeLabelMap — Отдельный словарь userId → displayName для блока byAssignee.
 *                          Если не передан — используется labelMap.
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
  // byAssignee всегда строится с отдельным assigneeLabelMap или с labelMap
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
