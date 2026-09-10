'use client'

import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/features/admin/components/collapsible-section'
import { IconPicker } from '@/features/admin/components/content-icon-picker'
import { DEFAULT_USP_ICON_ORDER } from '@/shared/lib/audit-icons'
import type { UspContent, UspItem } from '@/shared/content/defaults'

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
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

export function UspEditor({
  value, onChange,
}: {
  value: UspContent
  onChange: (v: UspContent) => void
}) {
  const setField = (k: 'eyebrow' | 'title' | 'text') => (v: string) =>
    onChange({ ...value, [k]: v })

  const items = value.items ?? []
  function patchItem(i: number, patch: Partial<UspItem>) {
    onChange({ ...value, items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })
  }
  function addItem() {
    onChange({ ...value, items: [...items, { title: '', text: '' }] })
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
      title="Унікальні переваги (USP)"
      description="Заголовок блоку та пронумеровані пункти переваг."
    >
      <TextField label="Заголовок блоку" value={value.title} onChange={setField('title')} textarea />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Надзаголовок (eyebrow)" value={value.eyebrow} onChange={setField('eyebrow')} />
      </div>
      <TextField label="Опис блоку" value={value.text} onChange={setField('text')} textarea />

      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium">Пункти ({items.length})</p>
        {items.map((it, i) => (
          <CollapsibleItem
            key={i}
            title={it.title.trim() || `Пункт ${i + 1}`}
            right={
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            }
          >
            <TextField label="Заголовок" value={it.title} onChange={(v) => patchItem(i, { title: v })} />
            <IconPicker value={it.icon} index={i} order={DEFAULT_USP_ICON_ORDER} onChange={(v) => patchItem(i, { icon: v })} />
            <TextField label="Опис" value={it.text} onChange={(v) => patchItem(i, { text: v })} textarea />
          </CollapsibleItem>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" /> Додати пункт
        </Button>
      </div>
    </CollapsibleCard>
  )
}
