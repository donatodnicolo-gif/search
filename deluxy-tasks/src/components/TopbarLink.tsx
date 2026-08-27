"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Voce della topbar con stato attivo a due segnali + aria-current
// (Libro UX&UI cap.1: la voce attiva è obbligatoria ovunque, WCAG 1.4.1).
export function TopbarLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const attivo = pathname === href;
  return (
    <Link className="topbar-link" href={href} aria-current={attivo ? "page" : undefined}>
      {children}
    </Link>
  );
}
