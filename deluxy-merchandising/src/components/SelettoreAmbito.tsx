"use client";

// Il selettore d'ambito nella barra in alto: Globale oppure un brand.
// Cambiando valore la scelta viene salvata (cookie) e la pagina corrente si
// ricarica con i numeri di quell'ambito: la stessa schermata, un mondo alla
// volta. Il percorso corrente viaggia in un campo nascosto, così si torna
// esattamente dove si era.

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { impostaAmbito } from "@/lib/azioni-vendite";

export function SelettoreAmbito({ brand, disponibili }: { brand: string | null; disponibili: string[] }) {
  const percorso = usePathname();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form action={impostaAmbito} ref={form} className="ambito">
      <input type="hidden" name="percorso" value={percorso} />
      <span className="ambito-etichetta">Ambito</span>
      <select
        name="brand"
        defaultValue={brand ?? ""}
        aria-label="Ambito: globale o singolo brand"
        onChange={() => form.current?.requestSubmit()}
      >
        <option value="">🌐 Globale — tutti i brand</option>
        {disponibili.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </form>
  );
}
