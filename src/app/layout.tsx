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

// Базові метадані (інваріанти: metadataBase, robots, icons). Заголовок/опис головної
// перевизначає generateMetadata у [locale]/page.tsx з вкладки «Метадані (SEO)».
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

// Кореневий layout — лише скелет (html/body/шрифт). Обгортка сайту (Header/Footer/модалки/
// трекінг/next-intl) — у [locale]/layout.tsx; адмінка має власну обгортку в admin/layout.tsx і
// живе поза мовами, тому <html lang> ставиться тут з єдиної карти кодів (профіль A: одна мова).
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
