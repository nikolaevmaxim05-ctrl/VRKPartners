// StatusBadge — цветной бейдж статуса лида.
// Цвет приходит из БД (lead_statuses.color), формат "#rrggbb".
// Контрастный текст: чёрный на светлом фоне, белый на тёмном.

type Props = {
  name: string
  color: string
  className?: string
}

// Преобразуем hex в яркость и выбираем цвет текста.
function isLightColor(hex: string): boolean {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return false
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  // Перцептивная яркость (формула W3C)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 160
}

export function StatusBadge({ name, color, className = '' }: Props) {
  const textColor = isLightColor(color) ? '#111827' : '#ffffff'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
      style={{ backgroundColor: color, color: textColor }}
    >
      {name}
    </span>
  )
}
