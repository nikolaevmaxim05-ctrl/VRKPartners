'use client'

// Таблица журнала действий (audit_log): дата, пользователь, действие, ресурс, IP; детали (old/new) —
// разворачиваются по клику. Пагинация серверная (GET /api/admin/audit-log?page=).
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

type AuditRow = {
  id: string
  created_at: string
  user_id: string | null
  user_email: string | null
  action: string
  resource: string
  old_value: unknown
  new_value: unknown
  ip_address: string | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'medium' })
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  return <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
}

export function AuditLogTable() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/audit-log?page=${page}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `Помилка ${res.status}`)
      setRows(j.data ?? [])
      setTotalPages(j.totalPages ?? 1)
      setTotal(j.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    load()
  }, [load])

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Усього записів: {total}</span>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          Оновити
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2">Коли</th>
              <th className="px-3 py-2">Хто</th>
              <th className="px-3 py-2">Дія</th>
              <th className="px-3 py-2">Ресурс</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Записів поки немає.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isOpen = !!open[r.id]
              return (
                <RowGroup key={r.id} row={r} isOpen={isOpen} onToggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} />
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Назад
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Далі
          </Button>
        </div>
      )}
    </div>
  )
}

function RowGroup({ row, isOpen, onToggle }: { row: AuditRow; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t hover:bg-muted/30">
        <td className="px-2 py-2">
          <button type="button" onClick={onToggle} className="rounded p-1 hover:bg-muted" aria-label={isOpen ? 'Згорнути' : 'Деталі'} aria-expanded={isOpen}>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(row.created_at)}</td>
        <td className="px-3 py-2">{row.user_email ?? <span className="text-muted-foreground">система</span>}</td>
        <td className="px-3 py-2">
          <Badge variant="secondary" className="font-mono text-xs">{row.action}</Badge>
        </td>
        <td className="px-3 py-2 font-mono text-xs">{row.resource}</td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.ip_address ?? '—'}</td>
      </tr>
      {isOpen && (
        <tr className="border-t bg-muted/20">
          <td />
          <td colSpan={5} className="px-3 py-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Було</p>
                <Json value={row.old_value} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Стало</p>
                <Json value={row.new_value} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
