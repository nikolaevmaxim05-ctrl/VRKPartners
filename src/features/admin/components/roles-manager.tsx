'use client'

// Редактор ролей: переключение прав, сохранение, создание новых ролей,
// удаление кастомных. Системные роли (admin/manager) можно редактировать (права),
// но не переименовывать/удалять.

import { useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Badge } from '@/shared/ui/badge'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Shield, ShieldCheck, Plus, Trash2, Loader2 } from 'lucide-react'
import { InfoHint } from '@/shared/ui/info-hint'

type Role = { id: string; name: string; permissions: string[]; is_system: boolean; rank: number }
type PermOption = { key: string; label: string; description?: string }

const ROLE_LABELS: Record<string, string> = { admin: 'Власник', manager: 'Менеджер' }
const roleLabel = (name: string) => ROLE_LABELS[name] ?? name

export function RolesManager({
  roles,
  setRoles,
  permissionList,
  canManage,
  ownRoleId,
  actorRank,
}: {
  // Список ролей — управляется снаружи (общее состояние с панелью иерархии)
  roles: Role[]
  setRoles: Dispatch<SetStateAction<Role[]>>
  permissionList: PermOption[]
  canManage: boolean
  ownRoleId: string | null
  // Ранг роли текущего пользователя: редактировать можно только роли СТРОГО ниже (rank больше).
  actorRank: number
}) {
  // Черновики прав по роли (для отслеживания «грязного» состояния)
  const [draft, setDraft] = useState<Record<string, string[]>>(
    () => Object.fromEntries(roles.map((r) => [r.id, [...r.permissions]])),
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteRole, setDeleteRole] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Создание
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPerms, setNewPerms] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  function togglePerm(roleId: string, key: string) {
    setDraft((prev) => {
      const cur = prev[roleId] ?? []
      return {
        ...prev,
        [roleId]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
      }
    })
  }

  function isDirty(role: Role): boolean {
    const d = draft[role.id] ?? []
    const o = role.permissions
    if (d.length !== o.length) return true
    const set = new Set(o)
    return d.some((k) => !set.has(k))
  }

  async function saveRole(role: Role) {
    setSavingId(role.id)
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: draft[role.id] ?? [] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Сохраняем ранг (порядок иерархии не меняется при сохранении прав)
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...json.data, rank: r.rank } : r)))
      setDraft((prev) => ({ ...prev, [role.id]: [...json.data.permissions] }))
      toast.success('Права збережено')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setSavingId(null)
    }
  }

  async function createRole() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), permissions: newPerms }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const created: Role = {
        ...json.data,
        rank: Number(json.data.hierarchy_order ?? 1000),
      }
      setRoles((prev) => [...prev, created])
      setDraft((prev) => ({ ...prev, [created.id]: [...created.permissions] }))
      toast.success('Роль створено')
      setCreateOpen(false)
      setNewName('')
      setNewPerms([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setCreating(false)
    }
  }

  async function doDelete(role: Role) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error)
      setRoles((prev) => prev.filter((r) => r.id !== role.id))
      toast.success('Роль видалено')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setDeleting(false)
      setDeleteRole(null)
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Створити роль
          </Button>
        </div>
      )}

      {roles.map((role) => {
        const perms = draft[role.id] ?? role.permissions
        const isOwn = role.id === ownRoleId
        // Редактировать можно только роль СТРОГО ниже собственной (rank больше actorRank).
        // Это автоматически исключает собственную роль и все вышестоящие/равные.
        const editable = canManage && role.rank > actorRank
        const lockedHigher = !editable && !isOwn
        return (
          <div key={role.id} className="rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {role.is_system
                  ? <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                  : <Shield className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-lg">{roleLabel(role.name)}</h2>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{role.name}</code>
                  {role.is_system && <Badge variant="secondary" className="text-xs">системна</Badge>}
                  {isOwn && <Badge variant="outline" className="text-xs">ваша роль</Badge>}
                </div>
              </div>
              {editable && !role.is_system && (
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  onClick={() => setDeleteRole(role)}
                  title="Видалити роль"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">ДОЗВОЛИ</p>
              <div className="flex flex-wrap gap-2">
                {permissionList.map(({ key, label, description }) => {
                  const has = perms.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!editable}
                      title={description}
                      onClick={() => togglePerm(role.id, key)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        has
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'bg-muted/50 text-muted-foreground border-transparent line-through'
                      } ${editable ? 'cursor-pointer hover:border-primary/40' : 'cursor-default'}`}
                    >
                      {has && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {isOwn && canManage && (
              <p className="text-xs text-muted-foreground">
                Це ваша роль — права власної ролі змінювати не можна.
              </p>
            )}

            {lockedHigher && canManage && (
              <p className="text-xs text-muted-foreground">
                Роль на рівні або вище за вашу в ієрархії — редагування недоступне.
              </p>
            )}

            {editable && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveRole(role)} disabled={!isDirty(role) || savingId === role.id}>
                  {savingId === role.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Зберегти
                </Button>
              </div>
            )}
          </div>
        )
      })}

      {/* Создание роли */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Нова роль</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1.5 block">Назва ролі</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="напр. Оператор"
                maxLength={48}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Дозволи</Label>
              <div className="space-y-2">
                {permissionList.map(({ key, label, description }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={newPerms.includes(key)}
                      onCheckedChange={() =>
                        setNewPerms((prev) =>
                          prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                        )
                      }
                    />
                    <span className="text-sm text-foreground">{label}</span>
                    {description && <InfoHint text={description} label={label} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Скасувати</Button>
            <Button onClick={createRole} disabled={creating || !newName.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Удаление */}
      <AlertDialog open={!!deleteRole} onOpenChange={(o) => { if (!o) setDeleteRole(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити роль «{deleteRole ? roleLabel(deleteRole.name) : ''}»?</AlertDialogTitle>
            <AlertDialogDescription>Дію не можна відмінити.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteRole) doDelete(deleteRole) }}
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
