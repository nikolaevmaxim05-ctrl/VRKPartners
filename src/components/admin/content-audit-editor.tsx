'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/components/admin/collapsible-section'
import { IconPicker } from '@/components/admin/content-icon-picker'
import { DEFAULT_AUDIT_ICON_ORDER } from '@/lib/audit-icons'
import type { AuditContent, AuditItem } from '@/lib/content'

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

/** Редагований список рядків (пункти картки аудиту). */
function PointsList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function update(i: number, v: string) { onChange(value.map((s, idx) => (idx === i ? v : s))) }
  function add() { onChange([...value, '']) }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)) }
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">Пункти</Label>
      {value.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={s} onChange={(e) => update(i, e.target.value)} placeholder={`Пункт ${i + 1}`} />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Додати пункт</Button>
    </div>
  )
}

export function AuditEditor({
  value, onChange,
}: {
  value: AuditContent
  onChange: (v: AuditContent) => void
}) {
  const setField = (k: 'eyebrow' | 'title' | 'cta' | 'ctaSecondary') => (v: string) =>
    onChange({ ...value, [k]: v })

  const items = value.items ?? []
  function patchItem(i: number, patch: Partial<AuditItem>) {
    onChange({ ...value, items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })
  }
  function addItem() {
    onChange({ ...value, items: [...items, { name: '', desc: '', points: [] }] })
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
      title="Аудит (блок 3)"
      description="Заголовок блоку, кнопки та картки аудиту."
    >
      <TextField label="Заголовок блоку" value={value.title} onChange={setField('title')} textarea />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Кнопка (аудит)" value={value.cta} onChange={setField('cta')} />
        <TextField label="Кнопка (калькулятор)" value={value.ctaSecondary} onChange={setField('ctaSecondary')} />
      </div>

      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium">Картки ({items.length})</p>
        {items.map((it, i) => (
          <CollapsibleItem
            key={i}
            title={it.name.trim() || `Картка ${i + 1}`}
            right={
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            }
          >
            <TextField label="Назва" value={it.name} onChange={(v) => patchItem(i, { name: v })} />
            <IconPicker value={it.icon} index={i} order={DEFAULT_AUDIT_ICON_ORDER} onChange={(v) => patchItem(i, { icon: v })} />
            <TextField label="Опис" value={it.desc} onChange={(v) => patchItem(i, { desc: v })} textarea />
            <PointsList value={it.points ?? []} onChange={(v) => patchItem(i, { points: v })} />
          </CollapsibleItem>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" /> Додати картку
        </Button>
      </div>
    </CollapsibleCard>
  )
}
