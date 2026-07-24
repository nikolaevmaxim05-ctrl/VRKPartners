'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Send, ExternalLink } from 'lucide-react'
import { getServiceLabel } from '@/lib/services'

type Conversion = {
  id: string
  lead_id: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  conversion_action: string
  conversion_value: number | null
  conversion_currency: string
  conversion_time: string
  export_status: 'pending' | 'exported'
  exported_at: string | null
  lead: {
    id: string
    name: string | null
    phone: string
    service: string | null
  } | null
}

export function ConversionsTable({ sheetUrl }: { sheetUrl?: string | null }) {
  const [conversions, setConversions] = useState<Conversion[]>([])
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
      const res = await fetch(`/api/admin/conversions?page=${page}`)
      const j = await res.json()
      setConversions(j.data ?? [])
      setTotalPages(j.totalPages ?? 1)
      setTotal(j.total ?? 0)
      setPendingTotal(j.pendingTotal ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  // C9: pending рахуємо по ВСІХ сторінках (з сервера), а не по поточній.
  const pendingCount = pendingTotal

  async function handleResend(conv: Conversion) {
    setResending(conv.id)
    try {
      const res = await fetch(`/api/admin/conversions/${conv.id}/resend`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.ok === false) {
        toast.error(j.message ?? `Помилка ${res.status}`)
        return
      }
      toast.success('Відправлено в Sheets')
      await load() // оновлюємо статус → «Експортовано»
    } finally {
      setResending(null)
    }
  }

  async function handleExportAll() {
    setExportingAll(true)
    try {
      const res = await fetch('/api/admin/conversions/export-pending', { method: 'POST' })
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

  function clickId(conv: Conversion): { label: string; value: string } | null {
    if (conv.gclid) return { label: 'GCLID', value: conv.gclid }
    if (conv.wbraid) return { label: 'WBRAID', value: conv.wbraid }
    if (conv.gbraid) return { label: 'GBRAID', value: conv.gbraid }
    return null
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
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
        >
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
              Відкрити таблицю Google Sheets
            </a>
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {total} конверсій · {pendingCount} очікують
        </span>
      </div>

      {!sheetUrl && (
        <p className="text-sm text-muted-foreground">
          Таблицю Google Sheets ще не підключено. Додайте <strong>Spreadsheet ID</strong> у розділі{' '}
          <Link href="/admin/integrations" className="underline">Інтеграції</Link>, щоб тут зʼявилося посилання.
        </p>
      )}

      {/* Таблиця */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium">Лід</th>
              <th className="px-4 py-2 text-left font-medium w-48">Click ID</th>
              <th className="px-4 py-2 text-left font-medium w-32">Дія</th>
              <th className="px-4 py-2 text-left font-medium w-28">Сума</th>
              <th className="px-4 py-2 text-left font-medium w-40">Час конверсії</th>
              <th className="px-4 py-2 text-left font-medium w-28">Статус</th>
              <th className="px-4 py-2 text-right font-medium w-20">Дії</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={7} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            )}
            {!loading && conversions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Конверсій ще немає. Переведіть лід з Google click ID у фінальний статус —
                  запис з'явиться автоматично.
                </td>
              </tr>
            )}
            {!loading && conversions.map((conv) => {
              const cid = clickId(conv)
              return (
                <tr key={conv.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    {conv.lead ? (
                      <Link
                        href={`/admin/leads/${conv.lead.id}`}
                        className="hover:underline font-medium"
                      >
                        {conv.lead.phone}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {conv.lead?.service && (
                      <div className="text-xs text-muted-foreground">
                        {getServiceLabel(conv.lead.service)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {cid ? (
                      <div className="space-y-0.5">
                        <span className="text-xs font-medium text-muted-foreground">{cid.label}</span>
                        <div className="font-mono text-xs truncate max-w-[180px]" title={cid.value}>
                          {cid.value}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{conv.conversion_action}</td>
                  <td className="px-4 py-3 text-sm">
                    {conv.conversion_value != null
                      ? `${Number(conv.conversion_value).toLocaleString('uk-UA')} ${conv.conversion_currency}`
                      : '—'
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatTime(conv.conversion_time)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={conv.export_status === 'exported' ? 'secondary' : 'default'}>
                      {conv.export_status === 'exported' ? 'Експортовано' : 'Очікує'}
                    </Badge>
                    {conv.exported_at && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatTime(conv.exported_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleResend(conv)}
                        disabled={resending === conv.id}
                        title="Перевідправити в Sheets"
                      >
                        {resending === conv.id
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Send className="h-3.5 w-3.5" />
                        }
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Пагінація */}
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
