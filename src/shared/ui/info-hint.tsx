"use client"

// InfoHint — кругла іконка «i» з підказкою (промпт: пояснення точок аналітики).
// Відкривається І при наведенні, І при кліку/тапі — працює на десктопі та тачі.
// Контент рендериться у Portal (через Radix Popover) → не обрізається
// контейнером таблиці з overflow-x-auto.

import * as React from "react"
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"

type InfoHintProps = {
  /** Текст підказки — що саме запускає подію */
  text: string
  /** aria-label для кнопки (доступність) */
  label?: string
  /** Додаткові класи для кнопки-іконки */
  className?: string
}

export function InfoHint({ text, label, className }: InfoHintProps) {
  const [open, setOpen] = React.useState(false)
  // Таймер відкладеного закриття — щоб встигнути перевести курсор
  // з іконки на саму підказку, не закривши її.
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  React.useEffect(() => () => cancelClose(), [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ?? "Що запускає цю подію"}
          onMouseEnter={() => {
            cancelClose()
            setOpen(true)
          }}
          onMouseLeave={scheduleClose}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center justify-center shrink-0 rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 text-xs leading-relaxed whitespace-normal"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        // Не забирати фокус при відкритті по hover — інакше «стрибає» сторінка
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  )
}
