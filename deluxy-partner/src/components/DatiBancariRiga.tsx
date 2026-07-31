"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { salvaDatiBancariInline, type EsitoSalvataggio } from "@/lib/riconciliazione-actions";

// IBAN e intestatario del conto di una riga di riconciliazione, salvati **senza
// ricaricare la pagina**.
//
// La pagina di riconciliazione interroga Fatture in Cloud e Qonto: ricostruirla
// dopo ogni salvataggio costa secondi, e con cinquanta righe da compilare vuol
// dire aspettare cinquanta volte per un dato che riguarda una riga sola. Qui
// l'esito torna accanto al bottone — verde se è andata, rosso col motivo se no.
export function DatiBancariRiga({
  partnerId,
  anagraficaId,
  ibanIniziale,
  ibanSuggerito,
  intestatarioIniziale,
  intestatarioSuggerito,
  scrittura,
}: {
  partnerId: string;
  anagraficaId: string | null;
  ibanIniziale: string;
  ibanSuggerito: string | null;
  intestatarioIniziale: string;
  intestatarioSuggerito: string | null;
  scrittura: boolean;
}) {
  const [esito, azione] = useActionState<EsitoSalvataggio, FormData>(
    salvaDatiBancariInline.bind(null, partnerId, anagraficaId),
    null
  );

  return (
    <form action={azione} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        type="text"
        name="iban"
        defaultValue={ibanIniziale || ibanSuggerito || ""}
        placeholder="IBAN del partner"
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, padding: "5px 8px" }}
      />
      {!ibanIniziale && ibanSuggerito && (
        <span style={{ fontSize: 11, color: "var(--gold-strong, #8a6d2f)" }}>⤷ dai bonifici Qonto — verifica</span>
      )}
      <input
        type="text"
        name="intestatarioConto"
        defaultValue={intestatarioIniziale || intestatarioSuggerito || ""}
        placeholder="Intestatario del conto"
        title="Il nome a cui esce il bonifico. Non è sempre l'insegna né la ragione sociale: la banca controlla che combaci con l'IBAN."
        style={{ fontSize: 12, padding: "5px 8px" }}
      />
      {!intestatarioIniziale && intestatarioSuggerito && (
        <span style={{ fontSize: 11, color: "var(--gold-strong, #8a6d2f)" }}>
          ⤷ beneficiario dei bonifici — verifica
        </span>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          name="banca"
          placeholder="Banca (facoltativo)"
          style={{ fontSize: 12, padding: "5px 8px", flex: 1 }}
        />
        <Salva scrittura={scrittura} />
      </div>
      {esito && (
        <span
          style={{
            fontSize: 11.5,
            color: esito.ok ? "var(--green)" : "var(--red)",
            lineHeight: 1.35,
          }}
        >
          {esito.ok ? "✓ " : "✕ "}
          {esito.testo}
        </span>
      )}
    </form>
  );
}

// Bottone separato: `useFormStatus` legge lo stato del form che lo contiene, e
// funziona solo da dentro.
function Salva({ scrittura }: { scrittura: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn small secondary"
      type="submit"
      disabled={!scrittura || pending}
      aria-busy={pending}
      title={scrittura ? "Salva IBAN e intestatario sul partner e nel registro" : "Serve la chiave di scrittura"}
      style={pending ? { opacity: 0.75, cursor: "progress" } : undefined}
    >
      {pending ? "Salvo…" : "Salva"}
    </button>
  );
}
