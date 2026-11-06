import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "privateissues.admin",
    short_name: "PI Admin",
    description: "Private Issues yönetim paneli",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f3ec",
    theme_color: "#f6f3ec",
    lang: "tr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Kargolanacaklar", url: "/orders?status=open", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Stok", url: "/stock", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Instagram", url: "/instagram", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
