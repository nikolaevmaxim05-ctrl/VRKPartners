// core/domain/lead/message — текст заявки: коментар + додаткові поля форми одним блоком.
import type { LeadInput } from './schema'

export function buildLeadMessage(lead: LeadInput): string | null {
  const lines: string[] = []
  if (lead.comment) lines.push(lead.comment)
  const extras: Array<[string, string | undefined]> = [
    ['Сайт / ніша', lead.website || undefined],
    ['Формат реклами', lead.adFormat || undefined],
    ['Бюджет', lead.budget || undefined],
    ['Ціль', lead.goal || undefined],
    ['Форма', lead.source || undefined],
  ]
  const extraLines = extras
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([label, value]) => `${label}: ${value}`)
  if (extraLines.length > 0) {
    if (lines.length > 0) lines.push('—')
    lines.push(...extraLines)
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/** Чи заповнив бот honeypot-поле `company` (перевірка до Zod — на сирому тілі). */
export function isHoneypotFilled(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === 'object' &&
    'company' in body &&
    typeof (body as Record<string, unknown>).company === 'string' &&
    ((body as Record<string, unknown>).company as string).length > 0
  )
}
