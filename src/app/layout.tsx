import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import { site, siteUrl } from "@/config/site";

const raleway = Raleway({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-raleway",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${site.name} — Google Ads та performance-маркетинг`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  keywords: [
    "Google Ads",
    "performance-маркетинг",
    "контекстна реклама",
    "Google Partner",
    "аудит Google Ads",
    "PPC агенція",
    "VRK Partners",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "uk_UA",
    url: siteUrl,
    siteName: site.name,
    title: `${site.name} — Google Ads та performance-маркетинг`,
    description: site.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: site.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — Google Ads та performance-маркетинг`,
    description: site.description,
    images: ["/og.png"],
  },
  icons: { icon: "/icon.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0E",
  width: "device-width",
  initialScale: 1,
};

// Кореневий layout — лише скелет (html/body/шрифт). Обгортка лендінгу
// (Header/Footer/модалки/трекінг) — у (marketing)/layout.tsx; адмінка має
// власну обгортку в admin/layout.tsx.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className={raleway.variable}>
      <body>{children}</body>
    </html>
  );
}
