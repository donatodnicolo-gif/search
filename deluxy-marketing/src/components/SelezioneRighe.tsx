"use client";

import { useEffect, useRef, useState } from "react";

// Selezionare più righe di una tabella e agire su tutte insieme.
//
// ⚠️ PERCHÉ NON È UN COMPONENTE UNICO CHE DISEGNA LA TABELLA. Le tabelle qui
// sono server component: leggono dal database e restano tali. Questi due pezzi
// sono le sole parti che devono sapere cosa è spuntato, quindi sono gli unici
// «use client» — le caselle restano normali `<input type="checkbox">` dentro il
// form, e chi agisce è la server action che riceve la FormData.
//
// ⚠️ Si guarda il DOM del form, non uno stato React condiviso. Sembra brutto ed
// è la scelta giusta: lo stato vero è già nel form (è lui che verrà inviato), e
// tenerne una seconda copia in React vuol dire due verità che possono
// divergere — con l'utente che vede «3 selezionate» e ne parte una.

/** Il conteggio nel bottone che agisce su tutte le righe spuntate. */
export function ContaSelezionate({
  nome,
  etichetta,
  className = "btn small",
}: {
  /** Il `name` delle caselle da contare. */
  nome: string;
  /** Come si legge il bottone: «Porta qui le N» → (n) => `…`. */
  etichetta: (n: number) => string;
  className?: string;
}) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const form = ancora.current?.closest("form");
    if (!form) return;
    const aggiorna = () => setN(form.querySelectorAll(`input[name="${nome}"]:checked`).length);
    // `change` basta: le caselle non cambiano in altro modo. Si ascolta sul
    // FORM e non su ogni casella, così le righe restano server component.
    form.addEventListener("change", aggiorna);
    aggiorna();
    return () => form.removeEventListener("change", aggiorna);
  }, [nome]);

  return (
    <span ref={ancora}>
      {/* ⚠️ Disabilitato a zero: un bottone che si può premere e non fa niente
          insegna che i bottoni di questa pagina a volte non funzionano. */}
      <button type="submit" className={className} disabled={n === 0}>
        {etichetta(n)}
      </button>
    </span>
  );
}

/** La casella in testa alla colonna: spunta o libera tutte le righe. */
export function SelezionaTutte({ nome, titolo }: { nome: string; titolo?: string }) {
  const ancora = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ancora}
      type="checkbox"
      title={titolo ?? "Seleziona tutte le righe"}
      aria-label={titolo ?? "Seleziona tutte le righe"}
      onChange={(e) => {
        const form = ancora.current?.closest("form");
        if (!form) return;
        const caselle = form.querySelectorAll<HTMLInputElement>(`input[name="${nome}"]`);
        caselle.forEach((c) => {
          c.checked = e.target.checked;
        });
        // ⚠️ Le spunte messe da qui NON emettono `change` da sole: senza questo
        // il contatore resterebbe fermo a zero mentre le righe sono tutte
        // spuntate — cioè il bottone direbbe una cosa e il form ne manderebbe
        // un'altra.
        form.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}
