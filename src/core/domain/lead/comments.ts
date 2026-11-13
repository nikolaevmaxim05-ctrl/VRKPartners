// core/domain/lead/comments — правила комментариев лида.
export const COMMENT_TYPES = ['comment', 'note', 'system'] as const
export type CommentTypeName = (typeof COMMENT_TYPES)[number]

export function isCommentType(v: unknown): v is CommentTypeName {
  return typeof v === 'string' && (COMMENT_TYPES as readonly string[]).includes(v)
}

/** Новый комментарий от пользователя: только comment/note (system пишет сервер), 1..4000 символов. */
export function validateNewComment(body: { type?: string; content?: string }):
  | { ok: true; type: 'comment' | 'note'; content: string }
  | { ok: false; message: string } {
  const type = (body.type ?? 'comment') as CommentTypeName
  const content = (body.content ?? '').trim()
  if (!isCommentType(type) || type === 'system') return { ok: false, message: 'Невалідний тип' }
  if (!content) return { ok: false, message: 'Порожній коментар' }
  if (content.length > 4000) return { ok: false, message: 'Занадто довгий коментар' }
  return { ok: true, type, content }
}
