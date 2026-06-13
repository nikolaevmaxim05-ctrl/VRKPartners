import { Logo } from "@/components/ui/Logo";
import { nav, site } from "@/config/site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-bg-line bg-bg-soft/50">
      <div className="container-x py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo className="text-lg" />
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              {site.description}
            </p>
            <p className="mt-3 text-sm text-white/40">{site.geo}</p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-2" aria-label="Навігація у футері">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="space-y-1 text-sm">
            <a
              href={site.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-white/60 transition-colors hover:text-brand"
            >
              {site.telegramHandle}
            </a>
            <a
              href={`mailto:${site.email}`}
              className="block text-white/60 transition-colors hover:text-brand"
            >
              {site.email}
            </a>
            <a
              href={site.phoneHref}
              className="block text-white/60 transition-colors hover:text-brand"
            >
              {site.phone}
            </a>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-bg-line pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {site.name}. Усі права захищені.</p>
          <p>Офіційний Google Partner · performance-маркетинг</p>
        </div>
      </div>
    </footer>
  );
}
