'use client'

// Редактор юридичних документів (Політика конфіденційності / Публічна оферта).
// Дві вкладки; у кожній — список розділів (заголовок + абзаци + необовʼязкові
// пункти переліку), з додаванням/видаленням/перестановкою. Лише plain text.

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type DocKey = 'privacy' | 'offer'

// Секція в стані форми: абзаци й пункти редагуються як текст (рядок = абзац/пункт).
type EditSection = { heading: string; paragraphsText: string; itemsText: string }
type InitialDoc = {
  title: string
  sections: { heading: string; paragraphs: string[]; items?: string[] }[]
}
type Initial = { privacy: InitialDoc; offer: InitialDoc }

const DOC_LABELS: Record<DocKey, string> = {
  privacy: 'Політика конфіденційності',
  offer: 'Публічна оферта',
}

function toEdit(doc: InitialDoc): EditSection[] {
  return doc.sections.map((s) => ({
    heading: s.heading,
    paragraphsText: s.paragraphs.join('\n'),
    itemsText: (s.items ?? []).join('\n'),
  }))
}

function toSections(edit: EditSection[]) {
  return edit
    .map((s) => {
      const paragraphs = s.paragraphsText.split('\n').map((l) => l.trim()).filter(Boolean)
      const items = s.itemsText.split('\n').map((l) => l.trim()).filter(Boolean)
      const section: { heading: string; paragraphs: string[]; items?: string[] } = {
        heading: s.heading.trim(),
        paragraphs,
      }
      if (items.length > 0) section.items = items
      return section
    })
    .filter((s) => s.heading || s.paragraphs.length > 0 || (s.items && s.items.length > 0))
}

export function LegalForm({
  initial,
  baseUpdatedAt: initialUpdatedAt,
}: {
  initial: Initial
  baseUpdatedAt: string | null
}) {
  const [tab, setTab] = useState<DocKey>('privacy')
  const [privacy, setPrivacy] = useState<EditSection[]>(() => toEdit(initial.privacy))
  const [offer, setOffer] = useState<EditSection[]>(() => toEdit(initial.offer))
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initialUpdatedAt)
  const [saving, setSaving] = useState(false)

  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({ privacy: toEdit(initial.privacy), offer: toEdit(initial.offer) }),
  )
  const current = JSON.stringify({ privacy, offer })
  const dirty = current !== baseline

  const sections = tab === 'privacy' ? privacy : offer
  const setSections = tab === 'privacy' ? setPrivacy : setOffer

  function updateSection(i: number, patch: Partial<EditSection>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function addSection() {
    setSections((prev) => [...prev, { heading: '', paragraphsText: '', itemsText: '' }])
  }
  function removeSection(i: number) {
    setSections((prev) => prev.filter((_, idx) => idx !== i))
  }
  function moveSection(i: number, dir: -1 | 1) {
    setSections((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const overrides = {
        privacy: { sections: toSections(privacy) },
        offer: { sections: toSections(offer) },
      }
      const res = await fetch('/api/admin/legal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides, baseUpdatedAt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (typeof json.updatedAt === 'string') setBaseUpdatedAt(json.updatedAt)
      setBaseline(current)
      toast.success('Збережено. Сторінки оновлено.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Вкладки документів */}
      <div className="flex gap-2">
        {(['privacy', 'offer'] as DocKey[]).map((k) => (
          <Button
            key={k}
            variant={tab === k ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(k)}
          >
            {DOC_LABELS[k]}
          </Button>
        ))}
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">Ще немає розділів. Додайте перший.</p>
      )}

      {sections.map((s, i) => (
        <div key={i} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm">Заголовок розділу {i + 1}</Label>
              <Input
                value={s.heading}
                onChange={(e) => updateSection(i, { heading: e.target.value })}
                placeholder="Напр. 1. Загальні положення"
              />
            </div>
            <div className="flex shrink-0 gap-1 pt-6">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveSection(i, -1)} disabled={i === 0} title="Вгору">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} title="Вниз">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeSection(i)} title="Видалити розділ">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Абзаци (кожен рядок — окремий абзац)</Label>
            <Textarea
              value={s.paragraphsText}
              onChange={(e) => updateSection(i, { paragraphsText: e.target.value })}
              rows={5}
              placeholder="Текст абзацу…"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Пункти переліку (необов’язково, кожен рядок — пункт)</Label>
            <Textarea
              value={s.itemsText}
              onChange={(e) => updateSection(i, { itemsText: e.target.value })}
              rows={3}
              placeholder="Пункт переліку…"
            />
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addSection}>
        <Plus className="mr-1 h-4 w-4" /> Додати розділ
      </Button>

      {/* Плавуча кнопка збереження — зʼявляється лише за наявності змін */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
            <span className="text-sm text-muted-foreground">Є незбережені зміни</span>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Зберегти
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
