'use client'

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
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

/** Список простих рядків (facts / niches / approach). */
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
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0" onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
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

/** Список метрик value/label. */
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
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0" onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
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

export function CasesEditor({ initial }: { initial: TrustContent }) {
  const [title, setTitle] = useState(initial.title ?? '')
  const [caseHint, setCaseHint] = useState(initial.caseHint ?? '')
  const [ctaSecondary, setCtaSecondary] = useState(initial.ctaSecondary ?? '')
  const [facts, setFacts] = useState<string[]>(initial.facts ?? [])
  const [niches, setNiches] = useState<string[]>(initial.niches ?? [])
  const [highlights, setHighlights] = useState<CaseMetric[]>(initial.highlights ?? [])
  const [groups, setGroups] = useState<CaseGroup[]>(initial.caseGroups ?? [])
  const [saving, setSaving] = useState(false)

  function patchGroup(gi: number, patch: Partial<CaseGroup>) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  }
  function patchCase(gi: number, ci: number, patch: Partial<CaseItem>) {
    setGroups((prev) => prev.map((g, i) => i === gi
      ? { ...g, cases: g.cases.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
      : g))
  }

  async function save() {
    setSaving(true)
    try {
      const trust: Partial<TrustContent> = {
        title, caseHint, ctaSecondary,
        facts: facts.filter((f) => f.trim().length > 0),
        niches: niches.filter((n) => n.trim().length > 0),
        highlights: highlights.filter((h) => h.value.trim().length > 0),
        caseGroups: groups
          .filter((g) => g.niche.trim().length > 0)
          .map((g) => ({ ...g, cases: g.cases.filter((c) => c.client.trim().length > 0) })),
      }
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: { trust } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Кейси збережено. Лендинг оновлено.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Кейси та довіра (блок 4)</CardTitle>
        <CardDescription>
          Заголовок, факти, хайлайти, ніші та самі кейси. Зображення кейса — шлях до файлу
          в /public (напр. <code>/cases/turbokitchen.png</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TextFieldLike label="Заголовок блоку" value={title} onChange={setTitle} textarea />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextFieldLike label="Підказка над кейсами" value={caseHint} onChange={setCaseHint} />
          <TextFieldLike label="Кнопка (консультація)" value={ctaSecondary} onChange={setCtaSecondary} />
        </div>
        <StringList label="Факти (список)" values={facts} onChange={setFacts} placeholder="Понад 500 000 $ бюджетів…" />
        <StringList label="Ніші (чіпи)" values={niches} onChange={setNiches} placeholder="E-commerce" />
        <MetricList label="Хайлайти-цифри" values={highlights} onChange={setHighlights} />

        {/* Ніші → кейси */}
        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">Ніші кейсів ({groups.length})</p>
          {groups.map((g, gi) => (
            <div key={gi} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Input value={g.niche} className="max-w-xs" placeholder="Назва ніші" onChange={(e) => patchGroup(gi, { niche: e.target.value })} />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGroups((p) => move(p, gi, -1))} disabled={gi === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGroups((p) => move(p, gi, 1))} disabled={gi === groups.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setGroups((p) => p.filter((_, i) => i !== gi))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              {g.cases.map((c, ci) => (
                <div key={ci} className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Кейс {ci + 1}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => patchGroup(gi, { cases: move(g.cases, ci, -1) })} disabled={ci === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => patchGroup(gi, { cases: move(g.cases, ci, 1) })} disabled={ci === g.cases.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => patchGroup(gi, { cases: g.cases.filter((_, j) => j !== ci) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextFieldLike label="Назва клієнта" value={c.client} onChange={(v) => patchCase(gi, ci, { client: v })} />
                    <TextFieldLike label="Посилання (href)" value={c.href ?? ''} onChange={(v) => patchCase(gi, ci, { href: v })} placeholder="https://client.com/" />
                    <TextFieldLike label="Підпис (ніша/опис)" value={c.title} onChange={(v) => patchCase(gi, ci, { title: v })} />
                    <TextFieldLike label="Зображення" value={c.image ?? ''} onChange={(v) => patchCase(gi, ci, { image: v })} placeholder="/cases/turbokitchen.png" />
                  </div>
                  <TextFieldLike label="Завдання (task)" value={c.task ?? ''} onChange={(v) => patchCase(gi, ci, { task: v })} textarea />
                  <MetricList label="Метрики" values={c.metrics ?? []} onChange={(v) => patchCase(gi, ci, { metrics: v })} />
                  <StringList label="Підходи (approach)" values={c.approach ?? []} onChange={(v) => patchCase(gi, ci, { approach: v })} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => patchGroup(gi, { cases: [...g.cases, { id: `case-${Date.now()}`, client: '', title: '', metrics: [] }] })}>
                <Plus className="h-4 w-4 mr-1" /> Додати кейс
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setGroups((p) => [...p, { id: `niche-${Date.now()}`, niche: '', cases: [] }])}>
            <Plus className="h-4 w-4 mr-1" /> Додати нішу
          </Button>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Зберегти кейси
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Локальний Field (щоб не тягнути залежності). */
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
