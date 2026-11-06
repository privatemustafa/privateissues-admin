import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "privateissues.admin", template: "%s · privateissues.admin" },
  description: "Private Issues yönetim paneli",
  applicationName: "PI Admin",
  appleWebApp: { capable: true, title: "PI Admin", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: "/icons/apple-touch-icon.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f6f3ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
