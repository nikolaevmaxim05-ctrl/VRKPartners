// core/domain/funnel/stage-rules — правила конфігурації стадій воронки (раздел 6).
// Винесено з /api/admin/lead-statuses (POST) і /api/admin/lead-statuses/[id] (PATCH)
// без зміни поведінки: той самий порядок перевірок і ті самі тексти помилок.
import { validateConversionAction } from './conversion-action'

export type ConversionType = 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment'

export const VALID_CONVERSION_TYPES: readonly ConversionType[] = [
  'target_lead',
  'non_target_lead',
  'deal',
  'deal_adjustment',
] as const

/** Типи конверсій, для яких допустима сума (requires_amount). */
export const AMOUNT_CONVERSION_TYPES: readonly ConversionType[] = ['deal', 'deal_adjustment'] as const

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAmountConversionType(t: string | null | undefined): boolean {
  return t != null && (AMOUNT_CONVERSION_TYPES as readonly string[]).includes(t)
}

export function isValidConversionType(t: unknown): t is ConversionType {
  return typeof t === 'string' && (VALID_CONVERSION_TYPES as readonly string[]).includes(t)
}

export const STAGE_ERRORS = {
  name: 'Назва: 1-64 символи',
  color: 'Колір має бути у форматі #rrggbb',
  position: 'Невірна позиція',
  conversionType: 'conversion_type: target_lead / non_target_lead / deal / deal_adjustment / null',
  conversionActionRequired: "При обраному типі конверсії обов'язкова назва конверсії в Google Ads",
  requiresAmount: 'requires_amount допустимий лише для типу конверсії «Угода» або «Корекція угоди»',
  amountIsProfit: 'amount_is_profit допустимий лише коли requires_amount=true',
  nextIdsArray: 'allowed_next_status_ids має бути масивом',
  nextIdsStrings: 'allowed_next_status_ids: усі елементи мають бути рядками',
  prevIdsArray: 'allowed_prev_status_ids має бути масивом',
  prevIdsUuid: 'allowed_prev_status_ids: невірний UUID',
  lastInitial: 'Має існувати щонайменше одна початкова стадія',
} as const

// ── PATCH ────────────────────────────────────────────────────────────────────

export type StagePatchBody = Partial<{
  name: string
  color: string
  position: number
  is_final: boolean
  is_initial: boolean
  conversion_type: ConversionType | null
  conversion_action: string | null
  requires_amount: boolean
  amount_is_profit: boolean
  allowed_next_status_ids: string[]
  allowed_prev_status_ids: string[]
}>

export type StageCurrent = {
  id: string
  is_initial: boolean
  conversion_type: ConversionType | null
  conversion_action: string | null
  requires_amount: boolean
}

export type StagePatchPlan =
  | {
      ok: true
      /** Поля для update (без is_initial — див. initial). */
      update: Record<string, unknown>
      /**
       * Що робити з is_initial:
       *  - 'set'   → скинути прапор у всіх інших і поставити тут;
       *  - 'unset' → зняти, але спершу переконатися, що є інша initial-стадія
       *              (caller рахує інші; якщо 0 і current.is_initial — помилка lastInitial);
       *  - 'keep'  → не чіпати.
       */
      initial: 'set' | 'unset' | 'keep'
    }
  | { ok: false; error: string }

/** Валідує PATCH-тіло стадії і будує update. Без I/O; порядок перевірок — як у роуті. */
export function planStagePatch(body: StagePatchBody, current: StageCurrent): StagePatchPlan {
  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const trimmed = body.name.trim()
    if (!trimmed || trimmed.length > 64) return { ok: false, error: STAGE_ERRORS.name }
    update.name = trimmed
  }

  if (body.color !== undefined) {
    if (!HEX_COLOR.test(body.color)) return { ok: false, error: STAGE_ERRORS.color }
    update.color = body.color
  }

  if (body.position !== undefined) {
    const p = Number(body.position)
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: STAGE_ERRORS.position }
    update.position = Math.floor(p)
  }

  if (body.conversion_action !== undefined) {
    const err = validateConversionAction(body.conversion_action)
    if (err) return { ok: false, error: err }
    const trimmed = typeof body.conversion_action === 'string' ? body.conversion_action.trim() : null
    update.conversion_action = trimmed || null
  }

  if (body.allowed_next_status_ids !== undefined) {
    if (!Array.isArray(body.allowed_next_status_ids)) return { ok: false, error: STAGE_ERRORS.nextIdsArray }
    if (!body.allowed_next_status_ids.every((v) => typeof v === 'string')) {
      return { ok: false, error: STAGE_ERRORS.nextIdsStrings }
    }
    update.allowed_next_status_ids = body.allowed_next_status_ids
  }

  if (body.allowed_prev_status_ids !== undefined) {
    if (!Array.isArray(body.allowed_prev_status_ids)) return { ok: false, error: STAGE_ERRORS.prevIdsArray }
    const cleaned: string[] = []
    const seen = new Set<string>()
    for (const v of body.allowed_prev_status_ids) {
      if (typeof v !== 'string' || !UUID_RE.test(v)) return { ok: false, error: STAGE_ERRORS.prevIdsUuid }
      if (!seen.has(v)) {
        seen.add(v)
        cleaned.push(v)
      }
    }
    update.allowed_prev_status_ids = cleaned
  }

  // conversion_type / is_final
  const effectiveConversionType =
    body.conversion_type !== undefined ? body.conversion_type : current.conversion_type

  if (body.conversion_type !== undefined) {
    if (body.conversion_type !== null && !isValidConversionType(body.conversion_type)) {
      return { ok: false, error: STAGE_ERRORS.conversionType }
    }
    update.conversion_type = body.conversion_type
    if (body.conversion_type !== null) {
      // Інваріант: conversion_type != null ⇒ is_final = true
      update.is_final = true
    } else if (body.is_final === undefined && current.conversion_type !== null) {
      update.is_final = false
    }
  }

  if (body.is_final !== undefined) {
    update.is_final = effectiveConversionType !== null ? true : !!body.is_final
  }

  // requires_amount / amount_is_profit
  const isAmountConversion = isAmountConversionType(effectiveConversionType)

  if (body.requires_amount !== undefined) {
    const wants = !!body.requires_amount
    if (wants && !isAmountConversion) return { ok: false, error: STAGE_ERRORS.requiresAmount }
    update.requires_amount = wants
    if (!wants) update.amount_is_profit = false
  } else if (!isAmountConversion && current.requires_amount) {
    update.requires_amount = false
    update.amount_is_profit = false
  }

  if (body.amount_is_profit !== undefined) {
    const wants = !!body.amount_is_profit
    const effectiveRequires =
      update.requires_amount !== undefined ? !!update.requires_amount : current.requires_amount
    if (wants && !effectiveRequires) return { ok: false, error: STAGE_ERRORS.amountIsProfit }
    update.amount_is_profit = wants
  }

  // conversion_action обов'язковий, якщо conversion_type != null
  if (effectiveConversionType !== null) {
    const effectiveAction =
      update.conversion_action !== undefined
        ? (update.conversion_action as string | null)
        : current.conversion_action
    if (!effectiveAction || effectiveAction.trim() === '') {
      return { ok: false, error: STAGE_ERRORS.conversionActionRequired }
    }
  }

  let initial: 'set' | 'unset' | 'keep' = 'keep'
  if (body.is_initial === true) initial = 'set'
  else if (body.is_initial === false) initial = 'unset'

  return { ok: true, update, initial }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export type StageCreateBody = {
  name?: string
  color?: string
  is_final?: boolean
  is_initial?: boolean
  conversion_type?: ConversionType | null
  conversion_action?: string | null
  requires_amount?: boolean
  amount_is_profit?: boolean
}

export type StageCreatePlan =
  | {
      ok: true
      values: {
        name: string
        color: string
        is_final: boolean
        is_initial: boolean
        conversion_type: ConversionType | null
        conversion_action: string | null
        requires_amount: boolean
        amount_is_profit: boolean
      }
    }
  | { ok: false; error: string }

/** Валідує тіло створення стадії. Порядок перевірок — як у роуті POST. */
export function planNewStage(body: StageCreateBody): StageCreatePlan {
  const name = (body.name ?? '').trim()
  const color = (body.color ?? '#6b7280').trim()

  if (!name || name.length > 64) return { ok: false, error: STAGE_ERRORS.name }
  if (!HEX_COLOR.test(color)) return { ok: false, error: STAGE_ERRORS.color }

  const conversionType: ConversionType | null =
    body.conversion_type === undefined || body.conversion_type === null ? null : body.conversion_type
  if (conversionType !== null && !isValidConversionType(conversionType)) {
    return { ok: false, error: STAGE_ERRORS.conversionType }
  }

  const conversionActionError = validateConversionAction(body.conversion_action)
  if (conversionActionError) return { ok: false, error: conversionActionError }
  const rawConversion = typeof body.conversion_action === 'string' ? body.conversion_action.trim() : null
  const conversionAction = rawConversion || null
  if (conversionType !== null && !conversionAction) {
    return { ok: false, error: STAGE_ERRORS.conversionActionRequired }
  }

  const requiresAmountRaw = !!body.requires_amount
  if (requiresAmountRaw && (conversionType === null || !isAmountConversionType(conversionType))) {
    return { ok: false, error: STAGE_ERRORS.requiresAmount }
  }
  const requiresAmount = requiresAmountRaw
  const amountIsProfit = requiresAmount ? !!body.amount_is_profit : false
  const isFinal = conversionType !== null ? true : !!body.is_final

  return {
    ok: true,
    values: {
      name,
      color,
      is_final: isFinal,
      is_initial: !!body.is_initial,
      conversion_type: conversionType,
      conversion_action: conversionAction,
      requires_amount: requiresAmount,
      amount_is_profit: amountIsProfit,
    },
  }
}
