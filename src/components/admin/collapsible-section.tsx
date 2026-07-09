'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Верхньорівневий згортуваний блок (Card). За замовчуванням згорнутий. */
export function CollapsibleCard({
  title, description, defaultOpen = false, children,
}: {
  title: string
  description?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  )
}

/** Внутрішній згортуваний елемент (напр. картка послуги / кейс). Згорнутий за замовчуванням.
 * `right` — дії (сортування/видалення) у заголовку, клік по них не згортає. */
export function CollapsibleItem({
  title, right, defaultOpen = false, children,
}: {
  title: string
  right?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
          <span className="truncate text-sm font-medium">{title}</span>
        </button>
        {right && <div className="flex shrink-0 gap-1">{right}</div>}
      </div>
      {open && <div className="space-y-2 border-t p-3">{children}</div>}
    </div>
  )
}
