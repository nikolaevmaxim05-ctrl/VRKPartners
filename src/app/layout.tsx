import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/shared/config/site";
import { getDefaultMessages } from "@/shared/content/defaults";
import { routing, LOCALE_CODES } from "@/i18n/routing";

const raleway = Raleway({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-raleway",
});

// Базовые метаданные (инварианты: metadataBase, robots, icons). Заголовок/описание главной
// переопределяет generateMetadata в [locale]/page.tsx из вкладки «Метадані (SEO)».
const { site, pageMeta } = getDefaultMessages(routing.defaultLocale);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: pageMeta.title,
    template: `%s · ${site.name}`,
  },
  description: pageMeta.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: LOCALE_CODES[routing.defaultLocale].og,
    url: siteUrl,
    siteName: site.name,
    title: pageMeta.title,
    description: pageMeta.description,
    images: [{ url: pageMeta.ogImage || "/og.png", width: 1200, height: 630, alt: site.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: pageMeta.title,
    description: pageMeta.description,
    images: [pageMeta.ogImage || "/og.png"],
  },
  icons: { icon: "/icon.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0E",
  width: "device-width",
  initialScale: 1,
};

// Корневой layout — только скелет (html/body/шрифт). Обёртка сайта (Header/Footer/модалки/
// трекинг/next-intl) — в [locale]/layout.tsx; админка имеет собственную обёртку в admin/layout.tsx и
// живёт вне языков, поэтому <html lang> ставится здесь из единой карты кодов (профиль A: один язык).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={LOCALE_CODES[routing.defaultLocale].lang} className={raleway.variable}>
      <body>{children}</body>
    </html>
  );
}
