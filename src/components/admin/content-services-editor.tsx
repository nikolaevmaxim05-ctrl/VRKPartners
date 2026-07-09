'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import type { ServicesContent, ServiceItem } from '@/lib/content'

function TextField({
  label, value, onChange, textarea, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

export function ServicesEditor({ initial }: { initial: ServicesContent }) {
  const [eyebrow, setEyebrow] = useState(initial.eyebrow ?? '')
  const [title, setTitle] = useState(initial.title ?? '')
  const [text, setText] = useState(initial.text ?? '')
  const [cta, setCta] = useState(initial.cta ?? '')
  const [items, setItems] = useState<ServiceItem[]>(initial.items ?? [])
  const [saving, setSaving] = useState(false)

  function patchItem(i: number, patch: Partial<ServiceItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function addItem() {
    setItems((prev) => [...prev, { key: `svc-${Date.now()}`, name: '', desc: '', previewWide: false }])
  }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)) }
  function moveItem(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const services: ServicesContent = {
        eyebrow, title, text, cta,
        items: items.filter((it) => it.name.trim().length > 0),
      }
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: { services } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Послуги збережено. Лендинг оновлено.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Послуги (блок 2)</CardTitle>
        <CardDescription>
          Заголовок блоку та картки послуг. Зображення задаються шляхом до файлу в /public
          (напр. <code>/mockups/search-ad.png</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TextField label="Заголовок блоку" value={title} onChange={setTitle} textarea />
        <TextField label="Опис блоку" value={text} onChange={setText} textarea />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Надзаголовок (eyebrow)" value={eyebrow} onChange={setEyebrow} />
          <TextField label="Кнопка блоку" value={cta} onChange={setCta} />
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">Картки послуг ({items.length})</p>
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Послуга {i + 1}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <TextField label="Назва" value={it.name} onChange={(v) => patchItem(i, { name: v })} />
              <TextField label="Опис" value={it.desc} onChange={(v) => patchItem(i, { desc: v })} textarea />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Зображення (мала)" value={it.mockup ?? ''} onChange={(v) => patchItem(i, { mockup: v })} placeholder="/mockups/search-ad.png" />
                <TextField label="Зображення (велике)" value={it.mockupFull ?? ''} onChange={(v) => patchItem(i, { mockupFull: v })} placeholder="/mockups/search-full.png" />
                <TextField label="Alt зображення" value={it.mockupAlt ?? ''} onChange={(v) => patchItem(i, { mockupAlt: v })} />
                <label className="flex items-center gap-2 text-sm mt-6">
                  <input type="checkbox" checked={!!it.previewWide} onChange={(e) => patchItem(i, { previewWide: e.target.checked })} />
                  Широке прев'ю
                </label>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Додати послугу
          </Button>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Зберегти послуги
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
