"use client";

import { usePathname } from "next/navigation";

/**
 * La navigazione con la voce attiva (Libro UX&UI cap.1: due segnali visivi + aria-current).
 *
 * È l'unico componente client dell'app: la rotta corrente un layout server non la
 * conosce, e un CSS `.attivo` scritto e mai applicato è codice morto che inganna
 * (il difetto storico di questa app, corretto il 28/08/2026).
 * Confronto esatto di rotta, come il riferimento (Mail VoceMenu): qui ogni voce è
 * una pagina senza sottorotte.
 */
export function NavPrincipale({ voci }: { voci: { href: string; testo: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="topbar-nav">
      {voci.map((v) => {
        const attivo = pathname === v.href;
        return (
          <a
            key={v.href}
            className={`topbar-link${attivo ? " attivo" : ""}`}
            href={v.href}
            aria-current={attivo ? "page" : undefined}
          >
            {v.testo}
          </a>
        );
      })}
    </nav>
  );
}
