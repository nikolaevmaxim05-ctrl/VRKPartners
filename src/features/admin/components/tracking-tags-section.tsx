'use client'

// Секція «Google теги» на сторінці «Інтеграції».
// Список тегів (тип, ID, мітка, switch enabled, видалення з підтвердженням)
// + форма додавання з селектом типу. Для тегів Google Ads — поле Conversion label
// (друга половина send_to: AW-XXX/LABEL): без нього відправка форми не викликає
// конверсію Ads і Enhanced Conversions нема до чого привʼязатися.
// Зміни застосовуються на лендингу миттєво — API робить revalidatePath('/', 'layout').

import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Badge } from '@/shared/ui/badge'
import { Switch } from '@/shared/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Plus, Trash2, Loader2, Check } from 'lucide-react'
import type { TrackingTag, TrackingTagType } from '@core/domain/tracking/tags'

const TYPE_LABELS: Record<TrackingTagType, string> = {
  gtm: 'GTM',
  ga4: 'GA4',
  aw: 'Google Ads',
}

const TYPE_PLACEHOLDERS: Record<TrackingTagType, string> = {
  gtm: 'GTM-XXXXXXX',
  ga4: 'G-XXXXXXXXXX',
  aw: 'AW-XXXXXXXXXXX',
}

type FormState = {
  type: TrackingTagType
  tag_id: string
  label: string
  conversion_label: string
}

const EMPTY_FORM: FormState = { type: 'gtm', tag_id: '', label: '', conversion_label: '' }

/** Інлайн-редактор Conversion label для тега Google Ads (зберігається окремим PATCH). */
function ConversionLabelField({ tag, onSaved, onError }: { tag: TrackingTag; onSaved: (t: TrackingTag) => void; onError: (m: string) => void }) {
  const [value, setValue] = useState(tag.conversion_label ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = value.trim() !== (tag.conversion_label ?? '')

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tracking-tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversion_label: value.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Помилка оновлення')
      onSaved(json.data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Помилка оновлення')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-xs text-muted-foreground shrink-0">Conversion label:</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="AbCdEfGhIjK"
        className="h-7 w-40 font-mono text-xs"
        aria-label={`Conversion label для ${tag.tag_id}`}
        onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save() }}
      />
      {dirty && (
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={save} disabled={saving} aria-label="Зберегти conversion label">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
      )}
      {!tag.conversion_label && !dirty && (
        <span className="text-xs text-destructive">без label конверсія Ads не викликається</span>
      )}
    </div>
  )
}

export function TrackingTagsSection() {
  const [tags, setTags] = useState<TrackingTag[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/tracking-tags')
      .then(r => r.json())
      .then(({ data }) => { setTags(data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleAdd() {
    const tagId = form.tag_id.trim().toUpperCase()
    if (!tagId) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/tracking-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          tag_id: tagId,
          label: form.label.trim() || null,
          conversion_label: form.type === 'aw' ? form.conversion_label.trim() || null : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Помилка збереження')
      setTags(prev => [...prev, json.data])
      setForm(f => ({ ...f, tag_id: '', label: '', conversion_label: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження')
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(tag: TrackingTag, enabled: boolean) {
    setToggling(t => ({ ...t, [tag.id]: true }))
    setError(null)
    // Оптимістичне оновлення
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, enabled } : t))
    try {
      const res = await fetch(`/api/admin/tracking-tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Помилка оновлення')
    } catch (err) {
      // Відкат при помилці
      setTags(prev => prev.map(t => t.id === tag.id ? { ...t, enabled: !enabled } : t))
      setError(err instanceof Error ? err.message : 'Помилка оновлення')
    } finally {
      setToggling(t => ({ ...t, [tag.id]: false }))
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tracking-tags/${deleteId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Помилка видалення')
      setTags(prev => prev.filter(t => t.id !== deleteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка видалення')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const deleteTarget = tags.find(t => t.id === deleteId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Google теги</CardTitle>
        <CardDescription>
          GA4, Google Tag Manager та Google Ads. Увімкнені теги підключаються
          на лендингу автоматично, без деплою. Для Google Ads вкажіть Conversion label —
          тоді відправка форми викликає конверсію (send_to = AW-…/label).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Завантаження...</span>
          </div>
        ) : (
          <>
            {/* Список тегів */}
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Тегів поки немає. Використовується GTM-контейнер з налаштувань оточення (якщо заданий).
              </p>
            ) : (
              <div className="space-y-2">
                {tags.map(tag => (
                  <div
                    key={tag.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2"
                  >
                    <Badge variant="secondary" className="mt-0.5 text-xs font-normal w-20 justify-center shrink-0">
                      {TYPE_LABELS[tag.type]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm">{tag.tag_id}</div>
                      {tag.label && (
                        <div className="text-xs text-muted-foreground truncate">{tag.label}</div>
                      )}
                      {tag.type === 'aw' && (
                        <ConversionLabelField
                          tag={tag}
                          onSaved={(t) => setTags(prev => prev.map(x => x.id === t.id ? t : x))}
                          onError={setError}
                        />
                      )}
                    </div>
                    <Switch
                      checked={tag.enabled}
                      disabled={!!toggling[tag.id]}
                      onCheckedChange={(checked) => handleToggle(tag, checked)}
                      aria-label={`Увімкнути тег ${tag.tag_id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(tag.id)}
                      title="Видалити тег"
                      aria-label={`Видалити тег ${tag.tag_id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Форма додавання */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-medium">Додати тег</Label>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm(f => ({ ...f, type: v as TrackingTagType }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gtm">GTM</SelectItem>
                    <SelectItem value="ga4">GA4</SelectItem>
                    <SelectItem value="aw">Google Ads</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={form.tag_id}
                  onChange={e => setForm(f => ({ ...f, tag_id: e.target.value }))}
                  placeholder={TYPE_PLACEHOLDERS[form.type]}
                  className="font-mono text-sm w-48"
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                />
                {form.type === 'aw' && (
                  <Input
                    value={form.conversion_label}
                    onChange={e => setForm(f => ({ ...f, conversion_label: e.target.value }))}
                    placeholder="Conversion label"
                    className="font-mono text-sm w-44"
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                  />
                )}
                <Input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Мітка (необов'язково)"
                  className="text-sm flex-1 min-w-40"
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                />
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={adding || !form.tag_id.trim()}
                  className="h-9"
                >
                  {adding
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <><Plus className="h-3.5 w-3.5 mr-1" />Додати</>
                  }
                </Button>
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </>
        )}
      </CardContent>

      {/* Підтвердження видалення */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити тег?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Тег ${deleteTarget.tag_id}${deleteTarget.label ? ` (${deleteTarget.label})` : ''} буде видалено з лендингу одразу. Цю дію не можна скасувати.`
                : 'Тег буде видалено з лендингу одразу. Цю дію не можна скасувати.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Видалити'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
