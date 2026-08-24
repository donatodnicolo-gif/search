"use client";

import { useState, useTransition } from "react";
import { creaChiaveAction, revocaChiaveAction, riattivaChiaveAction, type EsitoChiave } from "@/lib/chiavi-azioni";
import { dataOraIt } from "@/lib/formato";

export type ChiaveUI = {
  id: string;
  nome: string;
  scrittura: boolean;
  attiva: boolean;
  creataIl: string;
  ultimoUso: string | null;
};

// Gestione delle chiavi con cui le altre app (Hub, Budgets…) leggono
// l'organico. La chiave in chiaro si vede UNA volta, appena creata.

export function Chiavi({ chiavi, suggeriti }: { chiavi: ChiaveUI[]; suggeriti: string[] }) {
  const [nome, setNome] = useState("");
  const [scrittura, setScrittura] = useState(false);
  const [esito, setEsito] = useState<EsitoChiave | null>(null);
  const [inCorso, avvia] = useTransition();

  const crea = () => {
    if (!nome.trim() || inCorso) return;
    avvia(async () => setEsito(await creaChiaveAction(nome, scrittura)));
  };

  const cambiaStato = (id: string, attiva: boolean) => {
    if (inCorso) return;
    avvia(async () => setEsito(attiva ? await revocaChiaveAction(id) : await riattivaChiaveAction(id)));
  };

  return (
    <>
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Nuova chiave</h2>
            <p className="card-sub">
              Una chiave per app, col nome dell&apos;app che la userà. Rigenerare un nome esistente
              spegne all&apos;istante la chiave vecchia.
            </p>
          </div>
        </div>
        <div className="form-inline">
          <div className="campo">
            <label>App client</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. deluxy-hub"
              list="app-suggerite"
            />
            <datalist id="app-suggerite">
              {suggeriti.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <label className="spunta" style={{ paddingBottom: 9 }}>
            <input type="checkbox" checked={scrittura} onChange={(e) => setScrittura(e.target.checked)} />
            scrittura
          </label>
          <button className="btn" onClick={crea} disabled={inCorso || !nome.trim()}>
            {inCorso ? "Creo…" : "Crea la chiave"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
          Oggi /api/v1 espone solo letture: una chiave di scrittura non ha ancora niente da scrivere.
        </p>

        {esito && (
          <div className={esito.ok ? "avviso-nota" : "avviso-errore"} style={{ marginTop: 12, marginBottom: 0 }}>
            {esito.messaggio}
            {esito.chiave && <div className="chiave-valore" style={{ marginTop: 8 }}>{esito.chiave}</div>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Chiavi esistenti</h2>
            <p className="card-sub">
              Si revocano, non si cancellano: l&apos;ultimo uso dice se una chiave serve davvero.
            </p>
          </div>
        </div>
        {chiavi.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-tertiary)" }}>
            Nessuna chiave ancora: creane una per il Hub e una per Budgets.
          </p>
        ) : (
          chiavi.map((c) => (
            <div key={c.id} className="riga-chiave">
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 550, fontSize: 14 }}>{c.nome}</div>
                <div className="sotto-nome">
                  creata {dataOraIt(new Date(c.creataIl))} · ultimo uso{" "}
                  {c.ultimoUso ? dataOraIt(new Date(c.ultimoUso)) : "mai"}
                </div>
              </div>
              <span className={`badge ${c.scrittura ? "blu" : ""}`}>
                <span className="dot" />
                {c.scrittura ? "lettura+scrittura" : "sola lettura"}
              </span>
              <span className={`badge ${c.attiva ? "verde" : "rosso"}`}>
                <span className="dot" />
                {c.attiva ? "attiva" : "revocata"}
              </span>
              <button className={`btn mini ${c.attiva ? "pericolo" : "ghost"}`} onClick={() => cambiaStato(c.id, c.attiva)} disabled={inCorso}>
                {c.attiva ? "Revoca" : "Riattiva"}
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
