// core/domain/funnel/transition — що відбувається при зміні ліда (розділ 6 стандарту).
// Чисті правила; сценарій (use-cases/admin/leads) лише виконує план.
//
// Випадок визначається за стадією ПІСЛЯ зміни:
//   enter  — стадія змінилась, нова конверсійна → записати конверсію (нову або оновити);
//   leave  — стадія змінилась, нова НЕ конверсійна → RETRACT, якщо конверсію вже вивантажено;
//   amount — стадія та сама, конверсійна з сумою, сума змінилась → RESTATE (якщо вивантажено);
//   none   — решта.
import { isAmountConversionType, type ConversionType } from './stage-rules'

/** Типи конверсій, які вважаються «цільовим» станом (для RETRACT при заміні). */
export const TARGET_TYPES: readonly string[] = ['target_lead', 'deal', 'deal_adjustment']

export type StatusForTransition = {
  id: string
  name: string
  is_final: boolean
  conversion_type: ConversionType | null
  conversion_action: string | null
  requires_amount: boolean
  amount_is_profit: boolean
}

/**
 * Обнулення суми при переході «з угоди → без угоди».
 * Не чіпає поля, які клієнт передав явно (bodyKeys).
 * Повертає доповнення до update і прапор для system-коментаря.
 */
export function planDealClearing(args: {
  before: { deal_amount: unknown; deal_profit: unknown }
  bodyKeys: ReadonlySet<string>
  oldConversionType: string | null
  newConversionType: string | null
}): { update: { deal_amount?: null; deal_profit?: null }; cleared: boolean } {
  const wasDeal = isAmountConversionType(args.oldConversionType)
  const willBeDeal = isAmountConversionType(args.newConversionType)
  if (!(wasDeal && !willBeDeal)) return { update: {}, cleared: false }

  const willClearAmount = !args.bodyKeys.has('deal_amount') && args.before.deal_amount != null
  const willClearProfit = !args.bodyKeys.has('deal_profit') && args.before.deal_profit != null
  const update: { deal_amount?: null; deal_profit?: null } = {}
  if (willClearAmount) update.deal_amount = null
  if (willClearProfit) update.deal_profit = null
  return { update, cleared: willClearAmount || willClearProfit }
}

/**
 * Значення конверсії для стадії: лише якщо requires_amount; для deal_adjustment —
 * прибуток, інакше — сума угоди. Без суми → null.
 */
export function resolveConversionValue(
  status: { requires_amount?: boolean; conversion_type?: string | null },
  lead: { deal_amount: unknown; deal_profit: unknown },
): number | null {
  if (!status.requires_amount) return null
  if (status.conversion_type === 'deal_adjustment') {
    return lead.deal_profit != null ? Number(lead.deal_profit) : null
  }
  return lead.deal_amount != null ? Number(lead.deal_amount) : null
}

type StatusLike = { is_final?: boolean; conversion_type?: string | null; requires_amount?: boolean } | null | undefined

/** Чи стадія конверсійна (is_final + conversion_type задано). */
export function isConversionStage(status: StatusLike): boolean {
  return !!status?.is_final && status.conversion_type != null
}

export type LeadChangeCase = 'enter' | 'leave' | 'amount' | 'none'

/** Який випадок розділу 6 настав (стадія береться ПІСЛЯ зміни). */
export function classifyLeadChange(args: {
  statusChanged: boolean
  oldStatus: StatusLike
  newStatus: StatusLike
  /** Значення конверсії (resolveConversionValue) до і після відрізняються. */
  amountChanged: boolean
}): LeadChangeCase {
  const { statusChanged, oldStatus, newStatus, amountChanged } = args
  if (statusChanged) {
    if (isConversionStage(newStatus)) return 'enter'
    if (isConversionStage(oldStatus)) return 'leave'
    return 'none'
  }
  if (isConversionStage(newStatus) && newStatus?.requires_amount && amountChanged) return 'amount'
  return 'none'
}

export type RecordOutcome =
  | { outcome: 'inserted' }
  | { outcome: 'updated'; action: string; prevAction: string; prevType: string | null; prevValue: number | null; valueChanged: boolean }
  | { outcome: 'noop' }
  | { outcome: 'error' }

export type ExistingConversionState = {
  id: string
  export_status: 'pending' | 'exported'
  conversion_action: string
}

export type AdjustmentDecision =
  | { kind: 'retract'; conversionAction: string; offlineConversionId: string }
  | { kind: 'restate'; conversionAction: string; value: number | null }
  | { kind: 'none' }

/**
 * Корекція при enter на конверсійну стадію (розділ 6, п. 3):
 *  - конверсію ЗАМІНЕНО іншою (цільовий → нецільовий; цільовий лід → угода; змінилась дія)
 *    → RETRACT, лише якщо стара вже вивантажена (exported);
 *  - та сама угода, змінилась сума → RESTATE;
 *  - інакше — нічого.
 */
export function decideAdjustment(args: {
  oldConversionType: string | null
  newConversionType: string | null
  outcome: RecordOutcome
  ocBefore: ExistingConversionState | null
  conversionValue: number | null
}): AdjustmentDecision {
  const { oldConversionType, newConversionType, outcome, ocBefore } = args
  const wasTarget = oldConversionType != null && TARGET_TYPES.includes(oldConversionType)

  const replaced =
    (wasTarget && newConversionType === 'non_target_lead') ||
    (oldConversionType === 'target_lead' && isAmountConversionType(newConversionType)) ||
    (outcome.outcome === 'updated' && outcome.action !== outcome.prevAction)

  if (replaced) {
    if (ocBefore?.export_status === 'exported') {
      return { kind: 'retract', conversionAction: ocBefore.conversion_action, offlineConversionId: ocBefore.id }
    }
    return { kind: 'none' }
  }

  if (
    outcome.outcome === 'updated' &&
    outcome.valueChanged &&
    isAmountConversionType(newConversionType)
  ) {
    return { kind: 'restate', conversionAction: outcome.action, value: args.conversionValue }
  }

  return { kind: 'none' }
}

/** leave: відкликати конверсію (RETRACT) лише якщо вона вже вивантажена; pending Google не бачив. */
export function decideLeave(ocBefore: ExistingConversionState | null): AdjustmentDecision {
  if (ocBefore?.export_status === 'exported') {
    return { kind: 'retract', conversionAction: ocBefore.conversion_action, offlineConversionId: ocBefore.id }
  }
  return { kind: 'none' }
}

/**
 * amount: стадія та сама, сума змінилась. Якщо конверсію вже вивантажено — RESTATE з новою сумою;
 * якщо ще pending — корекції нема (новий стан піде самим рядком конверсії).
 */
export function decideAmountAdjustment(args: {
  outcome: RecordOutcome
  ocBefore: ExistingConversionState | null
  conversionValue: number | null
}): AdjustmentDecision {
  const { outcome, ocBefore, conversionValue } = args
  if (outcome.outcome === 'updated' && outcome.valueChanged && ocBefore?.export_status === 'exported') {
    return { kind: 'restate', conversionAction: outcome.action, value: conversionValue }
  }
  return { kind: 'none' }
}

/** Чи змінився стан конверсії (дія/тип/сума) — інакше noop без запису та вивантаження. */
export function conversionStateChanged(
  existing: { conversion_action: string; conversion_type: string | null; conversion_value: unknown },
  next: { action: string; type: string | null; value: number | null },
): { changed: boolean; valueChanged: boolean } {
  const normNum = (x: unknown): number | null => (x == null ? null : Number(x))
  const valueChanged = normNum(next.value) !== normNum(existing.conversion_value)
  const changed =
    next.action !== existing.conversion_action ||
    (next.type ?? null) !== (existing.conversion_type ?? null) ||
    valueChanged
  return { changed, valueChanged }
}
