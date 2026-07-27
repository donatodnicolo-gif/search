"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Le chiavi con cui le altre app Deluxy leggono e scrivono qui.
//
// Prima esistevano solo da terminale (`npm run chiave -- <nome>`): per
// collegare un'app bisognava avere il repo, il database e la voglia di aprire
// una shell. Ora si creano da qui.
//
// La chiave appena creata si vede UNA volta sola, in questa pagina, e non viene
// salvata da nessuna parte in chiaro: nel database c'è solo la sua impronta.
// Chi la perde ne fa un'altra — non c'è modo di rileggerla, ed è il punto.

export type RigaChiave = {
  id: string;
  nome: string;
  scrittura: boolean;
  attiva: boolean;
  creataIl: string;
  ultimoUso: string | null;
};

export function ChiaviApi({ chiavi }: { chiavi: RigaChiave[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [solaLettura, setSolaLettura] = useState(false);
  const [creata, setCreata] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  const [copiata, setCopiata] = useState(false);

  const crea = async () => {
    setErrore(null);
    setAttesa(true);
    try {
      const res = await fetch("/api/interno/chiavi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, solaLettura }),
      });
      const dati = await res.json();
      if (!res.ok) {
        setErrore(dati?.errore ?? "Non è stato possibile creare la chiave.");
        return;
      }
      setCreata(dati.chiave);
      setNome("");
      router.refresh();
    } catch (e) {
      setErrore(`Chiamata fallita: ${String(e).slice(0, 120)}`);
    } finally {
      setAttesa(false);
    }
  };

  const revoca = async (id: string, nomeChiave: string) => {
    if (!confirm(`Revocare la chiave "${nomeChiave}"? L'app che la usa smetterà di funzionare subito.`)) return;
    await fetch("/api/interno/chiavi", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  };

  const attive = chiavi.filter((c) => c.attiva);
  const revocate = chiavi.filter((c) => !c.attiva);

  return (
    <section className="scheda">
      <div className="scheda-titolo">Chiavi API — collegare le altre app</div>
      <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
        Con una di queste chiavi un&apos;altra app Deluxy (o lo script di Google Ads) legge da qui
        campagne, spesa e azioni, e può scriverci i dati che raccoglie. Si passa nell&apos;header{" "}
        <code>x-api-key</code>, sulle rotte <code>/api/v1/…</code>. Il nome serve a te: quando una
        chiave va revocata devi sapere cosa smetterà di funzionare.
      </p>

      {creata && (
        <div
          className="conferma"
          style={{ display: "block", marginBottom: 14, background: "rgba(184,150,62,.10)", borderColor: "var(--gold-strong)" }}
        >
          <div style={{ marginBottom: 8 }}>
            <b>Copiala adesso: non si potrà più rileggere.</b> Nel database resta solo la sua
            impronta, quindi né io né nessun altro può recuperarla dopo.
          </div>
          <code
            style={{ display: "block", padding: "10px 12px", background: "var(--surface)", borderRadius: 8, wordBreak: "break-all", fontSize: 13 }}
          >
            {creata}
          </code>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                navigator.clipboard?.writeText(creata);
                setCopiata(true);
              }}
            >
              {copiata ? "Copiata ✓" : "Copia"}
            </button>
            <button type="button" className="btn small ghost" onClick={() => { setCreata(null); setCopiata(false); }}>
              Ho finito, nascondila
            </button>
          </div>
        </div>
      )}

      {errore && (
        <div className="conferma" style={{ background: "rgba(200,40,40,.08)", borderColor: "var(--red)", marginBottom: 14 }}>
          {errore}
        </div>
      )}

      <div className="filtri" style={{ marginBottom: 16 }}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="A cosa serve? es. deluxy-budgets"
          spellCheck={false}
          style={{ minWidth: 260 }}
        />
        <label className="cella-sub" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={solaLettura} onChange={(e) => setSolaLettura(e.target.checked)} />
          solo lettura
        </label>
        <button className="btn small" type="button" onClick={crea} disabled={!nome.trim() || attesa}>
          {attesa ? "Creo…" : "Crea la chiave"}
        </button>
      </div>

      {attive.length === 0 ? (
        <div className="cella-sub">Nessuna chiave attiva: nessun&apos;altra app sta leggendo da qui.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Permessi</th>
                <th>Creata</th>
                <th>Ultimo uso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {attive.map((c) => (
                <tr key={c.id}>
                  <td className="cella-nome">{c.nome}</td>
                  <td>
                    <span className="pill" style={{ background: c.scrittura ? "rgba(184,150,62,.14)" : "rgba(0,0,0,.05)" }}>
                      {c.scrittura ? "lettura e scrittura" : "solo lettura"}
                    </span>
                  </td>
                  <td className="cella-muta">{new Date(c.creataIl).toLocaleDateString("it-IT")}</td>
                  <td className="cella-muta">
                    {c.ultimoUso ? (
                      new Date(c.ultimoUso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })
                    ) : (
                      // Una chiave creata e mai usata di solito vuol dire che
                      // l'app dall'altra parte non è mai stata configurata.
                      <span style={{ color: "var(--orange)" }}>mai usata</span>
                    )}
                  </td>
                  <td className="num">
                    <button type="button" className="btn small ghost" onClick={() => revoca(c.id, c.nome)}>
                      Revoca
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {revocate.length > 0 && (
        <p className="cella-sub" style={{ marginTop: 12 }}>
          Revocate: {revocate.map((c) => c.nome).join(", ")}. Restano in elenco con la data
          dell&apos;ultimo uso, che è quello che si guarda quando qualcosa smette di funzionare.
        </p>
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        <b>Una chiave per app</b>, non una per tutte: così revocarne una non spegne le altre, e
        dall&apos;ultimo uso si capisce chi sta ancora chiamando. Dai <b>solo lettura</b> a chi deve
        soltanto guardare i numeri — scrittura serve solo a chi manda dati qui dentro, come lo
        script di Google Ads.
      </p>
    </section>
  );
}
