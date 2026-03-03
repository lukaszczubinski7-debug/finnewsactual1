import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Fin News",
  description: "Financial news brief",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pl">
      <body
        style={{
          margin: 0,
          backgroundColor: "#eef4f8",
          color: "#10253f",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 16px",
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
