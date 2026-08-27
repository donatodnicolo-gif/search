"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Un link della barra che sa se è la pagina che stai guardando.
//
// Prima i link erano pixel-identici su ogni pagina e `aria-current` non era mai
// impostato: l'unica navigazione del portale non diceva mai dove ti trovi — né
// a chi guarda né a un lettore di schermo. È l'unica ragione per cui questo
// pezzo è un componente client: il pathname si legge solo di là.
export function NavLink({
  href,
  className = "btn ghost",
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const percorso = usePathname();
  // `/utenti` deve restare acceso anche su `/utenti/qualcosa`, ma la casa (`/`)
  // combacerebbe con tutto: per lei si chiede l'uguaglianza esatta.
  const attivo = href === "/" ? percorso === "/" : percorso === href || percorso.startsWith(`${href}/`);

  return (
    <Link href={href} className={`${className}${attivo ? " attivo" : ""}`} title={title} aria-current={attivo ? "page" : undefined}>
      {children}
    </Link>
  );
}
