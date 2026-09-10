// core/application/paging — розбір page/limit із query (як у роутах списків).
export function parsePaging(
  get: (key: string) => string | null,
  defaultLimit: number,
): { page: number; limit: number } {
  const page = Math.max(1, parseInt(get('page') ?? '1') || 1)
  const limit = Math.min(100, Math.max(1, parseInt(get('limit') ?? String(defaultLimit)) || defaultLimit))
  return { page, limit }
}

export function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) }
}
