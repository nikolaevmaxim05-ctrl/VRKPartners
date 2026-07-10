'use client'

import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/components/admin/collapsible-section'
import { ImageField } from '@/components/admin/content-image-field'
import type { TrustContent, CaseGroup, CaseItem, CaseMetric } from '@/lib/content'

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>
}

function StringList({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="space-y-1.5">
        {values.map((v, i) => (
          <Row key={i}>
            <Input value={v} placeholder={placeholder} onChange={(e) => onChange(values.map((x, idx) => (idx === i ? e.target.value : x)))} />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Row>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange([...values, ''])}>
          <Plus className="h-4 w-4 mr-1" /> Додати
        </Button>
      </div>
    </div>
  )
}

function MetricList({ label, values, onChange }: {
  label: string; values: CaseMetric[]; onChange: (v: CaseMetric[]) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="space-y-1.5">
        {values.map((m, i) => (
          <Row key={i}>
            <Input value={m.value} placeholder="4 654%" onChange={(e) => onChange(values.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))} />
            <Input value={m.label} placeholder="ROAS" onChange={(e) => onChange(values.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Row>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange([...values, { value: '', label: '' }])}>
          <Plus className="h-4 w-4 mr-1" /> Додати метрику
        </Button>
      </div>
    </div>
  )
}

function TextFieldLike({ label, value, onChange, textarea, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string
}) {
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

export function CasesEditor({
  value, onChange, defaultTrust,
}: {
  value: TrustContent
  onChange: (v: TrustContent) => void
  defaultTrust: TrustContent
}) {
  const setField = (k: 'title' | 'caseHint' | 'ctaSecondary') => (v: string) =>
    onChange({ ...value, [k]: v })

  // Дефолтне зображення кейса за id — для кнопки «До дефолту».
  const defaultImgById = new Map<string, string | undefined>()
  for (const g of defaultTrust.caseGroups ?? []) {
    for (const c of g.cases ?? []) defaultImgById.set(c.id, c.image)
  }

  const groups = value.caseGroups ?? []
  function patchGroup(gi: number, patch: Partial<CaseGroup>) {
    onChange({ ...value, caseGroups: groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) })
  }
  function patchCase(gi: number, ci: number, patch: Partial<CaseItem>) {
    onChange({
      ...value,
      caseGroups: groups.map((g, i) => i === gi
        ? { ...g, cases: g.cases.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
        : g),
    })
  }

  return (
    <CollapsibleCard
      title="Кейси та довіра (блок 4)"
      description="Заголовок, факти, хайлайти, ніші та кейси. Зображення кейса — шлях до файлу в /public (напр. /cases/turbokitchen.png)."
    >
      <TextFieldLike label="Заголовок блоку" value={value.title} onChange={setField('title')} textarea />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextFieldLike label="Підказка над кейсами" value={value.caseHint} onChange={setField('caseHint')} />
        <TextFieldLike label="Кнопка (консультація)" value={value.ctaSecondary} onChange={setField('ctaSecondary')} />
      </div>
      <StringList label="Факти (список)" values={value.facts ?? []} onChange={(v) => onChange({ ...value, facts: v })} placeholder="Понад 500 000 $ бюджетів…" />
      <StringList label="Ніші (чіпи)" values={value.niches ?? []} onChange={(v) => onChange({ ...value, niches: v })} placeholder="E-commerce" />
      <MetricList label="Хайлайти-цифри" values={value.highlights ?? []} onChange={(v) => onChange({ ...value, highlights: v })} />

      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium">Ніші кейсів ({groups.length})</p>
        {groups.map((g, gi) => (
          <CollapsibleItem
            key={gi}
            title={g.niche.trim() || `Ніша ${gi + 1}`}
            right={
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onChange({ ...value, caseGroups: move(groups, gi, -1) })} disabled={gi === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onChange({ ...value, caseGroups: move(groups, gi, 1) })} disabled={gi === groups.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onChange({ ...value, caseGroups: groups.filter((_, i) => i !== gi) })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            }
          >
            <TextFieldLike label="Назва ніші" value={g.niche} onChange={(v) => patchGroup(gi, { niche: v })} />

            <p className="pt-1 text-xs font-medium text-muted-foreground">Кейси ({g.cases.length})</p>
            {g.cases.map((c, ci) => (
              <CollapsibleItem
                key={ci}
                level={2}
                title={c.client.trim() || `Кейс ${ci + 1}`}
                right={
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => patchGroup(gi, { cases: move(g.cases, ci, -1) })} disabled={ci === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => patchGroup(gi, { cases: move(g.cases, ci, 1) })} disabled={ci === g.cases.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => patchGroup(gi, { cases: g.cases.filter((_, j) => j !== ci) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextFieldLike label="Назва клієнта" value={c.client} onChange={(v) => patchCase(gi, ci, { client: v })} />
                  <TextFieldLike label="Посилання (href)" value={c.href ?? ''} onChange={(v) => patchCase(gi, ci, { href: v })} placeholder="https://client.com/" />
                  <TextFieldLike label="Підпис (ніша/опис)" value={c.title} onChange={(v) => patchCase(gi, ci, { title: v })} />
                  <ImageField label="Зображення" value={c.image ?? ''} defaultValue={defaultImgById.get(c.id)} onChange={(v) => patchCase(gi, ci, { image: v })} />
                </div>
                <TextFieldLike label="Завдання (task)" value={c.task ?? ''} onChange={(v) => patchCase(gi, ci, { task: v })} textarea />
                <MetricList label="Метрики" values={c.metrics ?? []} onChange={(v) => patchCase(gi, ci, { metrics: v })} />
                <StringList label="Підходи (approach)" values={c.approach ?? []} onChange={(v) => patchCase(gi, ci, { approach: v })} />
              </CollapsibleItem>
            ))}
            <Button variant="outline" size="sm" onClick={() => patchGroup(gi, { cases: [...g.cases, { id: `case-${Date.now()}`, client: '', title: '', metrics: [] }] })}>
              <Plus className="h-4 w-4 mr-1" /> Додати кейс
            </Button>
          </CollapsibleItem>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange({ ...value, caseGroups: [...groups, { id: `niche-${Date.now()}`, niche: '', cases: [] }] })}>
          <Plus className="h-4 w-4 mr-1" /> Додати нішу
        </Button>
      </div>
    </CollapsibleCard>
  )
}
