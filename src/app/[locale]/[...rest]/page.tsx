import { notFound } from 'next/navigation'

// Неизвестный путь сайта → 404 под layout сайта ([locale]/not-found.tsx).
export default function CatchAllPage() {
  notFound()
}
