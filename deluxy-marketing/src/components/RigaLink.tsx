"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la riga porta al
// dettaglio, non le poche lettere del nome; i click su link, bottoni e campi
// dentro la riga non navigano. Il link <a> sul nome resta: è l'accesso da
// tastiera e si apre in una scheda nuova col tasto centrale.
export function RigaLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
