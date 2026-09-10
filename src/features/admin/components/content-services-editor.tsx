'use client'

import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/features/admin/components/collapsible-section'
import { ImageField } from '@/features/admin/components/content-image-field'
import type { ServicesContent, ServiceItem } from '@/shared/content/defaults'

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

export function ServicesEditor({
  value, onChange, defaultServices,
}: {
  value: ServicesContent
  onChange: (v: ServicesContent) => void
  defaultServices: ServicesContent
}) {
  const setField = (k: 'eyebrow' | 'title' | 'text' | 'cta') => (v: string) =>
    onChange({ ...value, [k]: v })

  // Дефолтні зображення за ключем послуги — для кнопки «До дефолту».
  const defaultByKey = new Map((defaultServices.items ?? []).map((it) => [it.key, it]))

  const items = value.items ?? []
  function patchItem(i: number, patch: Partial<ServiceItem>) {
    onChange({ ...value, items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })
  }
  function addItem() {
    onChange({ ...value, items: [...items, { key: `svc-${Date.now()}`, name: '', desc: '', previewWide: false }] })
  }
  function removeItem(i: number) {
    onChange({ ...value, items: items.filter((_, idx) => idx !== i) })
  }
  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange({ ...value, items: next })
  }

  return (
    <CollapsibleCard
      title="Послуги (блок 2)"
      description="Заголовок блоку та картки послуг. Зображення — шлях до файлу в /public (напр. /mockups/search-ad.png)."
    >
      <TextField label="Заголовок блоку" value={value.title} onChange={setField('title')} textarea />
      <TextField label="Опис блоку" value={value.text} onChange={setField('text')} textarea />
      <TextField label="Кнопка блоку" value={value.cta} onChange={setField('cta')} />

      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium">Картки послуг ({items.length})</p>
        {items.map((it, i) => (
          <CollapsibleItem
            key={i}
            title={it.name.trim() || `Послуга ${i + 1}`}
            right={
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            }
          >
            <TextField label="Назва" value={it.name} onChange={(v) => patchItem(i, { name: v })} />
            <TextField label="Опис" value={it.desc} onChange={(v) => patchItem(i, { desc: v })} textarea />
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Потрібні дві версії зображення: <strong>«мала»</strong> — мініатюра прямо на картці,
              а <strong>«велике»</strong> — детальніше превʼю, що зʼявляється при наведенні.
              Радимо завантажувати саме дві окремі картинки: якщо додати одну й обрізати її під
              маленький формат, превʼю зазвичай виходить нечитабельним і невдало обрізаним.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageField label="Зображення (мала)" value={it.mockup ?? ''} defaultValue={defaultByKey.get(it.key)?.mockup} onChange={(v) => patchItem(i, { mockup: v })} />
              <ImageField label="Зображення (велике)" value={it.mockupFull ?? ''} defaultValue={defaultByKey.get(it.key)?.mockupFull} onChange={(v) => patchItem(i, { mockupFull: v })} />
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!it.previewWide} onChange={(e) => patchItem(i, { previewWide: e.target.checked })} />
                Широке прев'ю
              </label>
            </div>
          </CollapsibleItem>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" /> Додати послугу
        </Button>
      </div>
    </CollapsibleCard>
  )
}
