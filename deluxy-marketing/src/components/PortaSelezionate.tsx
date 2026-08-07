"use client";

import { useState } from "react";
import { ATTR } from "@/lib/porta-keyword";

// «Porta altrove le selezionate»: raccoglie le caselle spuntate e apre lo
// stesso dialogo che si apre da una riga sola.
//
// ⚠️ Non è un secondo percorso. Il dialogo è quello, l'azione è quella, la
// coda e l'approvazione sono quelle: qui si scrivono soltanto le parole
// scelte dentro l'attributo che il dialogo già sa leggere, separate da
// «\n» — così una parola o dieci passano dalla stessa porta.
export function PortaSelezionate({ lingue }: { lingue: string[] }) {
  const [quante, setQuante] = useState(0);

  // Il conteggio serve a non aprire un dialogo vuoto e a dire quante sono
  // PRIMA di aprirlo. Si rilegge a ogni click sul modulo, che è dove le
  // caselle vivono.
  const conta = () =>
    document.querySelectorAll<HTMLInputElement>('input[form="scelte-termini"][name="scelte"]:checked')
      .length;

  return (
    <button
      type="button"
      className="btn small"
      onMouseEnter={() => setQuante(conta())}
      onFocus={() => setQuante(conta())}
      onClick={(e) => {
        const scelte = [
          ...document.querySelectorAll<HTMLInputElement>(
            'input[form="scelte-termini"][name="scelte"]:checked'
          ),
        ].map((i) => i.value);
        setQuante(scelte.length);
        if (scelte.length === 0) return;
        // Si scrivono gli attributi sul bottone stesso e si rilancia il click:
        // l'ascoltatore delegato del dialogo li legge da lì, come farebbe con
        // il bottone di una riga.
        const b = e.currentTarget;
        b.setAttribute(ATTR.keyword, scelte.join("\n"));
        b.setAttribute(ATTR.corrispondenza, "exact");
        b.setAttribute(ATTR.escludi, "");
        b.setAttribute(ATTR.classificata, "si");
        b.setAttribute(ATTR.lingue, lingue.join(","));
        b.click();
      }}
    >
      Porta altrove le selezionate{quante > 0 ? ` (${quante})` : ""}
    </button>
  );
}
