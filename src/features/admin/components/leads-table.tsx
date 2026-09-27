'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { uk } from 'date-fns/locale'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import { Handshake, RefreshCw, Search, Trash2, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog'
import { Skeleton } from '@/shared/ui/skeleton'
import { DatePicker } from '@/shared/ui/date-picker'
import { CopyContactLink } from '@/shared/ui/copy-contact-link'
import { toast } from 'sonner'
import { StatusBadge } from './status-badge'
import { getServiceLabel, SERVICE_OPTIONS } from '@/features/admin/lib/services'
import { createClient } from '@infra/supabase/client'

type Status = {
  id: string
  name: string
  color: string
  is_final: boolean
}

type Assignee = {
  id: string
  email: string
  name: string | null
  role: string | null
}

type Lead = {
  id: string
  created_at: string
  name: string
  phone: string
  email: string | null
  service: string | null
  utm_source: string | null
  is_repeat: boolean
  assigned_to: string | null
  referral_code: string | null
  referral_link: ReferralRef | null
  assignee_email: string | null
  assignee_name: string | null
  status: Status | null
}

type ReferralRef = { id: string; name: string; code: string; is_active: boolean }

/**
 * Позначка партнера в таблиці (відхилення 11, рішення 12): 'badge' — у клітинці «Джерело»,
 * 'column' — окрема колонка «Партнер», 'both' — обидва (превʼю для власника).
 */
const PARTNER_MARK: 'badge' | 'column' | 'both' = 'both'

/** Бейдж партнера: активне посилання — назва; лише код — «реф. код» (не знайдено/вимкнене на момент заявки). */
function PartnerBadge({ lead }: { lead: Pick<Lead, 'referral_code' | 'referral_link'> }) {
  if (lead.referral_link) {
    return (
      <Badge variant="secondary" className="gap-1 font-normal" title={`Реферальне посилання: ${lead.referral_link.code}`}>
        <Handshake className="h-3 w-3" /> {lead.referral_link.name}
      </Badge>
    )
  }
  if (lead.referral_code) {
    return (
      <Badge variant="outline" className="font-mono text-xs text-muted-foreground" title="Посилання не знайдено або вимкнене на момент заявки">
        реф. {lead.referral_code}
      </Badge>
    )
  }
  return null
}

type ApiResponse = {
  data: Lead[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const UTM_SOURCE_OPTIONS = [
  'google',
  'facebook',
  'instagram',
  'tiktok',
  'organic',
  'direct',
]

// UTM-мітки, за якими можна фільтрувати (крім utm_source — він окремим селектом «Джерело»).
// Значення довільні (задаються в URL), тож фільтр — текстове поле (ilike, частковий збіг).
const UTM_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'utm_campaign', label: 'Кампанія (utm_campaign)' },
  { value: 'utm_medium', label: 'Канал (utm_medium)' },
  { value: 'utm_term', label: 'Ключове слово (utm_term)' },
  { value: 'utm_content', label: 'Контент (utm_content)' },
]

// Ключ для збереження стану списку (сторінка + позиція скролу) між переходами
// «список → лід → назад». У sessionStorage лежать ЛИШЕ номер сторінки і scrollY — без PII.
const LIST_STATE_KEY = 'admin-leads-list-state'

export function LeadsTable({ canDelete = false }: { canDelete?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const pendingScrollRef = useRef<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Довідники
  const [statuses, setStatuses] = useState<Status[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [referralLinks, setReferralLinks] = useState<ReferralRef[]>([])

  // Фільтри
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [service, setService] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [utmField, setUtmField] = useState('utm_campaign')
  const [utmValue, setUtmValue] = useState('')
  const [utmValueInput, setUtmValueInput] = useState('')
  const [statusId, setStatusId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  // Початкове значення — з URL (посилання «Заявки →» з розділу «Реферальні посилання»).
  const [referralLinkId, setReferralLinkId] = useState(() => searchParams.get('referral_link_id') ?? '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Відновлення стану списку при поверненні з картки ліда: читаємо збережену
  // сторінку + scrollY, прибираємо запис (щоб «свіжий» захід з меню починався
  // з 1-ї сторінки зверху) і лише після цього дозволяємо перший fetch (hydrated).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIST_STATE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { page?: number; scrollY?: number }
        if (saved?.page && saved.page > 0) setPage(saved.page)
        if (typeof saved?.scrollY === 'number') pendingScrollRef.current = saved.scrollY
      }
      sessionStorage.removeItem(LIST_STATE_KEY)
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  // Завантажуємо довідники один раз
  useEffect(() => {
    fetch('/api/admin/lead-statuses')
      .then((r) => r.json())
      .then((j) => setStatuses(j.data ?? []))
      .catch(() => setStatuses([]))
    fetch('/api/admin/assignees')
      .then((r) => r.json())
      .then((j) => setAssignees(j.data ?? []))
      .catch(() => setAssignees([]))
    fetch('/api/admin/referral-links')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setReferralLinks(j.data ?? []))
      .catch(() => setReferralLinks([]))
  }, [])

  const fetchLeads = useCallback(async (opts?: { silent?: boolean }) => {
    // silent — фоновое оновлення (авто-опитування): без скелетона, без миготіння
    if (!opts?.silent) setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
        ...(service && service !== 'all' && { service }),
        ...(utmSource && utmSource !== 'all' && { utm_source: utmSource }),
        ...(utmValue && { utm_field: utmField, utm_value: utmValue }),
        ...(statusId && statusId !== 'all' && { status_id: statusId }),
        ...(assignedTo && assignedTo !== 'all' && { assigned_to: assignedTo }),
        ...(referralLinkId && referralLinkId !== 'all' && { referral_link_id: referralLinkId }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      })
      const res = await fetch(`/api/admin/leads?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json: ApiResponse = await res.json()
      setData(json.data)
      setTotal(json.total)
      setTotalPages(json.totalPages)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, search, service, utmSource, utmField, utmValue, statusId, assignedTo, referralLinkId, dateFrom, dateTo])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Помилка видалення')
        return
      }
      // Оновити список після видалення
      await fetchLeads()
      toast.success('Заявку видалено')
    } finally {
      setDeletingId(null)
    }
  }, [fetchLeads])

  useEffect(() => {
    // Чекаємо, поки відновимо збережену сторінку, щоб не робити зайвий fetch 1-ї сторінки.
    if (!hydrated) return
    fetchLeads()
  }, [fetchLeads, hydrated])

  // Відновлюємо позицію скролу після того, як перелік відмалювався (один раз).
  useEffect(() => {
    if (loading) return
    if (pendingScrollRef.current == null) return
    const y = pendingScrollRef.current
    pendingScrollRef.current = null
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [loading, data])

  // Авто-оновлення списку: нові заявки зʼявляються самі, без ручного оновлення.
  // Тихий рефетч кожні 30с (поки вкладка активна) + миттєвий рефетч при поверненні
  // на вкладку. Завжди викликаємо АКТУАЛЬНИЙ fetchLeads через ref (не пере-підписуємось).
  const fetchRef = useRef(fetchLeads)
  useEffect(() => {
    fetchRef.current = fetchLeads
  }, [fetchLeads])

  // 1) Supabase Realtime — миттєве оновлення (доля секунди) при INSERT/UPDATE/DELETE leads.
  //    Потребує таблиці leads у публікації supabase_realtime (міграція 017). RLS вже дозволяє
  //    authenticated SELECT, тож події доставляються залогіненому адміну.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchRef.current({ silent: true })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // 2) Підстраховка: тихий опит раз на 30с (якщо realtime недоступний/відвалився) +
  //    миттєвий рефетч при поверненні на вкладку.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      fetchRef.current({ silent: true })
    }
    const interval = setInterval(tick, 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchRef.current({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Скидання сторінки при зміні фільтрів.
  // Пропускаємо перший прогін (монтування), щоб не затерти відновлену сторінку.
  const filtersInitialized = useRef(false)
  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true
      return
    }
    setPage(1)
  }, [search, service, utmSource, utmField, utmValue, statusId, assignedTo, referralLinkId, dateFrom, dateTo])

  // Автопошук з дебаунсом: search завжди синхронізований з полем вводу.
  // Завдяки цьому очищення поля коректно скидає пошук (немає «залиплого» search,
  // який раніше ламав інші фільтри — показувало 0 заявок).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Автофільтр за значенням UTM-мітки (теж з дебаунсом).
  useEffect(() => {
    const t = setTimeout(() => setUtmValue(utmValueInput.trim()), 350)
    return () => clearTimeout(t)
  }, [utmValueInput])

  function clearFilters() {
    setSearch('')
    setSearchInput('')
    setService('')
    setUtmSource('')
    setUtmField('utm_campaign')
    setUtmValue('')
    setUtmValueInput('')
    setStatusId('')
    setAssignedTo('')
    setReferralLinkId('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const hasFilters = Boolean(
    search || service || utmSource || utmValue || statusId || assignedTo || referralLinkId || dateFrom || dateTo
  )

  const columns: ColumnDef<Lead>[] = [
    {
      accessorKey: 'created_at',
      header: 'Дата',
      cell: ({ getValue }) =>
        format(new Date(getValue() as string), 'd MMM, HH:mm', { locale: uk }),
    },
    {
      accessorKey: 'name',
      header: "Ім'я",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          {row.original.is_repeat && (
            <RefreshCw className="h-3.5 w-3.5 text-orange-500" aria-label="Повторне звернення" />
          )}
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Телефон',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-muted-foreground">—</span>
        // stopPropagation: клік по телефону копіює + tel:, але НЕ відкриває картку ліда.
        return (
          <CopyContactLink
            value={v}
            type="phone"
            onClick={(e) => e.stopPropagation()}
            className="hover:underline [font-variant-numeric:tabular-nums]"
          >
            {v}
          </CopyContactLink>
        )
      },
    },
    {
      accessorKey: 'service',
      header: 'Послуга',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v
          ? <Badge variant="secondary">{getServiceLabel(v)}</Badge>
          : <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: 'status',
      header: 'Статус',
      cell: ({ row }) => {
        const s = row.original.status
        return s
          ? <StatusBadge name={s.name} color={s.color} />
          : <span className="text-muted-foreground text-xs">—</span>
      },
    },
    {
      id: 'assignee',
      header: 'Відповідальний',
      cell: ({ row }) => {
        const r = row.original
        const label = r.assignee_name ?? r.assignee_email
        return label
          ? <span className="text-sm">{label}</span>
          : <span className="text-muted-foreground text-xs">не призначено</span>
      },
    },
    {
      accessorKey: 'utm_source',
      header: 'Джерело',
      cell: ({ getValue, row }) => {
        const v = getValue() as string | null
        return (
          <div className="flex flex-wrap items-center gap-1">
            {v ? <Badge variant="outline">{v}</Badge> : <span className="text-muted-foreground">direct</span>}
            {PARTNER_MARK !== 'column' && <PartnerBadge lead={row.original} />}
          </div>
        )
      },
    },
    ...(PARTNER_MARK !== 'badge'
      ? [{
          id: 'partner',
          header: 'Партнер',
          cell: ({ row }: { row: { original: Lead } }) =>
            row.original.referral_link || row.original.referral_code ? <PartnerBadge lead={row.original} /> : <span className="text-muted-foreground text-xs">—</span>,
        } satisfies ColumnDef<Lead>]
      : []),
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const lead = row.original
        if (!canDelete) return null
        return (
          <div onClick={(e) => e.stopPropagation()}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                disabled={deletingId === lead.id}
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Видалити заявку?</AlertDialogTitle>
                <AlertDialogDescription>
                  Заявку від <strong>{lead.name}</strong> ({lead.phone}) буде видалено
                  назавжди. Цю дію неможливо скасувати.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Скасувати</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => { e.stopPropagation(); handleDelete(lead.id) }}
                >
                  Видалити
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="space-y-4">
      {/* Фільтри */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Пошук за іменем або телефоном..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-64 pl-8"
          />
        </div>

        <Select value={statusId} onValueChange={setStatusId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Всі статуси" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі статуси</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Відповідальний" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі відповідальні</SelectItem>
            <SelectItem value="unassigned">Не призначено</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name ?? a.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={referralLinkId} onValueChange={setReferralLinkId}>
          <SelectTrigger className="w-48" aria-label="Реферальне посилання">
            <SelectValue placeholder="Реф. посилання" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі партнери</SelectItem>
            <SelectItem value="none">Без посилання</SelectItem>
            {referralLinks.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}{l.is_active ? '' : ' (вимкнене)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Всі послуги" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі послуги</SelectItem>
            {SERVICE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={utmSource} onValueChange={setUtmSource}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Джерело" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі джерела</SelectItem>
            {UTM_SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Фільтр за UTM-міткою: поле + значення (частковий збіг, автопошук) */}
        <div className="flex gap-2">
          <Select value={utmField} onValueChange={setUtmField}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="UTM-мітка" />
            </SelectTrigger>
            <SelectContent>
              {UTM_FIELD_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Значення UTM..."
            value={utmValueInput}
            onChange={(e) => setUtmValueInput(e.target.value)}
            className="w-44"
          />
        </div>

        <div className="flex gap-2 items-center">
          <DatePicker value={dateFrom} onChange={setDateFrom} ariaLabel="Дата від" />
          <span className="text-muted-foreground text-sm">—</span>
          <DatePicker value={dateTo} onChange={setDateTo} ariaLabel="Дата до" />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" /> Скинути
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{total} заявок</span>
        </div>
      </div>

      {/* Таблиця */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skel-${i}`}>
                  {columns.map((_, j) => (
                    <TableCell key={`skel-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-10 text-muted-foreground">
                  Заявок не знайдено
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.original.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    // Запамʼятовуємо сторінку та позицію скролу, щоб повернутися сюди ж.
                    try {
                      sessionStorage.setItem(
                        LIST_STATE_KEY,
                        JSON.stringify({ page, scrollY: window.scrollY })
                      )
                    } catch {
                      /* ignore */
                    }
                    router.push(`/admin/leads/${row.original.id}`)
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Пагінація */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            ← Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            Сторінка {page} з {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Далі →
          </Button>
        </div>
      )}
    </div>
  )
}
