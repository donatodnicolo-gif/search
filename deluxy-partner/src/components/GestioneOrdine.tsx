"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { GESTIONI } from "@/lib/ordini";

// Come si incassa un ordine del sito partner: «Ordine partner» (rientra nel
// conto mensile del partner, in banca non c'è nulla da cercare) oppure
// «Richiesta di pagamento esterna» (il denaro arriva davvero e va abbinato).
// Si salva al cambio della tendina, senza bottone Salva: è una scelta sola e
// un bottone in più per riga renderebbe la tabella illeggibile.
const SCELTE = ["partner", "pagamento_esterno"] as const;

function Tendina({ valore }: { valore: string }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="gestione"
      // `key` sul valore del server: senza, la tendina è un campo non
      // controllato e dopo il salvataggio continua a mostrare la scelta
      // precedente mentre il resto della riga è già cambiato — si legge come
      // «non ha salvato». Cambiando la key React la rimonta sul valore vero.
      key={valore}
      defaultValue={valore}
      disabled={pending}
      aria-busy={pending}
      aria-label="Come si incassa questo ordine"
      title="Ordine partner = rientra nel conto mensile del partner, niente da abbinare in banca"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      style={{ fontSize: 12.5, padding: "4px 8px", maxWidth: 210 }}
    >
      {SCELTE.map((k) => (
        <option key={k} value={k}>
          {GESTIONI[k].label}
        </option>
      ))}
    </select>
  );
}

export function GestioneOrdine({
  valore,
  azione,
}: {
  valore: string;
  azione: (formData: FormData) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={azione} style={{ display: "inline-flex" }}>
      <Tendina valore={valore} />
    </form>
  );
}
