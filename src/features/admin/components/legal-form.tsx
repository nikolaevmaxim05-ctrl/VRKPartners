'use client'

// Редактор юридичних документів (Політика конфіденційності / Публічна оферта).
// UI у стилі вкладки «Контент»: дві вкладки-документи → розділи-акордеони
// (CollapsibleItem — той самий компонент, що у content-form для FAQ/кейсів):
// у шапці — номер і живий заголовок + шеврон + дії (вгору/вниз/видалити),
// за замовчуванням згорнуті. Дані/ендпоінти/валідація — без змін.

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { CollapsibleItem } from '@/features/admin/components/collapsible-section'

type DocKey = 'privacy' | 'offer'

// Секція у стані форми: абзаци й пункти редагуються як текст (рядок = абзац/пункт).
// id — стабільний ключ для React, щоб згорнутий/розгорнутий стан не «стрибав»
// під час перестановки чи видалення сусідніх розділів (у dirty-порівнянні не бере участі).
type EditSection = { id: string; heading: string; paragraphsText: string; itemsText: string }
type InitialDoc = {
  title: string
  sections: { heading: string; paragraphs: string[]; items?: string[] }[]
}
type Initial = { privacy: InitialDoc; offer: InitialDoc }

const DOC_LABELS: Record<DocKey, string> = {
  privacy: 'Політика конфіденційності',
  offer: 'Публічна оферта',
}

let _idSeq = 0
const newId = () => `sec-${Date.now().toString(36)}-${(_idSeq++).toString(36)}`

function toEdit(doc: InitialDoc): EditSection[] {
  return doc.sections.map((s) => ({
    id: newId(),
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

/** Серіалізація без id — щоб дірті-стан не залежав від службових ключів. */
function serialize(privacy: EditSection[], offer: EditSection[]) {
  const strip = (arr: EditSection[]) =>
    arr.map(({ heading, paragraphsText, itemsText }) => ({ heading, paragraphsText, itemsText }))
  return JSON.stringify({ privacy: strip(privacy), offer: strip(offer) })
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
    serialize(toEdit(initial.privacy), toEdit(initial.offer)),
  )
  const current = serialize(privacy, offer)
  const dirty = current !== baseline

  const sections = tab === 'privacy' ? privacy : offer
  const setSections = tab === 'privacy' ? setPrivacy : setOffer

  function updateSection(i: number, patch: Partial<EditSection>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function addSection() {
    setSections((prev) => [...prev, { id: newId(), heading: '', paragraphsText: '', itemsText: '' }])
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
      {/* Рівень 1 — документ: перемикач вкладок */}
      <div className="flex flex-wrap gap-2">
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

      {/* Рівень 2 — розділи документа: акордеони */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Розділи документа «{DOC_LABELS[tab]}» ({sections.length})
        </p>

        {sections.length === 0 && (
          <p className="text-sm text-muted-foreground">Ще немає розділів. Додайте перший.</p>
        )}

        {sections.map((s, i) => (
          <CollapsibleItem
            key={s.id}
            title={`${i + 1}. ${s.heading.trim() || 'Новий розділ'}`}
            right={
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(i, -1)} disabled={i === 0} title="Вгору">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} title="Вниз">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeSection(i)} title="Видалити розділ">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            }
          >
            {/* Рівень 3 — поля розділу */}
            <div className="space-y-1.5">
              <Label className="text-sm">Заголовок розділу</Label>
              <Input
                value={s.heading}
                onChange={(e) => updateSection(i, { heading: e.target.value })}
                placeholder="Напр. 1. Загальні положення"
              />
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

            {/* Вкладена група — глибший рівень, приглушена підложка */}
            <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
              <Label className="text-sm">Пункти переліку (необов’язково, кожен рядок — пункт)</Label>
              <Textarea
                value={s.itemsText}
                onChange={(e) => updateSection(i, { itemsText: e.target.value })}
                rows={3}
                placeholder="Пункт переліку…"
              />
            </div>
          </CollapsibleItem>
        ))}

        <Button variant="outline" size="sm" onClick={addSection}>
          <Plus className="mr-1 h-4 w-4" /> Додати розділ
        </Button>
      </div>

      {/* Плавуча кнопка збереження — як у вкладці «Контент» */}
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
