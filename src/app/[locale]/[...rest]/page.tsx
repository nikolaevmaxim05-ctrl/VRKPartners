import { notFound } from 'next/navigation'

// Невідомий шлях сайту → 404 під layout сайту ([locale]/not-found.tsx).
export default function CatchAllPage() {
  notFound()
}
