// core/domain/lead/message — текст заявки: комментарий + метка формы одним блоком; honeypot.
import type { LeadInput } from './schema'

export function buildLeadMessage(lead: Pick<LeadInput, 'comment' | 'source'>): string | null {
  const lines: string[] = []
  if (lead.comment) lines.push(lead.comment)
  if (lead.source) {
    if (lines.length > 0) lines.push('—')
    lines.push(`Форма: ${lead.source}`)
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/** Заполнил ли бот honeypot-поле `company` (проверяется ПОСЛЕ Zod, на разобранных данных). */
export function isHoneypotFilled(lead: Pick<LeadInput, 'company'>): boolean {
  return typeof lead.company === 'string' && lead.company.length > 0
}
