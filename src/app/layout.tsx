import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Relapa — Freeze Dance",
  description: "Dance to the music and freeze when it stops! A Telegram Mini App game.",
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Relapa — Freeze Dance",
    description: "Dance to the music and freeze when it stops!",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1a1410",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} antialiased bg-[#1a1410] text-foreground overflow-hidden`}
      >
        {children}
      </body>
    </html>
  );
}