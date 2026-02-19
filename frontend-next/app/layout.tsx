import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Frai | Fridge + AI",
  description: "Frai mobile-first web app built with Next.js + TypeScript"
};

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
