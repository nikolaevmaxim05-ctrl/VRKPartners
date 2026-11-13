'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Label } from '@/shared/ui/label'
import { cn } from '@/shared/lib/utils'
import { AUDIT_ICONS, AUDIT_ICON_KEYS, resolveIcon, isImageIcon } from '@/shared/lib/audit-icons'

/** Выбор иконки карточки: пресеты (lucide) + возможность загрузить своё изображение. */
export function IconPicker({
  value, index, order, onChange, label = 'Іконка',
}: {
  value: string | undefined
  index: number
  order: readonly string[]
  onChange: (v: string) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const custom = isImageIcon(value)
  const ActiveIcon = resolveIcon(value, index, order)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/content/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onChange(json.url) // теперь icon = URL изображения
      toast.success('Іконку завантажено')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка завантаження')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {AUDIT_ICON_KEYS.map((key) => {
          const Icon = AUDIT_ICONS[key]
          const active = !custom && (value ? value === key : ActiveIcon === Icon)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              title={key}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}

        {/* Превью загруженной иконки (если есть) */}
        {custom && (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-primary bg-primary/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-6 w-6 object-contain" />
          </div>
        )}

        {/* Кнопка загрузки своего изображения */}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Своя
        </button>
      </div>
      {custom && (
        <p className="text-xs text-muted-foreground">
          Використано власне зображення. Щоб повернути значок — оберіть будь-який зі списку.
        </p>
      )}
    </div>
  )
}
