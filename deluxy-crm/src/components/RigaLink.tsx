"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

// «La riga si apre col click» (Libro UX&UI v1.6 §8): quando il record ha una
// pagina di dettaglio, il click in un punto qualsiasi della riga la apre —
// non solo il piccolo link sul nome. Le azioni dentro la riga (link, bottoni,
// campi) restano loro: un click partito da lì non naviga. Il link sul nome
// resta com'è ed è il percorso vero da tastiera.
export function RigaLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const apri = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
    router.push(href);
  };
  return (
    <tr className="riga-link" onClick={apri}>
      {children}
    </tr>
  );
}
