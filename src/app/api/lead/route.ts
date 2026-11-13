// POST /api/lead — алиас /api/leads (старый путь формы; решение владельца — остаётся до конца работ).
// runtime объявлен здесь явно: Next читает конфиг сегмента статически, реэкспорт может быть проигнорирован.
export { POST } from '../leads/route'
export const runtime = 'nodejs'
