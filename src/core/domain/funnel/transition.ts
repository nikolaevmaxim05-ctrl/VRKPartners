// core/domain/funnel/transition — что происходит при изменении лида (раздел 6 стандарта).
// Чистые правила; сценарий (use-cases/admin/leads) только выполняет план.
//
// Случай определяется по стадии ПОСЛЕ изменения:
//   enter  — стадия изменилась, новая конверсионная → записать конверсию (новую или обновить);
//   leave  — стадия изменилась, новая НЕ конверсионная → RETRACT, если конверсия уже выгружена;
//   amount — стадия та же, конверсионная с суммой, сумма изменилась → RESTATE (если выгружена);
//   none   — остальное.
import { isAmountConversionType, type ConversionType } from './stage-rules'

/** Типы конверсий, которые считаются «целевым» состоянием (для RETRACT при замене). */
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
 * Обнуление суммы при переходе «из сделки → без сделки».
 * Не трогает поля, которые клиент передал явно (bodyKeys).
 * Возвращает дополнение к update и флаг для system-комментария.
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
 * Значение конверсии для стадии: только если requires_amount; для deal_adjustment —
 * прибыль, иначе — сумма сделки. Без суммы → null.
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

/** Конверсионная ли стадия (is_final + conversion_type задан). */
export function isConversionStage(status: StatusLike): boolean {
  return !!status?.is_final && status.conversion_type != null
}

export type LeadChangeCase = 'enter' | 'leave' | 'amount' | 'none'

/** Какой случай раздела 6 наступил (стадия берётся ПОСЛЕ изменения). */
export function classifyLeadChange(args: {
  statusChanged: boolean
  oldStatus: StatusLike
  newStatus: StatusLike
  /** Значения конверсии (resolveConversionValue) до и после отличаются. */
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
  export_status: 'pending' | 'exported' | 'retracted'
  conversion_action: string
}

export type AdjustmentDecision =
  | { kind: 'retract'; conversionAction: string; offlineConversionId: string }
  | { kind: 'restate'; conversionAction: string; value: number | null }
  | { kind: 'none' }

/**
 * Корректировка при enter на конверсионную стадию (раздел 6, п. 3):
 *  - конверсия ЗАМЕНЕНА другой (целевой → нецелевой; целевой лид → сделка; изменилось действие)
 *    → RETRACT, только если старая уже выгружена (exported);
 *  - та же сделка, изменилась сумма → RESTATE;
 *  - иначе — ничего.
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

/** leave: отозвать конверсию (RETRACT) только если она уже выгружена; pending Google не видел. */
export function decideLeave(ocBefore: ExistingConversionState | null): AdjustmentDecision {
  if (ocBefore?.export_status === 'exported') {
    return { kind: 'retract', conversionAction: ocBefore.conversion_action, offlineConversionId: ocBefore.id }
  }
  return { kind: 'none' }
}

/**
 * amount: стадия та же, сумма изменилась. Если конверсия уже выгружена — RESTATE с новой суммой;
 * если ещё pending — корректировки нет (новое состояние уйдёт самой строкой конверсии).
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

/** Изменилось ли состояние конверсии (действие/тип/сумма) — иначе noop без записи и выгрузки. */
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
