"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import type { CategoriaCosto } from "@/lib/categorie-spesa";

// Tendina per assegnare la categoria di costo a un'uscita. Salva al cambio,
// senza bottone: è una scelta sola e un bottone per riga renderebbe la tabella
// illeggibile. La `key` sul valore del server serve perché il campo non è
// controllato: senza, dopo il salvataggio continuerebbe a mostrare la scelta
// precedente mentre la riga è già cambiata.

// **Cosa ci va dentro**, con le parole di Budgets. È qui che serve: assegnare a
// mano si fa davanti al movimento, e finché la tendina mostrava solo i nomi si
// finiva per indovinare — cioè per mettere la stessa spesa oggi in una
// categoria e domani in un'altra. Il primo pezzo è la cosa più importante che
// Budgets sa e Finance non diceva: che quella categoria non è un costo.
function aiuto(c: CategoriaCosto): string | undefined {
  const pezzi = [
    c.quotaPartner
      ? "PARTITA DI GIRO: non è un costo, è la quota del partner che ha eseguito l'ordine."
      : null,
    c.descrizione ?? null,
  ].filter(Boolean);
  return pezzi.length ? pezzi.join(" ") : undefined;
}

function Tendina({ valore, categorie }: { valore: string; categorie: CategoriaCosto[] }) {
  const { pending } = useFormStatus();
  const scelta = categorie.find((c) => c.id === valore);
  return (
    <select
      name="categoria"
      key={valore}
      defaultValue={valore}
      disabled={pending}
      aria-busy={pending}
      aria-label="Categoria di costo"
      title={scelta ? aiuto(scelta) : undefined}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      style={{ fontSize: 12.5, padding: "4px 8px", maxWidth: 230 }}
    >
      <option value="">— senza categoria —</option>
      {/* in ordine alfabetico: si cerca a colpo d'occhio scorrendo i nomi */}
      {[...categorie]
        .sort((a, b) => a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }))
        .map((c) => (
          <option key={c.id} value={c.id} title={aiuto(c)}>
            {c.quotaPartner ? `${c.nome} ⇄` : c.nome}
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
