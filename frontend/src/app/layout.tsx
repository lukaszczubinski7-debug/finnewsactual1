import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono } from "next/font/google";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Research Terminal",
  description: "AI research & geopolitical intelligence",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pl" className={ibmPlexMono.variable}>
      <body
        style={{
          margin: 0,
          backgroundColor: "#080d14",
          color: "#a0bcd8",
          fontFamily: "var(--font-mono), 'IBM Plex Mono', 'Courier New', monospace",
          fontFeatureSettings: '"kern" 1, "liga" 0',
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          overflowX: "hidden",
        }}
      >
        {children}
      </body>
    </html>
  );
}
