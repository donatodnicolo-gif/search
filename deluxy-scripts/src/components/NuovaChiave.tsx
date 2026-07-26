"use client";

import { useActionState, useState } from "react";
import { creaChiaveApi, type EsitoChiave } from "@/app/actions";

// «Crea una chiave»: si dà un nome all'app che dovrà leggere i testi e ne esce
// una chiave, mostrata UNA SOLA VOLTA. Nel database resta solo l'impronta
// (SHA-256), quindi non c'è nessun posto da cui rileggerla dopo: se si perde,
// se ne rigenera una nuova e si aggiorna l'app che la usava.
export function NuovaChiave() {
  const [esito, azione, inCorso] = useActionState<EsitoChiave | null, FormData>(creaChiaveApi, null);
  const [copiato, setCopiato] = useState(false);

  async function copia(chiave: string) {
    try {
      await navigator.clipboard.writeText(chiave);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <>
      <form action={azione} className="modulo" style={{ marginBottom: 4 }}>
        <div className="campo-modulo">
          <label htmlFor="nome-chiave">Per quale app</label>
          <input
            id="nome-chiave"
            name="nome"
            required
            placeholder="Es. deluxy-messaging"
            autoComplete="off"
          />
          <span className="campo-aiuto">
            È il nome che comparirà nell&apos;elenco qui sotto e nei registri d&apos;uso.
          </span>
        </div>
        <div className="campo-modulo">
          <label htmlFor="permessi">Permessi</label>
          <select id="permessi" name="permessi" defaultValue="lettura">
            <option value="lettura">Sola lettura (legge i testi)</option>
            <option value="scrittura">Lettura e scrittura</option>
          </select>
          <span className="campo-aiuto">
            Oggi tutte le rotte sono in lettura: la scrittura è predisposta ma nessun endpoint la usa ancora.
          </span>
        </div>
        <div className="azioni-modulo largo" style={{ gridColumn: "1 / -1" }}>
          <label
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, color: "var(--text-secondary)", marginRight: "auto",
            }}
          >
            <input type="checkbox" name="rigenera" />
            Rigenera, se per quel nome una chiave esiste già (quella vecchia smette di funzionare)
          </label>
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Genero…" : "Genera la chiave"}
          </button>
        </div>
      </form>

      {esito?.errore && <div className="avviso-errore">{esito.errore}</div>}

      {esito?.chiave && (
        <div className="proposta" style={{ marginTop: 8 }}>
          <div className="proposta-testa">
            <span className="badge attenzione">copiala adesso — non si potrà più rileggere</span>
            <strong>{esito.nome}</strong>
          </div>
          <code className="chiave-mostrata">{esito.chiave}</code>
          <div className="azioni-modulo">
            <span className="campo-aiuto" style={{ marginRight: "auto" }}>
              Va nel <code className="inline">.env</code> dell&apos;app che la usa come{" "}
              <code className="inline">SCRIPTS_API_KEY</code>, e nella cassaforte del Hub.
            </span>
            <button type="button" className="btn" onClick={() => copia(esito.chiave as string)}>
              {copiato ? "Copiata" : "Copia la chiave"}
            </button>
          </div>
          {esito.avviso && <div className="avviso-attenzione" style={{ marginTop: 10 }}>{esito.avviso}</div>}
        </div>
      )}
    </>
  );
}
