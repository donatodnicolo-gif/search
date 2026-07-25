"use client";

import { cambiaStato } from "@/app/actions";

type StatoOpt = { id: string; nome: string };

// Menu a tendina che cambia lo stato di un ordine e invia subito il form
// (server action cambiaStato). Compatto, per righe elenco e card della bacheca.
export function CambiaStatoSelect({
  ordineId,
  statoAttualeId,
  stati,
  compatto,
}: {
  ordineId: string;
  statoAttualeId: string | null;
  stati: StatoOpt[];
  compatto?: boolean;
}) {
  return (
    <form action={cambiaStato} style={{ display: "inline-block" }}>
      <input type="hidden" name="ordineId" value={ordineId} />
      <select
        name="statoId"
        defaultValue={statoAttualeId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{
          appearance: "none",
          font: "inherit",
          fontSize: compatto ? 12 : 13,
          color: "var(--text)",
          background: "var(--fill)",
          border: "1px solid transparent",
          borderRadius: "var(--radius-pill)",
          padding: compatto ? "3px 10px" : "5px 12px",
          cursor: "pointer",
          maxWidth: 160,
        }}
      >
        <option value="">— senza stato —</option>
        {stati.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </select>
    </form>
  );
}
