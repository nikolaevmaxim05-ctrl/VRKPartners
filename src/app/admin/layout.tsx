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
