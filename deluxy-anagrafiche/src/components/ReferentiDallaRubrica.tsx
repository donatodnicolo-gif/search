"use client";

import { useState } from "react";
import { aggiungiReferentiDaRubrica } from "@/lib/azioni";
import { CercaInRubrica } from "./CercaInRubrica";

// «Dalla rubrica» sulla scheda: le persone spuntate diventano subito referenti
// di questa sede. Qui si creano davvero (a differenza del form di modifica, che
// riempie righe da salvare) perché sulla scheda non c'è nessun modulo aperto da
// perdere — e perché con più persone insieme un modulo a una riga non basta.
export function ReferentiDallaRubrica({
  partnerId,
  nome,
  citta,
}: {
  partnerId: string;
  nome: string;
  citta: string | null;
}) {
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  return (
    <span className="rubrica-nel-modulo">
      <CercaInRubrica
        partnerNome={nome}
        citta={citta}
        onScegli={async (persone) => {
          setEsito(null);
          setErrore(null);
          const r = await aggiungiReferentiDaRubrica(partnerId, persone);
          if (!r.ok) {
            setErrore(r.errore);
            return;
          }
          const parti = [];
          if (r.aggiunti) parti.push(`${r.aggiunti} ${r.aggiunti === 1 ? "referente aggiunto" : "referenti aggiunti"}`);
          if (r.saltati) parti.push(`${r.saltati} già in elenco`);
          setEsito(parti.join(" · ") || "Nessuna novità");
        }}
      />
      {esito && <span className="testo-guida">{esito}</span>}
      {errore && <span className="riconc-errore">{errore}</span>}
    </span>
  );
}
