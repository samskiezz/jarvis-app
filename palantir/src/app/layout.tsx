import type { Metadata, Viewport } from "next";
import ErrorBoundary from '@/components/ErrorBoundary';
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const SITE_NAME = "JARVIS · PALANTIR";
const SITE_TITLE = "JARVIS — Palantir-Class Intelligence Core | Live Global Common Operating Picture";
const SITE_DESCRIPTION = "JARVIS Palantir unified intelligence surface. One interactive command picture fusing Gotham (operating picture), Foundry (ontology), AIP (reasoning mesh) and Apollo (delivery) — live flights, satellites, maritime, earthquakes, fires, cyber threats, OSINT and a real entity-resolution graph over the JARVIS ontology backend.";

export const viewport: Viewport = {
  themeColor: "#D4AF37",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | JARVIS",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "JARVIS", "Palantir", "common operating picture", "Gotham", "Foundry", "Apollo", "AIP",
    "intelligence platform", "global intelligence", "geospatial intelligence", "GEOINT", "SIGINT",
    "entity resolution", "link analysis", "ontology", "real-time tracking",
    "flight tracker", "satellite tracking", "maritime AIS", "earthquake monitor",
    "wildfire tracker", "cyber threats", "OSINT", "threat intelligence",
  ],
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    shortcut: "/favicon.ico",
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-touch-icon.png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
  },
  category: "technology",
  classification: "Intelligence & Security",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "JARVIS",
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#06060C",
    "msapplication-config": "none",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="antialiased">
        <ErrorBoundary name="JARVIS Core">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
