import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy CRM",
  description:
    "Il libro dei clienti Deluxy: schede a 360 gradi dagli ordini, ricorrenze, eventi con inviti e mail personalizzate",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
