"use client";

import { useState } from "react";
import { aggiungiReferente } from "@/lib/azioni";
import { CercaInRubrica } from "./CercaInRubrica";

const VUOTO = { ruolo: "", nome: "", telefono: "", email: "" };

// ＋ Referente sulla scheda: aggiunge una persona a QUESTA sede senza aprire il
// form completo dell'anagrafica. Le sedi di una stessa insegna hanno referenti
// diversi — il direttore di Montenapoleone non è quello di Corso Como — e
// devono potersi compilare una per una.
// I campi si possono anche pescare dalla rubrica Google invece di ridigitarli.
export function AggiungiReferente({
  partnerId,
  nome,
  citta,
}: {
  partnerId: string;
  nome: string;
  citta: string | null;
}) {
  const [aperto, setAperto] = useState(false);
  const [campi, setCampi] = useState(VUOTO);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  function chiudi() {
    setAperto(false);
    setCampi(VUOTO);
    setErrore(null);
  }

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
          if (esito.ok) chiudi();
          else setErrore(esito.errore);
        } finally {
          setSalvo(false);
        }
      }}
    >
      {errore && <div className="avviso-errore campo-modulo largo">{errore}</div>}
      <div className="campo-modulo">
        <label htmlFor="nuovo-ruolo">Ruolo</label>
        <input
          id="nuovo-ruolo"
          name="ruolo"
          placeholder="STORE MANAGER"
          value={campi.ruolo}
          onChange={(e) => setCampi({ ...campi, ruolo: e.target.value })}
        />
      </div>
      <div className="campo-modulo">
        <label htmlFor="nuovo-nome">Nome</label>
        <input
          id="nuovo-nome"
          name="nome"
          autoFocus
          value={campi.nome}
          onChange={(e) => setCampi({ ...campi, nome: e.target.value })}
        />
      </div>
      <div className="campo-modulo">
        <label htmlFor="nuovo-telefono">Telefono</label>
        <input
          id="nuovo-telefono"
          name="telefono"
          value={campi.telefono}
          onChange={(e) => setCampi({ ...campi, telefono: e.target.value })}
        />
      </div>
      <div className="campo-modulo">
        <label htmlFor="nuovo-email">Email</label>
        <input
          id="nuovo-email"
          name="email"
          type="email"
          value={campi.email}
          onChange={(e) => setCampi({ ...campi, email: e.target.value })}
        />
      </div>
      <div className="azioni-modulo campo-modulo largo">
        <CercaInRubrica
          partnerNome={nome}
          citta={citta}
          onScegli={(p) =>
            setCampi({
              ruolo: p.ruolo ?? campi.ruolo,
              nome: p.nome,
              telefono: p.telefono ?? "",
              email: p.email ?? "",
            })
          }
        />
        <span style={{ marginRight: "auto" }} />
        <button type="button" className="btn btn-secondario" onClick={chiudi}>
          Annulla
        </button>
        <button type="submit" className="btn" disabled={salvo}>
          {salvo ? "Aggiungo…" : "Aggiungi referente"}
        </button>
      </div>
    </form>
  );
}
