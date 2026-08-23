import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRAC Library — Library Management System",
  description:
    "TRAC Library Management System — Institute of Agricultural Sciences, Bongao, Tawi-Tawi. Catalog search, circulation, holds, fines, notifications, and an interactive 3D bookshelf.",
  openGraph: {
    title: "TRAC Library",
    description:
      "TRAC Library Management System — Institute of Agricultural Sciences, Bongao, Tawi-Tawi.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
