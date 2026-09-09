"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { salvaDatiBancariInline, ignoraIbanSuggerito, type EsitoSalvataggio } from "@/lib/riconciliazione-actions";

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
  ibanRegistro,
  intestatarioRegistro,
  ibanIgnorato,
  ficNome,
  scrittura,
}: {
  partnerId: string;
  anagraficaId: string | null;
  ibanIniziale: string;
  ibanSuggerito: string | null;
  intestatarioIniziale: string;
  intestatarioSuggerito: string | null;
  /** L'IBAN che il registro ha già: se c'è, qui non si chiede niente. */
  ibanRegistro?: string | null;
  intestatarioRegistro?: string | null;
  ibanIgnorato?: boolean;
  ficNome: string;
  scrittura: boolean;
}) {
  const [esito, azione] = useActionState<EsitoSalvataggio, FormData>(
    salvaDatiBancariInline.bind(null, partnerId, anagraficaId),
    null
  );
  const [esitoIgnora, azioneIgnora] = useActionState<EsitoSalvataggio, FormData>(
    async (_p: EsitoSalvataggio, fd: FormData) =>
      ignoraIbanSuggerito(ficNome, partnerId, fd.get("ignora") === "1"),
    null
  );

  // ⭐ 09/09/2026 (richiesta dell'utente). Il partner l'IBAN se lo scrive da
  // solo sull'app delivery, con un codice via mail, e finisce nel registro.
  // Se là c'è, qui non si chiede niente: mostrarlo come «da riconciliare»
  // farebbe sembrare che manchi, e inviterebbe a incollarci sopra un conto
  // DEDOTTO dai bonifici — cioè a sostituire un dato dichiarato dal partner con
  // uno indovinato da noi.
  if (ibanRegistro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
        <span style={{ fontFamily: "ui-monospace, monospace" }}>{ibanRegistro}</span>
        <span style={{ color: "var(--text-secondary)" }}>
          {intestatarioRegistro || <em>intestatario non indicato</em>}
        </span>
        <span className="badge green" style={{ alignSelf: "flex-start", fontSize: 11 }}>
          <span className="dot" />già nel registro
        </span>
        {!intestatarioRegistro && (
          <span style={{ fontSize: 11, color: "var(--gold-strong, #8a6d2f)" }}>
            manca l&apos;intestatario: la banca lo confronta con l&apos;IBAN
          </span>
        )}
      </div>
    );
  }

  // Proposta messa da parte: resta la via per ripensarci.
  if (ibanIgnorato) {
    return (
      <form action={azioneIgnora} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        <span className="muted">Proposta dai bonifici messa da parte</span>
        <input type="hidden" name="ignora" value="0" />
        <button className="btn small secondary" type="submit" disabled={!scrittura} style={{ alignSelf: "flex-start" }}>
          Rimettila in vista
        </button>
        {esitoIgnora && (
          <span style={{ fontSize: 11.5, color: esitoIgnora.ok ? "var(--green)" : "var(--red)" }}>
            {esitoIgnora.ok ? "✓ " : "✕ "}{esitoIgnora.testo}
          </span>
        )}
      </form>
    );
  }

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
      {/* «Ignora» esiste perché l'IBAN proposto nasce da una somiglianza di
          NOMI sui bonifici già fatti: a volte è un omonimo o un pagamento
          girato a un terzo. Senza, l'unica uscita era salvare un conto forse
          sbagliato oppure ritrovarselo proposto a ogni apertura. Mette a tacere
          la PROPOSTA, non tocca l'IBAN del partner. */}
      {ibanSuggerito && !ibanIniziale && (
        <button
          className="btn small secondary"
          type="submit"
          name="ignora"
          value="1"
          formAction={azioneIgnora}
          disabled={!scrittura}
          title="Il conto proposto dai bonifici non è il suo: non riproporlo. L'IBAN del partner non viene toccato."
          style={{ alignSelf: "flex-start", fontSize: 12 }}
        >
          Ignora la proposta
        </button>
      )}
      {esitoIgnora && (
        <span style={{ fontSize: 11.5, color: esitoIgnora.ok ? "var(--green)" : "var(--red)" }}>
          {esitoIgnora.ok ? "✓ " : "✕ "}{esitoIgnora.testo}
        </span>
      )}
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
