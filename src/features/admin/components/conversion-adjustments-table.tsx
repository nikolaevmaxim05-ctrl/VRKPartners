'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { RefreshCw, Send, ExternalLink } from 'lucide-react'
import { getServiceLabel } from '@/features/admin/lib/services'

type Adjustment = {
  id: string
  lead_id: string
  order_no: number
  conversion_action: string
  adjustment_type: 'retract' | 'restate'
  adjusted_value: number | null
  adjustment_currency: string | null
  adjustment_time: string
  export_status: 'pending' | 'exported'
  exported_at: string | null
  lead: {
    id: string
    name: string | null
    phone: string
    service: string | null
  } | null
}

export function ConversionAdjustmentsTable({ sheetUrl }: { sheetUrl?: string | null }) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [resending, setResending] = useState<string | null>(null)
  const [exportingAll, setExportingAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/conversion-adjustments?page=${page}`)
      const j = await res.json()
      setAdjustments(j.data ?? [])
      setTotalPages(j.totalPages ?? 1)
      setTotal(j.total ?? 0)
      setPendingTotal(j.pendingTotal ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  // C9: pending по ВСЕМ страницам (с сервера).
  const pendingCount = pendingTotal

  async function handleResend(adj: Adjustment) {
    setResending(adj.id)
    try {
      const res = await fetch(`/api/admin/conversion-adjustments/${adj.id}/resend`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.ok === false) {
        toast.error(j.message ?? `Помилка ${res.status}`)
        return
      }
      toast.success('Відправлено в таблицю корекцій')
      await load()
    } finally {
      setResending(null)
    }
  }

  async function handleExportAll() {
    setExportingAll(true)
    try {
      const res = await fetch('/api/admin/conversion-adjustments/export-pending', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.ok === false) {
        toast.error(j.error ?? j.message ?? `Помилка ${res.status}`)
        return
      }
      toast.success(
        `Вивантажено: ${j.sent}${j.failed ? `, з помилкою: ${j.failed}` : ''}`,
      )
      await load()
    } finally {
      setExportingAll(false)
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Оновити
        </Button>
        {pendingCount > 0 && (
          <Button size="sm" onClick={handleExportAll} disabled={exportingAll || loading}>
            <Send className={`h-4 w-4 mr-1.5 ${exportingAll ? 'animate-pulse' : ''}`} />
            Вивантажити всі очікують ({pendingCount})
          </Button>
        )}
        {sheetUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Відкрити таблицю корекцій
            </a>
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {total} корекцій · {pendingCount} очікують
        </span>
      </div>

      {!sheetUrl && (
        <p className="text-sm text-muted-foreground">
          Таблицю корекцій ще не підключено. Додайте{' '}
          <strong>Adjustments Spreadsheet ID</strong> у розділі{' '}
          <Link href="/admin/settings" className="underline">Налаштування → Google Sheets</Link>,
          щоб тут зʼявилося посилання.
        </p>
      )}

      {/* Таблица */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium w-24">Order ID</th>
              <th className="px-4 py-2 text-left font-medium">Лід</th>
              <th className="px-4 py-2 text-left font-medium w-28">Тип</th>
              <th className="px-4 py-2 text-left font-medium w-32">Conversion Name</th>
              <th className="px-4 py-2 text-left font-medium w-28">Сума</th>
              <th className="px-4 py-2 text-left font-medium w-40">Час корекції</th>
              <th className="px-4 py-2 text-left font-medium w-28">Статус</th>
              <th className="px-4 py-2 text-right font-medium w-20">Дії</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={8} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            )}
            {!loading && adjustments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Корекцій ще немає. Вони зʼявляються автоматично: RETRACT — коли вивантажену
                  конверсію відкликано (лід став нецільовим або конверсію замінено іншою),
                  RESTATE — коли змінилась сума тієї ж угоди.
                </td>
              </tr>
            )}
            {!loading && adjustments.map((adj) => (
              <tr key={adj.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">{adj.order_no}</td>
                <td className="px-4 py-3">
                  {adj.lead ? (
                    <Link
                      href={`/admin/leads/${adj.lead.id}`}
                      className="hover:underline font-medium"
                    >
                      {adj.lead.phone}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {adj.lead?.service && (
                    <div className="text-xs text-muted-foreground">
                      {getServiceLabel(adj.lead.service)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={adj.adjustment_type === 'retract' ? 'destructive' : 'default'}>
                    {adj.adjustment_type === 'retract' ? 'RETRACT' : 'RESTATE'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm">{adj.conversion_action}</td>
                <td className="px-4 py-3 text-sm">
                  {adj.adjusted_value != null
                    ? `${Number(adj.adjusted_value).toLocaleString('uk-UA')} ${adj.adjustment_currency ?? ''}`.trim()
                    : '—'
                  }
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatTime(adj.adjustment_time)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={adj.export_status === 'exported' ? 'secondary' : 'default'}>
                    {adj.export_status === 'exported' ? 'Експортовано' : 'Очікує'}
                  </Badge>
                  {adj.exported_at && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(adj.exported_at)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleResend(adj)}
                      disabled={resending === adj.id}
                      title="Перевідправити в таблицю корекцій"
                    >
                      {resending === adj.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <Send className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Сторінка {page} з {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Далі
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
