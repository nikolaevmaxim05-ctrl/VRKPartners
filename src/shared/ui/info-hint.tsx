"use client"

// InfoHint — круглая иконка «i» с подсказкой (промпт: пояснения точек аналитики).
// Открывается И при наведении, И при клике/тапе — работает на десктопе и таче.
// Контент рендерится в Portal (через Radix Popover) → не обрезается
// контейнером таблицы с overflow-x-auto.

import * as React from "react"
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"

type InfoHintProps = {
  /** Текст подсказки — что именно запускает событие */
  text: string
  /** aria-label для кнопки (доступность) */
  label?: string
  /** Дополнительные классы для кнопки-иконки */
  className?: string
}

export function InfoHint({ text, label, className }: InfoHintProps) {
  const [open, setOpen] = React.useState(false)
  // Таймер отложенного закрытия — чтобы успеть перевести курсор
  // с иконки на саму подсказку, не закрыв её.
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
        // Не забирать фокус при открытии по hover — иначе «прыгает» страница
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  )
}
