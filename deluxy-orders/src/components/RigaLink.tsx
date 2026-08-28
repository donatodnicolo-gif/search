"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";

// «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la riga porta al
// dettaglio; i click su link, bottoni e campi dentro la riga non navigano.
// Il link sul nome resta comunque: è l'accesso da tastiera.
export function RigaLink({ href, className, style, children }: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr className={className} style={style} onClick={(e) => {
      if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
      router.push(href);
    }}>{children}</tr>
  );
}

// Stessa regola per le liste a card (vista per brand): la card intera apre
// l'ordine, con la stessa guardia sui comandi che ci vivono dentro.
export function SchedaLink({ href, className, style, children }: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className={className} style={style} onClick={(e) => {
      if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
      router.push(href);
    }}>{children}</div>
  );
}
