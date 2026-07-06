// Чиста логіка для гейту: чи можна перевести лід на обраний статус.
// Використовується UI lead-detail щоб вирішити, чи треба показати попап
// для введення суми перед PATCH.

export type StatusDealType = 'deal_1' | 'deal_2'

export type StatusGateInput = {
  targetStatus: { deal_type: StatusDealType | null } | null | undefined
}

export type StatusGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'needs_amount_input'; dealType: StatusDealType }

export function evaluateStatusChange(input: StatusGateInput): StatusGateResult {
  const dt = input.targetStatus?.deal_type ?? null
  if (dt === null) return { allowed: true }
  return { allowed: false, reason: 'needs_amount_input', dealType: dt }
}

export const STATUS_GATE_MESSAGES = {
  needs_amount_input: 'Стадію не змінено: ціну не вказано',
} as const
