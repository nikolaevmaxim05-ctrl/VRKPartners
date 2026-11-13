'use client'

// Локализованный (uk-UA) выбор даты без нативного <input type="date">.
// Нативный пикер берёт язык из локали браузера (часто рус.) и не адаптируется под сайт,
// поэтому рисуем собственный календарь на date-fns + Popover. Контракт значения — 'yyyy-MM-dd'
// (как у нативного инпута), чтобы не менять остальной код.

import * as React from 'react'
import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  isSameDay,
  isSameMonth,
} from 'date-fns'
import { uk } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

function parseValue(value: string): Date | null {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

type DatePickerProps = {
  /** Значение в формате 'yyyy-MM-dd' (пустая строка = не задано). */
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  placeholder?: string
  className?: string
  invalid?: boolean
  /** Показывать кнопку «Очистити». */
  clearable?: boolean
}

export function DatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder = 'дд.мм.рррр',
  className,
  invalid,
  clearable = true,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseValue(value)
  const [viewMonth, setViewMonth] = React.useState<Date>(() => selected ?? new Date())

  // При открытии показываем месяц выбранной даты (или текущий)
  React.useEffect(() => {
    if (open) setViewMonth(selected ?? new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const monthStart = startOfMonth(viewMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }) // неделя с понедельника
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format(addDays(gridStart, i), 'EEEEEE', { locale: uk }),
  )
  const today = new Date()

  function pick(d: Date) {
    onChange(format(d, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            'h-9 w-36 justify-start font-normal',
            !selected && 'text-muted-foreground',
            invalid && 'border-destructive',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          {selected ? format(selected, 'dd.MM.yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3"
        align="start"
        // Внутри модального диалога body имеет pointer-events:none, а попап
        // рендерится в портал на body → клики по дням «проваливаются». Возвращаем.
        style={{ pointerEvents: 'auto' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Шапка: месяц + год (uk) + навигация */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            className="p-1 rounded hover:bg-accent"
            aria-label="Попередній місяць"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium capitalize">
            {format(viewMonth, 'LLLL yyyy', { locale: uk })}
          </div>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="p-1 rounded hover:bg-accent"
            aria-label="Наступний місяць"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Сетка дней */}
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {weekdays.map((w, i) => (
            <div key={i} className="text-[11px] text-muted-foreground py-1 capitalize">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = isSameMonth(d, monthStart)
            const isSelected = !!selected && isSameDay(d, selected)
            const isToday = isSameDay(d, today)
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => pick(d)}
                className={cn(
                  'h-8 w-8 rounded text-sm transition-colors',
                  inMonth ? 'text-foreground' : 'text-muted-foreground/40',
                  !isSelected && 'hover:bg-accent',
                  isToday && !isSelected && 'ring-1 ring-primary/50',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                {format(d, 'd')}
              </button>
            )
          })}
        </div>

        {/* Подвал: «Очистити» / «Сьогодні» */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t">
          {clearable && value ? (
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Очистити
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => pick(today)}
            className="text-xs text-primary hover:underline"
          >
            Сьогодні
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
