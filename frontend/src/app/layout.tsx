import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"

import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { Providers } from "@/providers";
import "./globals.css";

// Bundle fonts so production builds do not depend on Google Fonts responses.
const dmSans = localFont({
  src: "../assets/fonts/dmsans/DMSans[opsz,wght].woff2",
  variable: "--font-sans",
  weight: "400 500",
  display: "swap",
});

const geistMono = localFont({
  src: "../assets/fonts/geistmono/GeistMono[wght].woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quantum Platform",
  description:
    "Distributed quantum computing on a libp2p mesh — options pricing, risk analysis, portfolio optimization, and circuit execution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
