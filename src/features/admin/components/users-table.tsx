'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Badge } from '@/shared/ui/badge'
import { Switch } from '@/shared/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { UserPlus, Trash2, Loader2, Pencil } from 'lucide-react'

type AdminUser = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  display_name: string | null
  role_id: string | null
  role_name: string | null
  is_active: boolean
}

type AdminRole = {
  id: string
  name: string
  is_system: boolean
  rank: number
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Власник',
  manager: 'Менеджер',
}

function roleLabel(name: string | null): string {
  if (!name) return '—'
  return ROLE_LABELS[name] ?? name
}

export function UsersTable({
  initialUsers,
  adminRoles,
  currentUserId,
  canManageUsers,
  actorRank,
  roleRanks,
}: {
  initialUsers: AdminUser[]
  adminRoles: AdminRole[]
  currentUserId: string
  canManageUsers: boolean
  // Ранг поточного користувача + карта roleId→ранг. Керувати можна лише тими,
  // чия роль СТРОГО нижче (rank більший) або без ролі.
  actorRank: number
  roleRanks: Record<string, number>
}) {
  // Роль користувача без ролі вважаємо «найнижчою» (керована).
  const roleRankOf = (roleId: string | null) =>
    roleId ? (roleRanks[roleId] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY
  // Чи може поточний користувач керувати цим рядком (роль/активність/видалення).
  const canManageRow = (u: AdminUser) =>
    canManageUsers && u.id !== currentUserId && roleRankOf(u.role_id) > actorRank
  // Ролі, які можна призначати: лише строго нижче за власну.
  const assignableRoles = adminRoles.filter((r) => r.rank > actorRank)
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editRoleId, setEditRoleId] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role_id: inviteRoleId || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.warning) toast(json.warning)
      // Додаємо запрошеного користувача у список без перезавантаження сторінки.
      if (json.user) {
        const roleName =
          adminRoles.find((r) => r.id === json.user.role_id)?.name ?? null
        const newUser: AdminUser = { ...json.user, role_name: roleName }
        setUsers((prev) =>
          prev.some((u) => u.id === newUser.id)
            ? prev.map((u) => (u.id === newUser.id ? newUser : u))
            : [newUser, ...prev]
        )
      }
      setInviteSuccess(true)
      setInviteEmail('')
      setInviteRoleId('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Помилка')
    } finally {
      setInviting(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Помилка видалення')
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== id))
      toast.success('Користувача видалено')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  function openEdit(u: AdminUser) {
    setEditUser(u)
    setEditName(u.display_name ?? '')
    setEditRoleId(u.role_id ?? '')
  }

  async function handleToggleActive(u: AdminUser) {
    const next = !u.is_active
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: next } : x)))

    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error ?? 'Помилка')
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: !next } : x)))
    }
  }

  async function handleEditSave() {
    if (!editUser) return
    setEditSaving(true)

    const selectedRole = adminRoles.find((r) => r.id === editRoleId)

    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: editName,
        role_id: editRoleId || undefined,
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error ?? 'Помилка збереження')
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUser.id
            ? {
                ...u,
                display_name: editName || null,
                role_id: editRoleId || null,
                role_name: selectedRole?.name ?? null,
              }
            : u
        )
      )
      toast.success('Збережено')
      setEditUser(null)
    }

    setEditSaving(false)
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{users.length} користувачів</p>
        {canManageUsers && (
          <Button
            size="sm"
            onClick={() => { setInviteOpen(true); setInviteSuccess(false); setInviteError(null) }}
          >
            <UserPlus className="h-4 w-4 mr-1" /> Запросити користувача
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium">Email / Ім'я</th>
              <th className="px-4 py-2 text-left font-medium w-36">Роль</th>
              <th className="px-4 py-2 text-left font-medium w-28">Статус</th>
              <th className="px-4 py-2 text-left font-medium w-36">Активний</th>
              <th className="px-4 py-2 text-left font-medium w-40">Останній вхід</th>
              {canManageUsers && (
                <th className="px-4 py-2 text-right font-medium w-24">Дії</th>
              )}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={canManageUsers ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                  Немає користувачів
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{u.display_name || u.email}</span>
                      {u.id === currentUserId && (
                        <Badge variant="outline" className="text-xs shrink-0">Це ви</Badge>
                      )}
                    </div>
                    {u.display_name && (
                      <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm">{roleLabel(u.role_name)}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.email_confirmed ? 'default' : 'secondary'}>
                    {u.email_confirmed ? 'Активний' : 'Запрошений'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {canManageRow(u) ? (
                    <Switch
                      checked={u.is_active}
                      onCheckedChange={() => handleToggleActive(u)}
                      disabled={!u.role_id}
                      aria-label="Активний"
                      title={!u.role_id ? 'Спочатку призначте роль' : undefined}
                    />
                  ) : (
                    <span className={u.is_active ? 'text-green-600 text-xs' : 'text-muted-foreground text-xs'}>
                      {u.is_active ? 'Так' : 'Ні'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDate(u.last_sign_in_at)}
                </td>
                {canManageUsers && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canManageRow(u) ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(u)}
                            title="Редагувати роль"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(u.id)}
                            title="Видалити"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          title="Роль на рівні або вище за вашу"
                        >
                          —
                        </span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Модалка запрошення */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => { setInviteOpen(o); if (!o) { setInviteSuccess(false); setInviteError(null) } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Запросити користувача</DialogTitle>
          </DialogHeader>
          {inviteSuccess ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-green-600 font-medium">✓ Запрошення відправлено!</p>
              <p className="text-sm text-muted-foreground">
                Користувач отримає лист від Supabase з посиланням для входу.
              </p>
              <Button className="mt-2" onClick={() => { setInviteOpen(false); setInviteSuccess(false) }}>
                Закрити
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Email нового користувача</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@clinic.com.ua"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label>Роль</Label>
                  <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Без ролі (лише читання)" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {roleLabel(r.name)}
                          {r.is_system && <span className="text-muted-foreground ml-1">(системна)</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supabase відправить лист з посиланням для встановлення пароля.
                </p>
                {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Скасувати</Button>
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                  {inviting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Відправити запрошення
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Модалка редагування ролі / імені */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Редагувати користувача</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1.5 block">Відображуване ім'я</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={editUser?.email ?? ''}
                maxLength={64}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Якщо не вказано — відображається email.
              </p>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Роль</Label>
              <Select
                value={editRoleId}
                onValueChange={setEditRoleId}
                disabled={editUser?.id === currentUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без ролі" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {roleLabel(r.name)}
                      {r.is_system && <span className="text-muted-foreground ml-1">(системна)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editUser?.id === currentUserId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Власну роль змінити не можна.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Скасувати</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Підтвердження видалення */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити користувача?</AlertDialogTitle>
            <AlertDialogDescription>
              Користувач втратить доступ до адмін-панелі. Цю дію не можна відмінити.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) handleDelete(deleteId) }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
