import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Замри, Папайа! — Танцевальная игра",
  description: "Папайа танцует под жуткую музыку Чакки. Успей нажать ПРОБЕЛ, когда музыка стихнет!",
  keywords: ["игра", "танцы", "замри", "папайа", "freeze dance", "игра на реакцию"],
  authors: [{ name: "Z.ai" }],
  openGraph: {
    title: "Замри, Папайа!",
    description: "Танцевальная игра на реакцию под музыку Чакки",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
