// core/domain/lead/message — текст заявки: коментар + мітка форми одним блоком; honeypot.
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

/** Чи заповнив бот honeypot-поле `company` (перевіряється ПІСЛЯ Zod, на розібраних даних). */
export function isHoneypotFilled(lead: Pick<LeadInput, 'company'>): boolean {
  return typeof lead.company === 'string' && lead.company.length > 0
}
