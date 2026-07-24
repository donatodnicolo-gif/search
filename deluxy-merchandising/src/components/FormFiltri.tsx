"use client";

// Barra filtri (GET): i menu a tendina applicano subito, il campo di ricerca
// si conferma con Invio. Nessuno stato: i valori vivono nella query string.
export function FormFiltri({ children }: { children: React.ReactNode }) {
  return (
    <form
      method="get"
      className="filtri"
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
