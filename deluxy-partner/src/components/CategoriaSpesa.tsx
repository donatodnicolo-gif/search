"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import type { CategoriaCosto } from "@/lib/categorie-spesa";

// Tendina per assegnare la categoria di costo a un'uscita. Salva al cambio,
// senza bottone: è una scelta sola e un bottone per riga renderebbe la tabella
// illeggibile. La `key` sul valore del server serve perché il campo non è
// controllato: senza, dopo il salvataggio continuerebbe a mostrare la scelta
// precedente mentre la riga è già cambiata.

function Tendina({ valore, categorie }: { valore: string; categorie: CategoriaCosto[] }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="categoria"
      key={valore}
      defaultValue={valore}
      disabled={pending}
      aria-busy={pending}
      aria-label="Categoria di costo"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      style={{ fontSize: 12.5, padding: "4px 8px", maxWidth: 230 }}
    >
      <option value="">— senza categoria —</option>
      {/* in ordine alfabetico: si cerca a colpo d'occhio scorrendo i nomi */}
      {[...categorie]
        .sort((a, b) => a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
    </select>
  );
}

export function CategoriaSpesa({
  valore,
  categorie,
  azione,
}: {
  valore: string;
  categorie: CategoriaCosto[];
  azione: (formData: FormData) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={azione} style={{ display: "inline-flex" }}>
      <Tendina valore={valore} categorie={categorie} />
    </form>
  );
}
