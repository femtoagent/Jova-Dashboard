import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jova",
  description: "Command center for Jova.",
};

export const viewport: Viewport = {
  themeColor: "#04070a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // keep the composer above the on-screen keyboard where supported (Chrome Android)
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
