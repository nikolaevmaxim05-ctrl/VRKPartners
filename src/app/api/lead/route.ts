// POST /api/lead — алиас /api/leads (старий шлях форми; рішення власника — лишається до кінця робіт).
// runtime оголошено тут явно: Next читає конфіг сегмента статично, реекспорт може бути проігнорований.
export { POST } from '../leads/route'
export const runtime = 'nodejs'
