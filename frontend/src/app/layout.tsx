
import type { Metadata } from "next";
import localFont from "next/font/local";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { ToastBridge } from "@/shared/components/toast-bridge";
import { Providers } from "@/providers";
import "@/components/arc/foundation.css";
import "./globals.css";

// Bundle fonts so production builds do not depend on Google Fonts responses.
const inter = localFont({
  src: "../assets/fonts/inter/Inter[opsz,wght].woff2",
  variable: "--font-inter",
  weight: "100 900",
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
    "Distributed quantum computing on a libp2p mesh, options pricing, risk analysis, portfolio optimization, and circuit execution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <ToastStackProvider>
            {children}
            <ToastBridge />
            <ToastStack />
          </ToastStackProvider>
        </Providers>
      </body>
    </html>
  );
}
