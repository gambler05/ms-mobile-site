import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "sonner";
import { getLocale } from "@/i18n/server";
import { dirOf } from "@/i18n/types";
import { I18nProvider } from "@/i18n/client";

export const metadata: Metadata = {
  title: { default: "RepairFlow", template: "%s · RepairFlow" },
  description: "Gestion d'atelier de réparation et de vente d'électronique.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RepairFlow", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090B10" },
    { media: "(prefers-color-scheme: light)", color: "#F4F5F7" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const jar = await cookies();
  const themeCookie = jar.get("rf_theme")?.value ?? "dark";
  const density = jar.get("rf_density")?.value === "compact" ? "compact" : "comfortable";
  const theme = themeCookie === "light" ? "light" : themeCookie === "system" ? undefined : "dark";
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme} data-density={density} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Résolution du thème « système » avant le premier rendu pour éviter tout flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )rf_theme=([^;]*)/);var t=m?m[1]:'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){}})();`,
          }}
        />
      </head>
      <body className="grain">
        <I18nProvider locale={locale}>
          {children}
          <Toaster position="bottom-right" toastOptions={{ className: "!bg-[var(--surface-raised)] !text-[var(--fg)] !border !border-[var(--border-strong)] !shadow-[var(--shadow-3)] !text-[13px]" }} />
        </I18nProvider>
      </body>
    </html>
  );
}
