// Вся адмінка — динамічна: сторінки не пререндеряться на білді, тому збірка
// не потребує env Supabase (деплой лендінгу не блокується відсутністю ключів).
export const dynamic = 'force-dynamic'

// Обгортка всієї адмінки: лендінг живе на темній бренд-темі (body → bg-bg,
// text-white/90), а адмінка — на shadcn-токенах. Без цього шару текст адмінки
// успадковує білий колір лендінгу на білому фоні.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      {children}
    </div>
  )
}
