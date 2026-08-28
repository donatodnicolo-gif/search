"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";

// «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la riga porta al
// dettaglio; i click su link, bottoni e campi dentro la riga non navigano.
// Il link sul nome resta comunque: è l'accesso da tastiera. Le righe senza
// dettaglio (totali, sottorighe per canale) restano <tr> normali.
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
