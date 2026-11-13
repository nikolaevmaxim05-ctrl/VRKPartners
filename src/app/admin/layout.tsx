// Вся админка — динамическая: страницы не пререндерятся на билде, поэтому сборка
// не требует env Supabase (деплой лендинга не блокируется отсутствием ключей).
export const dynamic = 'force-dynamic'

// Обёртка всей админки: лендинг живёт на тёмной бренд-теме (body → bg-bg,
// text-white/90), а админка — на shadcn-токенах. Без этого слоя текст админки
// наследует белый цвет лендинга на белом фоне.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-scope min-h-svh bg-background text-foreground">
      {children}
    </div>
  )
}
