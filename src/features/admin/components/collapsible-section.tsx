'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/ui/card'
import { cn } from '@/shared/lib/utils'

// Плавне розгортання/згортання без JS-бібліотек: трюк grid-template-rows 0fr→1fr
// (той самий підхід, що у секції «Показати більше» на лендингу). Працює з
// авто-висотою вкладеного контенту (textarea, прев'ю) — після відкриття нічого
// не обрізається, бо у розкритому стані рядок = auto. Легкий fade поверх.
// Швидко й ненав'язливо: ~200мс, ease-out на розкриття / ease-in на згортання.
// prefers-reduced-motion вимикає всі transition глобально (див. globals.css),
// тож у режимі зменшеної анімації розкриття миттєве, як раніше.
//
// Контент завжди у DOM (навіть згорнутий) — це потрібно для анімації висоти;
// стан полів однаково живе у формах, тож нічого не втрачається.
const ANIM_WRAP =
  'grid transition-all duration-200 motion-reduce:transition-none'
function rowsClass(open: boolean) {
  return open
    ? 'grid-rows-[1fr] opacity-100 ease-out'
    : 'grid-rows-[0fr] opacity-0 ease-in'
}

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
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
        </div>
      </CardHeader>
      <div className={cn(ANIM_WRAP, rowsClass(open))}>
        <div className="overflow-hidden">
          <CardContent className="space-y-4 rounded-b-lg bg-muted/50 pt-4">{children}</CardContent>
        </div>
      </div>
    </Card>
  )
}

/** Внутрішній згортуваний елемент (напр. картка послуги / кейс). Згорнутий за замовчуванням.
 * `right` — дії (сортування/видалення) у заголовку, клік по них не згортає.
 * `level` — глибина вкладеності: різний відтінок фону, щоб око розрізняло рівні. */
export function CollapsibleItem({
  title, right, defaultOpen = false, level = 1, children,
}: {
  title: string
  right?: ReactNode
  defaultOpen?: boolean
  level?: 1 | 2
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Чим глибша вкладеність — тим насиченіший фон (картка bg-muted/50 → рівень 1 → рівень 2).
  const toneClass = level === 2 ? 'bg-muted' : 'bg-muted/80'
  return (
    <div className={cn('rounded-lg border', toneClass)}>
      <div className="flex items-center justify-between gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
          <span className="truncate text-sm font-medium">{title}</span>
        </button>
        {right && <div className="flex shrink-0 gap-1">{right}</div>}
      </div>
      <div className={cn(ANIM_WRAP, rowsClass(open))}>
        <div className="overflow-hidden">
          <div className="space-y-2 border-t p-3">{children}</div>
        </div>
      </div>
    </div>
  )
}
