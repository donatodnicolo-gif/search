"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

// «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la riga porta al
// dettaglio; i click su link, bottoni e campi dentro la riga non navigano.
export function RigaLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className={className} onClick={(e) => {
      if ((e.target as HTMLElement).closest("a,button,input,select,label,details")) return;
      router.push(href);
    }}>{children}</tr>
  );
}
