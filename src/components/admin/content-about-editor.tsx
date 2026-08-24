'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/components/admin/collapsible-section'
import { ImageField } from '@/components/admin/content-image-field'
import type { AboutContent, AboutMember } from '@/lib/content'
import { aboutSectionVisible } from '@/config/site'

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

export function AboutEditor({
  value, onChange, defaultAbout,
}: {
  value: AboutContent
  onChange: (v: AboutContent) => void
  defaultAbout: AboutContent
}) {
  const setField = (k: 'eyebrow' | 'title' | 'text') => (v: string) =>
    onChange({ ...value, [k]: v })

  // Дефолтне фото за ключем учасника — для кнопки «До дефолту».
  const defaultByKey = new Map((defaultAbout.members ?? []).map((m) => [m.key, m]))

  const members = value.members ?? []
  function patchMember(i: number, patch: Partial<AboutMember>) {
    onChange({ ...value, members: members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) })
  }
  function addMember() {
    onChange({
      ...value,
      members: [...members, { key: `member-${Date.now()}`, name: '', photo: '', experience: '', role: '', skills: '' }],
    })
  }
  function removeMember(i: number) {
    onChange({ ...value, members: members.filter((_, idx) => idx !== i) })
  }
  function moveMember(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= members.length) return
    const next = [...members]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange({ ...value, members: next })
  }

  return (
    <CollapsibleCard
      title="Про нас (команда)"
      description={
        'Заголовок блоку та картки учасників команди з фото.' +
        (aboutSectionVisible ? '' : ' • Блок приховано на сайті (правки збережуться).')
      }
    >
      <TextField label="Заголовок блоку" value={value.title} onChange={setField('title')} textarea />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Надзаголовок (eyebrow)" value={value.eyebrow} onChange={setField('eyebrow')} />
      </div>
      <TextField label="Опис блоку" value={value.text} onChange={setField('text')} textarea />

      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium">Учасники ({members.length})</p>
        {members.map((m, i) => (
          <CollapsibleItem
            key={i}
            title={m.name.trim() || `Учасник ${i + 1}`}
            right={
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveMember(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveMember(i, 1)} disabled={i === members.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeMember(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            }
          >
            <TextField label="Ім'я" value={m.name} onChange={(v) => patchMember(i, { name: v })} />
            <ImageField
              label="Фото"
              value={m.photo ?? ''}
              defaultValue={defaultByKey.get(m.key)?.photo}
              onChange={(v) => patchMember(i, { photo: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Досвід PPC Google Ads" value={m.experience} onChange={(v) => patchMember(i, { experience: v })} placeholder="4 роки" />
              <TextField label="Роль" value={m.role} onChange={(v) => patchMember(i, { role: v })} placeholder="Co-Founder, Team Lead" />
            </div>
            <TextField label="Навички" value={m.skills} onChange={(v) => patchMember(i, { skills: v })} textarea />
          </CollapsibleItem>
        ))}
        <Button variant="outline" size="sm" onClick={addMember}>
          <Plus className="h-4 w-4 mr-1" /> Додати учасника
        </Button>
      </div>
    </CollapsibleCard>
  )
}
