'use client'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { AUDIT_ICONS, AUDIT_ICON_KEYS, resolveIcon } from '@/lib/audit-icons'

/** Вибір іконки картки — сітка кнопок; підсвічує обрану (або дефолтну за позицією). */
export function IconPicker({
  value, index, order, onChange, label = 'Іконка',
}: {
  value: string | undefined
  index: number
  order: readonly string[]
  onChange: (v: string) => void
  label?: string
}) {
  const ActiveIcon = resolveIcon(value, index, order)
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {AUDIT_ICON_KEYS.map((key) => {
          const Icon = AUDIT_ICONS[key]
          const active = value ? value === key : ActiveIcon === Icon
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
      </div>
    </div>
  )
}
