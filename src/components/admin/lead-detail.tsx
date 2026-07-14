'use client'

// Детальна сторінка лида: двоколонковий layout + smart status select + табы Чат/Нотатки/Журнал.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { uk } from 'date-fns/locale'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Pencil, RefreshCw, Save, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge } from './status-badge'
import { getServiceLabel } from '@/lib/services'
import { CopyContactLink } from '@/components/CopyContactLink'

// ── Типи ─────────────────────────────────────────────────────────────────────
type Status = {
  id: string
  name: string
  color: string
  is_final: boolean
  is_initial?: boolean
  conversion_type?: 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment' | null
  conversion_action?: string | null
  requires_amount?: boolean
  amount_is_profit?: boolean
  allowed_next_status_ids?: string[]
  allowed_prev_status_ids?: string[]
}

type Assignee = {
  id: string
  email: string
  name: string | null
  role: string | null
}

type Comment = {
  id: string
  user_id: string | null
  user_email: string | null
  type: 'comment' | 'note' | 'system'
  content: string
  created_at: string
}

type CustomField = {
  id: string
  name: string
  field_key: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options: string[] | null
  required: boolean
  position: number
  value: string | null
}

type HistoryRow = {
  id: string
  created_at: string
  status_id: string | null
}

type Lead = {
  id: string
  created_at: string
  name: string
  phone: string
  email: string | null
  service: string | null
  message: string | null
  status_id: string | null
  status: Status | null
  assigned_to: string | null
  assignee_email: string | null
  assignee_name: string | null
  deal_amount: number | null
  deal_profit: number | null
  is_repeat: boolean
  original_lead_id: string | null
  original: { id: string; name: string; phone: string; created_at: string } | null
  page_url: string | null
  source_url: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  fbclid: string | null
  ttclid: string | null
  ip_address: string | null
  user_agent: string | null
  call_source: string | null
  call_duration: number | null
  custom_fields: CustomField[]
  history: HistoryRow[]
}

// ── Утиліти ──────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  format(new Date(iso), 'd MMM yyyy, HH:mm', { locale: uk })

const fmtAmount = (v: number | null, currency = 'UAH') => {
  if (v == null) return '—'
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(Number(v))
}

// ── Компонент ────────────────────────────────────────────────────────────────
export function LeadDetail({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [statuses, setStatuses] = useState<Status[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<'not_found' | 'server_error' | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'notes' | 'journal'>('chat')
  const [pipelinesEnabled, setPipelinesEnabled] = useState(false)

  // Стан попапу для введення суми при зміні стадії з requires_amount = true
  type PendingStatusChange = {
    status_id: string
    conversion_type: 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment' | null
    amount_is_profit: boolean
    status_name: string
  } | null
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange>(null)
  const [amountInput, setAmountInput] = useState<string>('')

  // ── Завантаження
  const loadAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const [leadRes, statusesRes, assigneesRes, commentsRes] = await Promise.all([
        fetch(`/api/admin/leads/${leadId}`),
        fetch('/api/admin/lead-statuses'),
        fetch('/api/admin/assignees'),
        fetch(`/api/admin/leads/${leadId}/comments`),
      ])

      if (!leadRes.ok) {
        // 404 — лід не існує (видалено або неправильний id)
        // інші статуси — серверна помилка
        setFetchError(leadRes.status === 404 ? 'not_found' : 'server_error')
        return
      }

      const leadJson = await leadRes.json()
      const statusesJson = await statusesRes.json()
      const assigneesJson = await assigneesRes.json()
      const commentsJson = await commentsRes.json()

      setLead(leadJson.data)
      setStatuses(statusesJson.data ?? [])
      setPipelinesEnabled(!!statusesJson.pipelines_enabled)
      setAssignees(assigneesJson.data ?? [])
      setComments(commentsJson.data ?? [])
    } catch (e) {
      console.error(e)
      setFetchError('server_error')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── PATCH helper
  const patchLead = useCallback(
    async (body: Partial<{ status_id: string | null; assigned_to: string | null; deal_amount: number | null; deal_profit: number | null }>) => {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return false
      }
      const j = await res.json()
      setLead((prev) => (prev ? { ...prev, ...j.data } : prev))
      // Перезавантажуємо коментарі — там додалися system events
      fetch(`/api/admin/leads/${leadId}/comments`)
        .then((r) => r.json())
        .then((cj) => setComments(cj.data ?? []))
      toast.success('Збережено')
      return true
    },
    [leadId]
  )

  const onStatusChange = (newId: string) => {
    if (!lead || newId === lead.status_id) return
    const target = statuses.find((s) => s.id === newId)
    if (!target) return

    // Якщо requires_amount = false — PATCH одразу
    if (!target.requires_amount) {
      patchLead({ status_id: newId })
      return
    }

    // Інакше — відкриваємо попап для введення суми
    setPendingStatusChange({
      status_id: target.id,
      conversion_type: target.conversion_type ?? null,
      amount_is_profit: !!target.amount_is_profit,
      status_name: target.name,
    })
    // Підставляємо поточне значення відповідного поля з ліда як стартовий інпут
    const initial =
      target.conversion_type === 'deal_adjustment'
        ? (lead.deal_profit?.toString() ?? '')
        : (lead.deal_amount?.toString() ?? '')
    setAmountInput(initial)
  }

  // Юзер закрив без сабміту — тост + відкат селекта через форс-ре-рендер
  const onDialogCancel = () => {
    toast.error('Стадію не змінено: ціну не вказано')
    setPendingStatusChange(null)
    setAmountInput('')
    setLead((prev) => (prev ? { ...prev } : prev))
  }

  const onDialogSubmit = async () => {
    if (!pendingStatusChange) return
    const trimmed = amountInput.trim()
    const num = Number(trimmed)
    if (trimmed === '' || !Number.isFinite(num) || num < 0) {
      toast.error('Введіть коректну суму')
      return
    }
    const body: { status_id: string; deal_amount?: number; deal_profit?: number } = {
      status_id: pendingStatusChange.status_id,
    }
    if (pendingStatusChange.conversion_type === 'deal_adjustment') {
      body.deal_profit = num
    } else {
      body.deal_amount = num
    }
    const ok = await patchLead(body)
    if (ok) {
      setPendingStatusChange(null)
      setAmountInput('')
    }
  }

  const onAssigneeChange = (newId: string) => {
    if (!lead) return
    const value = newId === 'unassigned' ? null : newId
    if (value === lead.assigned_to) return
    patchLead({ assigned_to: value })
  }

  const filteredComments = useMemo(() => {
    const type = activeTab === 'chat' ? 'comment' : activeTab === 'notes' ? 'note' : 'system'
    return comments.filter((c) => c.type === type)
  }, [comments, activeTab])

  // Фільтруємо статуси для селектора відповідно до налаштувань воронки
  const visibleStatuses = useMemo(() => {
    if (!pipelinesEnabled) return statuses
    const current = statuses.find((s) => s.id === lead?.status_id)
    // Якщо ліду ще не призначено статус — показуємо всі, щоб менеджер міг обрати
    if (!current) return statuses
    const allowed = new Set<string>()
    allowed.add(current.id)
    for (const id of current.allowed_next_status_ids ?? []) allowed.add(id)
    for (const id of current.allowed_prev_status_ids ?? []) allowed.add(id)
    return statuses.filter((s) => allowed.has(s.id))
  }, [statuses, pipelinesEnabled, lead?.status_id])

  // К-сть повторних звернень — рахуємо system-комментарі, що починаються з [ПОВТОР]
  const repeatCount = useMemo(
    () => comments.filter((c) => c.type === 'system' && c.content.startsWith('[ПОВТОР]')).length,
    [comments]
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (fetchError || !lead) {
    const isNotFound = fetchError === 'not_found'
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <p className="text-lg font-medium text-foreground">
          {isNotFound ? 'Лід не знайдено' : 'Помилка завантаження'}
        </p>
        <p className="text-sm text-muted-foreground max-w-sm">
          {isNotFound
            ? 'Заявку з таким ID не існує або її було видалено.'
            : 'Не вдалося завантажити дані. Спробуйте ще раз або поверніться до списку.'}
        </p>
        <div className="flex items-center gap-3 mt-2">
          {!isNotFound && (
            <Button variant="outline" size="sm" onClick={loadAll}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Спробувати знову
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/leads">
              <ArrowLeft className="h-4 w-4 mr-1" /> До списку заявок
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Хедер сторінки */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/leads">
              <ArrowLeft className="h-4 w-4 mr-1" /> До списку
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(lead.id)
                toast.success('ID скопійовано')
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              title="Копіювати ID"
            >
              <span className="font-mono">ID: {lead.id}</span>
              <Copy className="h-3 w-3 shrink-0" />
            </button>
          </div>
          {lead.is_repeat && (
            <span className="inline-flex items-center gap-1 text-orange-600 text-sm font-medium">
              <RefreshCw className="h-4 w-4" /> Повторне звернення
            </span>
          )}
        </div>
        {lead.status && <StatusBadge name={lead.status.name} color={lead.status.color} />}
      </div>

      {/* Баннер повторного звернення.
          За поточною логікою дедупу (Блок 6, варіант А промпту) is_repeat=true
          ставиться НА ОРИГІНАЛ. Повторні звернення фіксуються system-комментарями
          [ПОВТОР] у lead_comments. Якщо ж лід має original_lead_id (зарезервоване
          поле на майбутнє) — показуємо посилання на першоджерело. */}
      {lead.is_repeat && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">
          <div className="font-medium text-orange-900">Повторні звернення</div>
          {lead.original ? (
            <div className="text-orange-800 mt-1">
              Перше звернення:{' '}
              <Link
                href={`/admin/leads/${lead.original.id}`}
                className="underline font-medium"
              >
                {lead.original.name} — {fmtDate(lead.original.created_at)}
              </Link>
            </div>
          ) : (
            <div className="text-orange-800 mt-1">
              Цей клієнт звертався повторно
              {repeatCount > 0 ? ` (${repeatCount} разів)` : ''}. Деталі — у вкладці{' '}
              <button
                type="button"
                className="underline font-medium"
                onClick={() => setActiveTab('journal')}
              >
                «Журнал»
              </button>
              .
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        {/* ── ЛІВА КОЛОНКА ─────────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Основні дані */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-base">Дані заявки</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Ім'я" value={lead.name} />
              <Field label="Телефон">
                <CopyContactLink value={lead.phone} type="phone" className="hover:underline">
                  {lead.phone}
                </CopyContactLink>
              </Field>
              <Field label="Email">
                {lead.email ? <CopyContactLink value={lead.email} type="email" className="hover:underline">{lead.email}</CopyContactLink> : '—'}
              </Field>
              <Field label="Послуга" value={getServiceLabel(lead.service)} />
              <Field label="Дата" value={fmtDate(lead.created_at)} />
              <Field label="IP" value={lead.ip_address ?? '—'} />
            </dl>
            {lead.message && (
              <div className="text-sm">
                <span className="text-muted-foreground">Повідомлення:</span>
                <p className="mt-1 whitespace-pre-wrap">{lead.message}</p>
              </div>
            )}
          </section>

          {/* Управління: збережена сума (read-only) → стадія → відповідальний.
              Сума вводиться через попап при виборі стадії з requires_amount = true. */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-base">Управління</h2>

            {(lead.deal_amount != null || lead.deal_profit != null) && (() => {
              // Лейбли залежать від amount_is_profit стадії, яка записала суму
              const dealStage = statuses.find((s) => s.conversion_type === 'deal')
              const adjustmentStage = statuses.find((s) => s.conversion_type === 'deal_adjustment')
              const dealIsProfit = !!dealStage?.amount_is_profit
              const adjustmentIsProfit = !!adjustmentStage?.amount_is_profit
              return (
                <div className="text-sm text-muted-foreground space-x-3">
                  {lead.deal_amount != null && (
                    <span>
                      {dealIsProfit ? 'Чистий прибуток' : 'Сума угоди'}:{' '}
                      <strong className="text-foreground">{fmtAmount(lead.deal_amount)}</strong>
                    </span>
                  )}
                  {lead.deal_profit != null && (
                    <span>
                      {adjustmentIsProfit ? 'Чистий прибуток (частина 2)' : 'Сума угоди (частина 2)'}:{' '}
                      <strong className="text-foreground">{fmtAmount(lead.deal_profit)}</strong>
                    </span>
                  )}
                </div>
              )
            })()}

            {/* Стадія + Відповідальний */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Стадія</label>
                <Select
                  value={lead.status_id ?? ''}
                  onValueChange={onStatusChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть стадію" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleStatuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span>{s.name}</span>
                          {s.conversion_type === 'deal' && s.requires_amount && (
                            <span
                              className="text-[11px] text-emerald-700"
                              title="Угода — потребує введення суми"
                            >
                              $
                            </span>
                          )}
                          {s.conversion_type === 'deal_adjustment' && s.requires_amount && (
                            <span
                              className="text-[11px] text-amber-700"
                              title="Корекція угоди (частина 2) — потребує введення суми"
                            >
                              $2
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Відповідальний</label>
                <Select
                  value={lead.assigned_to ?? 'unassigned'}
                  onValueChange={onAssigneeChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Не призначено" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Не призначено</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name ?? a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Кастомні поля — inline-редагування */}
          {lead.custom_fields.length > 0 && (
            <section className="rounded-lg border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-base">Додаткові поля</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {lead.custom_fields.map((f) => (
                  <CustomFieldRow
                    key={f.id}
                    leadId={leadId}
                    field={f}
                    onSaved={(fieldId, value) =>
                      setLead((prev) =>
                        prev
                          ? {
                              ...prev,
                              custom_fields: prev.custom_fields.map((cf) =>
                                cf.id === fieldId ? { ...cf, value } : cf
                              ),
                            }
                          : prev
                      )
                    }
                  />
                ))}
              </dl>
            </section>
          )}

          {/* Джерело */}
          <section className="rounded-lg border bg-card p-5 space-y-3">
            <h2 className="font-semibold text-base">Джерело</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Сторінка" value={lead.page_url ?? lead.source_url ?? '—'} truncate />
              <Field label="Referrer" value={lead.referrer ?? '—'} truncate />
              <Field label="UTM Source" value={lead.utm_source ?? '—'} />
              <Field label="UTM Medium" value={lead.utm_medium ?? '—'} />
              <Field label="UTM Campaign" value={lead.utm_campaign ?? '—'} />
              <Field label="UTM Term" value={lead.utm_term ?? '—'} />
              <Field label="UTM Content" value={lead.utm_content ?? '—'} />
              {lead.gclid
                ? <Field label="gclid" value={lead.gclid} truncate />
                : <Field label="gclid" value="—" />
              }
              {lead.call_source && <Field label="Call Source" value={lead.call_source} />}
              {lead.call_duration != null && <Field label="Тривалість" value={`${lead.call_duration} с`} />}
            </dl>
          </section>

          {/* Трекінг ID */}
          {(lead.gclid || lead.gbraid || lead.wbraid || lead.fbclid || lead.ttclid) && (
            <section className="rounded-lg border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-base">Трекінг ID</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {lead.gclid && <Field label="gclid" value={lead.gclid} truncate />}
                {lead.gbraid && <Field label="gbraid" value={lead.gbraid} truncate />}
                {lead.wbraid && <Field label="wbraid" value={lead.wbraid} truncate />}
                {lead.fbclid && <Field label="fbclid" value={lead.fbclid} truncate />}
                {lead.ttclid && <Field label="ttclid" value={lead.ttclid} truncate />}
              </dl>
            </section>
          )}

          {/* Історія повторних звернень (всі з тим самим phone) */}
          {lead.history.length > 1 && (
            <section className="rounded-lg border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-base">Історія звернень за телефоном</h2>
              <ul className="space-y-1.5 text-sm">
                {lead.history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between">
                    {h.id === lead.id ? (
                      <span className="font-medium">
                        {fmtDate(h.created_at)} <span className="text-muted-foreground">(поточний)</span>
                      </span>
                    ) : (
                      <Link href={`/admin/leads/${h.id}`} className="hover:underline">
                        {fmtDate(h.created_at)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── ПРАВА КОЛОНКА — Активність ──────────────────────────────────── */}
        <aside className="rounded-lg border bg-card flex flex-col h-fit lg:sticky lg:top-4">
          {/* Таб-меню */}
          <div className="flex border-b">
            <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>
              Чат
            </TabButton>
            <TabButton active={activeTab === 'notes'} onClick={() => setActiveTab('notes')}>
              Нотатки
            </TabButton>
            <TabButton active={activeTab === 'journal'} onClick={() => setActiveTab('journal')}>
              Журнал
            </TabButton>
          </div>

          <div className="p-4">
            <CommentsList items={filteredComments} />

            {activeTab !== 'journal' && (
              <>
                <Separator className="my-4" />
                <CommentForm
                  type={activeTab === 'chat' ? 'comment' : 'note'}
                  leadId={leadId}
                  onCreated={(c) => setComments((prev) => [...prev, c])}
                />
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Попап введення суми при переведенні у стадію з requires_amount = true */}
      <Dialog
        open={pendingStatusChange !== null}
        onOpenChange={(open) => {
          if (!open && pendingStatusChange !== null) {
            onDialogCancel()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingStatusChange?.conversion_type === 'deal_adjustment'
                ? 'Сума угоди — частина 2 (UAH)'
                : 'Сума угоди (UAH)'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Стадія «{pendingStatusChange?.status_name}» потребує введення суми перед збереженням.
            </p>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onDialogSubmit()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  onDialogCancel()
                }
              }}
            />
            {pendingStatusChange?.amount_is_profit && (
              <p className="text-xs text-muted-foreground">Це поле — чистий прибуток</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onDialogCancel}>
              Скасувати
            </Button>
            <Button onClick={onDialogSubmit}>
              <Save className="h-4 w-4 mr-1.5" /> Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Маленькі допоміжні компоненти ────────────────────────────────────────────
function Field({
  label,
  value,
  children,
  truncate = false,
}: {
  label: string
  value?: React.ReactNode
  children?: React.ReactNode
  truncate?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${truncate ? 'truncate' : ''}`}>{children ?? value}</dd>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

// Перетворює URL у тексті коментаря на клікабельні посилання.
// Використовується в «Журналі» — зокрема для рядка «Сторінка: …» у [ПОВТОР]-записах,
// щоб адмін міг одразу відкрити сторінку, з якої прийшло повторне звернення.
// React-елементи (без dangerouslySetInnerHTML), посилання відкриваються безпечно.
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all hover:text-foreground"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function CommentsList({ items }: { items: Comment[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Поки порожньо</p>
  }
  return (
    <ul className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
      {items.map((c) => (
        <li key={c.id} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {c.user_email ?? 'система'}
            </span>
            <time className="text-xs text-muted-foreground whitespace-nowrap">
              {fmtDate(c.created_at)}
            </time>
          </div>
          <div
            className={`mt-1 whitespace-pre-wrap rounded-md px-3 py-2 ${
              c.type === 'system'
                ? 'bg-muted text-muted-foreground italic'
                : c.type === 'note'
                  ? 'bg-amber-50 text-amber-900'
                  : 'bg-blue-50 text-blue-900'
            }`}
          >
            <Linkify text={c.content} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function CustomFieldRow({
  leadId,
  field,
  onSaved,
}: {
  leadId: string
  field: CustomField
  onSaved: (fieldId: string, value: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(field.value ?? '')
  const [saving, setSaving] = useState(false)

  // Синхронізація локального стану з пропом (на випадок зовнішніх оновлень)
  useEffect(() => {
    if (!editing) setValue(field.value ?? '')
  }, [field.value, editing])

  const startEdit = () => {
    setValue(field.value ?? '')
    setEditing(true)
  }

  const cancel = () => {
    setValue(field.value ?? '')
    setEditing(false)
  }

  const save = async () => {
    const next = value.trim() === '' ? null : value.trim()
    if (next === (field.value ?? null)) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/custom-fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_id: field.id, value: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка збереження')
        return
      }
      onSaved(field.id, next)
      setEditing(false)
      toast.success('Збережено')
    } catch {
      toast.error('Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  // Форматування для відображення
  const displayValue = (() => {
    if (field.value == null || field.value === '') return '—'
    if (field.type === 'date') {
      const d = new Date(field.value)
      if (!Number.isNaN(d.getTime())) {
        return format(d, 'd MMM yyyy', { locale: uk })
      }
    }
    if (field.type === 'boolean') {
      return field.value === 'true' ? 'Так' : 'Ні'
    }
    return field.value
  })()

  const renderInput = () => {
    const common = 'h-9'
    if (field.type === 'select') {
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className={common}>
            <SelectValue placeholder="Оберіть..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    if (field.type === 'boolean') {
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className={common}>
            <SelectValue placeholder="Оберіть..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Так</SelectItem>
            <SelectItem value="false">Ні</SelectItem>
          </SelectContent>
        </Select>
      )
    }
    if (field.type === 'date') {
      // Спільний українізований календар (а не нативний, що був російською)
      return <DatePicker value={value} onChange={setValue} className={common} />
    }
    return (
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={common}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
      />
    )
  }

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground flex items-center justify-between gap-2">
        <span>{field.name}</span>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Редагувати"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </dt>
      <dd className="text-sm mt-0.5">
        {editing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 min-w-0">{renderInput()}</div>
            <Button size="sm" onClick={save} disabled={saving} className="h-9 px-2.5">
              <Save className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancel}
              disabled={saving}
              className="h-9 px-2.5"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="text-left hover:text-foreground transition-colors w-full truncate"
            title="Клікніть, щоб редагувати"
          >
            {displayValue}
          </button>
        )}
      </dd>
    </div>
  )
}

function CommentForm({
  type,
  leadId,
  onCreated,
}: {
  type: 'comment' | 'note'
  leadId: string
  onCreated: (c: Comment) => void
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const content = value.trim()
    if (!content) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка')
        return
      }
      const j = await res.json()
      onCreated(j.data)
      setValue('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={type === 'note' ? 'Внутрішня нотатка...' : 'Написати коментар...'}
        rows={type === 'note' ? 5 : 3}
        onKeyDown={(e) => {
          if (type === 'comment' && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={!value.trim() || submitting}>
          {type === 'note' ? (
            <><Save className="h-4 w-4 mr-1.5" /> Зберегти нотатку</>
          ) : (
            <><Send className="h-4 w-4 mr-1.5" /> Відправити</>
          )}
        </Button>
      </div>
    </div>
  )
}
