'use client'

// Раздел «Реферальні посилання»: список ссылок партнёров (URL с кнопкой копирования, переключатель,
// статистика заявок, переименование, удаление с подтверждением) + диалог создания.
// Код генерирует сервер, и после создания он неизменен (решение владельца 5). URL — из siteUrl
// (NEXT_PUBLIC_SITE_URL), не из window.location: превью на localhost показывает прод-адрес.

import { useEffect, useState } from 'react'
import { useInvalidateDictionaries } from '@/features/admin/lib/dictionary-cache'
import Link from 'next/link'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { Badge } from '@/shared/ui/badge'
import { Switch } from '@/shared/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Plus, Trash2, Loader2, Copy, Check, Pencil, ArrowRight } from 'lucide-react'
import { siteUrl } from '@/shared/config/site'
import { copyText } from '@/shared/lib/copy-to-clipboard'
import { buildReferralUrl } from '@core/domain/referral/code'
import { REF_NAME_MAX, REF_NOTES_MAX, type ReferralLink, type ReferralLinkStats } from '@core/domain/referral/link-rules'

type FormState = { name: string; notes: string }
const EMPTY_FORM: FormState = { name: '', notes: '' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new Error(json.error || 'Помилка запиту')
  return json
}

/** Поле URL с кнопкой «Копіювати». */
function CopyUrl({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={url}>{url}</code>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 px-2"
        aria-label={`Копіювати посилання ${name}`}
        onClick={async () => {
          const ok = await copyText(url)
          setCopied(ok)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="ml-1">{copied ? 'Скопійовано' : 'Копіювати'}</span>
      </Button>
    </div>
  )
}

export function ReferralLinksSection() {
  // Названия партнёров — справочник в фильтрах заявок/аналитики: сбрасываем клиентский кэш при входе/выходе.
  useInvalidateDictionaries()
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [stats, setStats] = useState<Record<string, ReferralLinkStats>>({})
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ReferralLink | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ data: ReferralLink[] }>('/api/admin/referral-links?full=1'),
      api<{ data: ReferralLinkStats[]; truncated: boolean }>('/api/admin/referral-links/stats'),
    ])
      .then(([l, s]) => {
        if (!alive) return
        setLinks(l.data)
        setStats(Object.fromEntries(s.data.map((x) => [x.link_id, x])))
        setTruncated(s.truncated)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Помилка завантаження'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data } = await api<{ data: ReferralLink }>('/api/admin/referral-links', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), notes: form.notes.trim() || null }),
      })
      setLinks((prev) => [data, ...prev])
      setForm(EMPTY_FORM)
      setCreateOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(link: ReferralLink, isActive: boolean) {
    setToggling((t) => ({ ...t, [link.id]: true }))
    setError(null)
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: isActive } : l)))
    try {
      await api(`/api/admin/referral-links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) })
    } catch (e) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: !isActive } : l)))
      setError(e instanceof Error ? e.message : 'Помилка оновлення')
    } finally {
      setToggling((t) => ({ ...t, [link.id]: false }))
    }
  }

  async function handleEditSave() {
    if (!editing || !editForm.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data } = await api<{ data: ReferralLink }>(`/api/admin/referral-links/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editForm.name.trim(), notes: editForm.notes.trim() || null }),
      })
      setLinks((prev) => prev.map((l) => (l.id === data.id ? data : l)))
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setError(null)
    try {
      await api(`/api/admin/referral-links/${deleteId}`, { method: 'DELETE' })
      setLinks((prev) => prev.filter((l) => l.id !== deleteId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка видалення')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const deleteTarget = links.find((l) => l.id === deleteId)
  const deleteTargetLeads = deleteTarget ? (stats[deleteTarget.id]?.total ?? 0) : 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-lg">Посилання партнерів</CardTitle>
          <CardDescription>
            Дайте партнеру його посилання. Код у посиланні випадковий і не змінюється; назву можна перейменувати.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Нове посилання
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {truncated && (
          <p className="text-xs text-muted-foreground">Статистика порахована по перших 10 000 заявок з посиланнями.</p>
        )}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Завантаження...</span>
          </div>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Посилань поки немає. Створіть перше — «Нове посилання».</p>
        ) : (
          <ul className="space-y-3">
            {links.map((link) => {
              const s = stats[link.id]
              const url = buildReferralUrl(siteUrl, link.code)
              return (
                <li key={link.id} className="rounded-md border px-4 py-3" data-referral-link={link.code}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{link.name}</span>
                        {!link.is_active && <Badge variant="secondary">Вимкнене</Badge>}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Перейменувати ${link.name}`}
                          title="Перейменувати"
                          onClick={() => {
                            setEditing(link)
                            setEditForm({ name: link.name, notes: link.notes ?? '' })
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <CopyUrl url={url} name={link.name} />
                      {link.notes && <p className="text-xs text-muted-foreground">{link.notes}</p>}
                      <p className="text-xs text-muted-foreground">
                        Заявок: {s?.total ?? 0} · за 30 днів: {s?.last30 ?? 0} · остання: {formatDate(s?.last_at ?? null)}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <Link href={`/admin/leads?referral_link_id=${link.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          Заявки <ArrowRight className="h-3 w-3" />
                        </Link>
                        <Link href={`/admin/analytics?referral_link_id=${link.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          Аналітика <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${link.id}`} className="text-xs text-muted-foreground">Активне</Label>
                      <Switch
                        id={`active-${link.id}`}
                        checked={link.is_active}
                        disabled={!!toggling[link.id]}
                        onCheckedChange={(checked) => handleToggle(link, checked)}
                        aria-label={`Активне: ${link.name}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(link.id)}
                        disabled={(s?.total ?? 0) > 0}
                        title={(s?.total ?? 0) > 0 ? 'Посилання має заявки — вимкніть його замість видалення' : 'Видалити посилання'}
                        aria-label={`Видалити посилання ${link.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/* Диалог создания */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setForm(EMPTY_FORM) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нове посилання</DialogTitle>
            <DialogDescription>Код згенерується автоматично і після створення не змінюється.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ref-name">Назва партнера</Label>
              <Input
                id="ref-name"
                value={form.name}
                maxLength={REF_NAME_MAX}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Наприклад, Агенція Промо"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
              <p className="text-xs text-muted-foreground">{form.name.length} / {REF_NAME_MAX}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ref-notes">Нотатки (необовʼязково)</Label>
              <Textarea
                id="ref-notes"
                value={form.notes}
                maxLength={REF_NOTES_MAX}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Контакт партнера, умови, коментар"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Скасувати</Button>
            <Button onClick={handleCreate} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог переименования */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перейменувати посилання</DialogTitle>
            <DialogDescription>Код і адреса посилання лишаються тими самими.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ref-edit-name">Назва партнера</Label>
              <Input
                id="ref-edit-name"
                value={editForm.name}
                maxLength={REF_NAME_MAX}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave() }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ref-edit-notes">Нотатки</Label>
              <Textarea
                id="ref-edit-notes"
                value={editForm.notes}
                maxLength={REF_NOTES_MAX}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Скасувати</Button>
            <Button onClick={handleEditSave} disabled={saving || !editForm.name.trim()}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити посилання?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetLeads > 0
                ? `Посилання «${deleteTarget?.name}» має ${deleteTargetLeads} заявок — вимкніть його замість видалення.`
                : `Посилання «${deleteTarget?.name}» перестане працювати: перехід за ним дасть заявку без партнера.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting || deleteTargetLeads > 0} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
