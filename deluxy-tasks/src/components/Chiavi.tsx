"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creaChiaveAction, revocaChiaveAction, riattivaChiaveAction } from "@/lib/chiavi-actions";
import { Vuoto } from "@/components/Vuoto";

// La pagina delle chiavi API: da qui si apre il registro a un'altra app senza
// passare dalla riga di comando. La chiave si vede UNA volta, appena creata.

export type ChiaveUI = {
  id: string;
  nome: string;
  scrittura: boolean;
  attiva: boolean;
  creataIl: string;
  ultimoUso: string | null;
};

function quando(iso: string | null): string {
  if (!iso) return "mai";
  return new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Chiavi({ chiavi, suggeriti }: { chiavi: ChiaveUI[]; suggeriti: string[] }) {
  const [nome, setNome] = useState("");
  const [scrittura, setScrittura] = useState(true);
  const [nuova, setNuova] = useState<{ nome: string; valore: string } | null>(null);
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null);
  const [copiata, setCopiata] = useState(false);
  const [inCorso, start] = useTransition();
  const router = useRouter();

  const esistente = chiavi.find((c) => c.nome === nome.trim().toLowerCase());

  const crea = () =>
    start(async () => {
      setStato(null);
      setNuova(null);
      setCopiata(false);
      const esito = await creaChiaveAction(nome, scrittura);
      setStato({ ok: esito.ok, testo: esito.messaggio });
      if (esito.ok && esito.chiave) {
        setNuova({ nome: nome.trim().toLowerCase(), valore: esito.chiave });
        setNome("");
        router.refresh();
      }
    });

  const cambiaStato = (c: ChiaveUI) =>
    start(async () => {
      if (
        c.attiva &&
        !window.confirm(
          `Revocare la chiave di «${c.nome}»? Da subito quell'app non potrà più leggere né scrivere qui.`,
        )
      )
        return;
      const esito = c.attiva ? await revocaChiaveAction(c.id) : await riattivaChiaveAction(c.id);
      setStato({ ok: esito.ok, testo: esito.messaggio });
      router.refresh();
    });

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="cerca"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome dell'app (es. mail)"
            list="app-note"
            autoComplete="off"
            style={{ flex: 1, minWidth: 220 }}
          />
          <datalist id="app-note">
            {suggeriti.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={scrittura}
              onChange={(e) => setScrittura(e.target.checked)}
            />
            può scrivere
          </label>
          <button
            type="button"
            className="btn"
            onClick={crea}
            disabled={inCorso || !nome.trim()}
          >
            {inCorso ? "Genero…" : esistente ? "Rigenera" : "Genera chiave"}
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 10 }}>
          Senza «può scrivere» la chiave legge soltanto: l'app vede le attività ma non ne crea né
          ne chiude. {esistente && (
            <strong>
              «{esistente.nome}» esiste già: rigenerarla manda in pensione la chiave di prima, che
              va ricopiata ovunque fosse.
            </strong>
          )}
        </p>
      </div>

      {nuova && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--gold)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Chiave di «{nuova.nome}» — si vede solo adesso
          </div>
          <code
            style={{
              display: "block",
              wordBreak: "break-all",
              background: "var(--fill)",
              borderRadius: "var(--radius-m)",
              padding: "10px 12px",
              fontSize: 12.5,
            }}
          >
            {nuova.valore}
          </code>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(nuova.valore).then(() => setCopiata(true));
              }}
            >
              {copiata ? "Copiata" : "Copia"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setNuova(null)}>
              Ho finito
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 10 }}>
            Va incollata nell'app che la userà: in AI Mail in «Impostazioni App → Registro
            Attività», altrove nella variabile <code>TASKS_API_KEY</code> o nella cassaforte del
            Hub. Qui non resta: nel database c'è solo la sua impronta.
          </p>
        </div>
      )}

      {stato && (
        <p style={{ fontSize: 13, color: stato.ok ? "var(--green)" : "var(--red)", marginBottom: 14 }}>
          {stato.testo}
        </p>
      )}

      {chiavi.length === 0 ? (
        <Vuoto icona="chiave" titolo="Nessuna chiave">
          Nessun'altra app può ancora leggere o scrivere qui: genera la prima chiave con il campo
          qui sopra.
        </Vuoto>
      ) : (
        <div className="lista">
          {chiavi.map((c) => (
            <div key={c.id} className="riga-chiave">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.nome}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  {c.scrittura ? "legge e scrive" : "sola lettura"} · creata {quando(c.creataIl)} ·
                  usata {quando(c.ultimoUso)}
                </div>
              </div>
              <span className="badge">
                <span
                  className="dot"
                  style={{ background: c.attiva ? "var(--green)" : "var(--text-tertiary)" }}
                />
                {c.attiva ? "attiva" : "revocata"}
              </span>
              {/* «Revoca» è distruttiva: stile .danger (testo red su fill), non
                  lo stesso ghost di «Annulla» (Libro cap.3). */}
              <button
                type="button"
                className={`btn ${c.attiva ? "danger" : "ghost"}`}
                onClick={() => cambiaStato(c)}
                disabled={inCorso}
              >
                {c.attiva ? "Revoca" : "Riattiva"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
