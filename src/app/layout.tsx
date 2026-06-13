import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import { ModalProvider } from "@/components/ModalProvider";
import { RevealObserver } from "@/components/RevealObserver";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: siteUrl,
  description: site.description,
  email: site.email,
  sameAs: [site.telegram],
  areaServed: ["UA", "EU", "US"],
  knowsAbout: [
    "Google Ads",
    "Performance Max",
    "YouTube Ads",
    "Demand Gen",
    "PPC",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className={raleway.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ModalProvider>
          <RevealObserver />
          <Header />
          <main>{children}</main>
          <Footer />
        </ModalProvider>
      </body>
    </html>
  );
}
