"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Su mobile la topbar del Hub diventa un menu LATERALE a scomparsa (come le
 * altre app Deluxy): un hamburger apre il drawer, che si chiude alla
 * navigazione, cliccando il velo o con Esc. Sul desktop il drawer non compare
 * e le azioni restano in linea nella topbar. Nessuna voce viene tolta: si
 * spostano tutte nel drawer (Libro UX cap.1-2).
 */
export function MenuMobile({ children }: { children: React.ReactNode }) {
  const [aperto, setAperto] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setAperto(false);
  }, [pathname]);

  useEffect(() => {
    if (!aperto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperto(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [aperto]);

  return (
    <>
      <button
        type="button"
        className="hamburger"
        aria-label="Apri il menu"
        aria-expanded={aperto}
        onClick={() => setAperto(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {aperto && <div className="menu-scrim" onClick={() => setAperto(false)} aria-hidden="true" />}

      <div className={`topbar-actions${aperto ? " aperto" : ""}`}>{children}</div>
    </>
  );
}
