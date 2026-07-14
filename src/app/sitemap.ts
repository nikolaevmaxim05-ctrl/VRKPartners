import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    // TODO(legal): додати /polityka-konfidentsiynosti і /publichna-oferta ПІСЛЯ
    // публікації реальних текстів (зараз обидві сторінки noindex — у sitemap не входять):
    //   { url: `${siteUrl}/polityka-konfidentsiynosti`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    //   { url: `${siteUrl}/publichna-oferta`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
