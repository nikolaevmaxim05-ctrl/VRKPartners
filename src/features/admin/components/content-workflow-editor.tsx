'use client'

import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/features/admin/components/collapsible-section'
import type { WorkflowContent, WorkflowStep, WorkflowTerm } from '@/shared/content/defaults'

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

export function WorkflowEditor({
  value, onChange,
}: {
  value: WorkflowContent
  onChange: (v: WorkflowContent) => void
}) {
  const steps = value.steps ?? []
  const terms = value.bonus?.terms ?? []

  const setTitle = (v: string) => onChange({ ...value, title: v })
  const setBonus = (k: 'badge' | 'title' | 'desc' | 'cta') => (v: string) =>
    onChange({ ...value, bonus: { ...value.bonus, [k]: v } })

  // Кроки процесу
  function patchStep(i: number, patch: Partial<WorkflowStep>) {
    onChange({ ...value, steps: steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }
  function addStep() {
    onChange({ ...value, steps: [...steps, { n: steps.length + 1, title: '' }] })
  }
  function removeStep(i: number) {
    // Перенумеровуємо кроки після видалення.
    onChange({ ...value, steps: steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, n: idx + 1 })) })
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange({ ...value, steps: next.map((s, idx) => ({ ...s, n: idx + 1 })) })
  }

  // Умови бонусу
  function patchTerm(i: number, patch: Partial<WorkflowTerm>) {
    onChange({ ...value, bonus: { ...value.bonus, terms: terms.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) } })
  }
  function addTerm() {
    onChange({ ...value, bonus: { ...value.bonus, terms: [...terms, { label: '', value: '' }] } })
  }
  function removeTerm(i: number) {
    onChange({ ...value, bonus: { ...value.bonus, terms: terms.filter((_, idx) => idx !== i) } })
  }

  return (
    <CollapsibleCard
      title="Процес (блок 5)"
      description="Заголовок, кроки процесу та бонус від Google."
    >
      <TextField label="Заголовок блоку" value={value.title} onChange={setTitle} textarea />

      {/* Кроки */}
      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium">Кроки процесу ({steps.length})</p>
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{s.n}</span>
            <Input value={s.title} onChange={(e) => patchStep(i, { title: e.target.value })} placeholder={`Крок ${i + 1}`} />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveStep(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeStep(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addStep}><Plus className="h-4 w-4 mr-1" /> Додати крок</Button>
      </div>

      {/* Бонус від Google */}
      <div className="space-y-3 pt-4">
        <p className="text-sm font-medium">Бонус від Google</p>
        <TextField label="Заголовок бонусу" value={value.bonus?.title ?? ''} onChange={setBonus('title')} />
        <TextField label="Опис бонусу" value={value.bonus?.desc ?? ''} onChange={setBonus('desc')} textarea />
        <TextField label="Кнопка" value={value.bonus?.cta ?? ''} onChange={setBonus('cta')} />

        <div className="space-y-2">
          <p className="text-sm font-medium">Умови ({terms.length})</p>
          {terms.map((t, i) => (
            <CollapsibleItem
              key={i}
              title={t.label.trim() || `Умова ${i + 1}`}
              right={
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeTerm(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              }
            >
              <TextField label="Мітка" value={t.label} onChange={(v) => patchTerm(i, { label: v })} />
              <TextField label="Значення" value={t.value} onChange={(v) => patchTerm(i, { value: v })} />
              <TextField label="Виділити (частина значення жовтим, необовʼязково)" value={t.highlight ?? ''} onChange={(v) => patchTerm(i, { highlight: v || undefined })} />
            </CollapsibleItem>
          ))}
          <Button variant="outline" size="sm" onClick={addTerm}><Plus className="h-4 w-4 mr-1" /> Додати умову</Button>
        </div>
      </div>
    </CollapsibleCard>
  )
}
