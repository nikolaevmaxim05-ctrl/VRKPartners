// StatusBadge — кольоровий бейдж статусу лида.
// Колір приходить з БД (lead_statuses.color), формат "#rrggbb".
// Контрастний текст: чорний на світлому фоні, білий на темному.

type Props = {
  name: string
  color: string
  className?: string
}

// Перетворюємо hex у яскравість і вибираємо колір тексту.
function isLightColor(hex: string): boolean {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return false
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  // Перцептивна яскравість (W3C формула)
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
