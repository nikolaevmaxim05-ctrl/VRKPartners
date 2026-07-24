'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Upload, RotateCcw } from 'lucide-react'

/** Поле зображення: прев'ю + завантаження свого файлу + ручний шлях + повернення до дефолту. */
export function ImageField({
  label, value, defaultValue, onChange,
}: {
  label: string
  value: string
  defaultValue?: string
  onChange: (v: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // дозволяємо повторний вибір того самого файлу
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // C14: віддаємо попередній URL, щоб бекенд видалив старий файл при заміні.
      if (value) fd.append('previous', value)
      const res = await fetch('/api/admin/content/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onChange(json.url)
      toast.success('Зображення завантажено')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка завантаження')
    } finally {
      setUploading(false)
    }
  }

  const canReset = defaultValue !== undefined && defaultValue !== '' && value !== defaultValue

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-16 w-16 shrink-0 rounded border bg-muted object-cover" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded border bg-muted" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/mockups/… або URL" />
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Завантажити
            </Button>
            {canReset && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(defaultValue as string)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> До дефолту
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
