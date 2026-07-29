"use client";

import { useState } from "react";
import { aggiungiReferente } from "@/lib/azioni";

// ＋ Referente sulla scheda: aggiunge una persona a QUESTA sede senza aprire il
// form completo dell'anagrafica. Le sedi di una stessa insegna hanno referenti
// diversi — il direttore di Montenapoleone non è quello di Corso Como — e
// devono potersi compilare una per una.
export function AggiungiReferente({ partnerId, nome }: { partnerId: string; nome: string }) {
  const [aperto, setAperto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  if (!aperto) {
    return (
      <button
        type="button"
        className="btn btn-secondario"
        style={{ fontSize: 12.5, padding: "6px 14px" }}
        onClick={() => setAperto(true)}
        title={`Aggiungi una persona di riferimento di ${nome}`}
      >
        ＋ Referente
      </button>
    );
  }

  return (
    <form
      className="modulo modulo-contatto riga-nuovo-referente"
      action={async (fd) => {
        setSalvo(true);
        try {
          const esito = await aggiungiReferente(partnerId, fd);
          if (esito.ok) {
            setAperto(false);
            setErrore(null);
          } else {
            setErrore(esito.errore);
          }
        } finally {
          setSalvo(false);
        }
      }}
    >
      {errore && <div className="avviso-errore campo-modulo largo">{errore}</div>}
      <div className="campo-modulo">
        <label htmlFor="nuovo-ruolo">Ruolo</label>
        <input id="nuovo-ruolo" name="ruolo" placeholder="STORE MANAGER" />
      </div>
      <div className="campo-modulo">
        <label htmlFor="nuovo-nome">Nome</label>
        <input id="nuovo-nome" name="nome" autoFocus />
      </div>
      <div className="campo-modulo">
        <label htmlFor="nuovo-telefono">Telefono</label>
        <input id="nuovo-telefono" name="telefono" />
      </div>
      <div className="campo-modulo">
        <label htmlFor="nuovo-email">Email</label>
        <input id="nuovo-email" name="email" type="email" />
      </div>
      <div className="azioni-modulo campo-modulo largo">
        <button type="button" className="btn btn-secondario" onClick={() => { setAperto(false); setErrore(null); }}>
          Annulla
        </button>
        <button type="submit" className="btn" disabled={salvo}>
          {salvo ? "Aggiungo…" : "Aggiungi referente"}
        </button>
      </div>
    </form>
  );
}
