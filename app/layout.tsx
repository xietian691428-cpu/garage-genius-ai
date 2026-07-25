import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";
import I18nProvider from "@/components/i18n/I18nProvider";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Garage Genius AI — DIY Auto Repair Coach",
  description:
    "AI diagnosis, vehicle dashboard, parts recommendations, and hands-free voice coaching for US & EU DIY car owners. Start free.",
  icons: { icon: "/favicon.ico" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Garage Genius",
  },
  formatDetection: {
    telephone: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0f1c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark h-full ${display.variable} ${sans.variable}`}>
      <body className="min-h-full bg-[#0a0f1c] font-[family-name:var(--font-sans)] text-slate-200 antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
