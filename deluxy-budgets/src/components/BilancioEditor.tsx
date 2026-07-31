"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";
import { SCHEMA, VOCI_FISCALI, totali, valoreSezione, type Voce } from "@/lib/bilancio-voci";

type Valore = { codice: string; importo: number; mesi: number[] | null; nota: string | null };

export function BilancioEditor({ anno, valori }: { anno: number; valori: Valore[] }) {
  const router = useRouter();
  const mappa = new Map(valori.map((v) => [v.codice, v]));
  const importi = new Map(valori.map((v) => [v.codice, v.importo]));
  const t = totali(importi);

  const [busy, setBusy] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [apriMesi, setApriMesi] = useState<string | null>(null);
  const [mesi, setMesi] = useState<string[]>(Array(12).fill(""));
  const [testo, setTesto] = useState("");
  const [esitoImport, setEsitoImport] = useState<string | null>(null);

  async function salva(codice: string, importo: string, mesiDaSalvare?: number[]) {
    setBusy(codice);
    setErrore(null);
    const res = await fetch("/api/bilancio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anno, codice, importo, mesi: mesiDaSalvare }),
    });
    setBusy(null);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Salvataggio non riuscito.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function importa() {
    setBusy("import");
    setErrore(null);
    setEsitoImport(null);
    const res = await fetch("/api/bilancio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anno, testo }),
    });
    setBusy(null);
    const b = await res.json().catch(() => null);
    if (!res.ok) { setErrore(b?.error ?? "Import non riuscito."); return; }
    setEsitoImport(
      `${b.importate.length} voci caricate${b.ignorate.length ? ` · ${b.ignorate.length} righe non riconosciute (codice o importo)` : ""}.`
    );
    setTesto("");
    router.refresh();
  }

  function apriRipartizione(v: Voce) {
    const attuale = mappa.get(v.codice);
    setApriMesi(v.codice);
    setMesi(attuale?.mesi ? attuale.mesi.map((x) => String(x)) : Array(12).fill(""));
  }

  async function salvaMesi(codice: string) {
    const numeri = mesi.map((m) => Number(String(m).replace(",", ".")) || 0);
    const ok = await salva(codice, String(mappa.get(codice)?.importo ?? 0), numeri);
    if (ok) setApriMesi(null);
  }

  const sommaMesiAperti = mesi.reduce((s, m) => s + (Number(String(m).replace(",", ".")) || 0), 0);

  return (
    <>
      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Voce</th>
                <th>Descrizione</th>
                <th className="num" style={{ width: 160 }}>Importo {anno}</th>
                <th className="num" style={{ width: 150 }}>Per mese</th>
              </tr>
            </thead>
            <tbody>
              {SCHEMA.map((v) => {
                const sezione = v.tipo === "sezione";
                const attuale = mappa.get(v.codice);
                const valore = sezione ? valoreSezione(v.codice, t) : attuale?.importo ?? 0;
                return (
                  <tr key={v.codice} className={v.codice === "UTILE" ? "tot" : undefined}>
                    <td style={{ fontWeight: sezione ? 700 : 500 }}>{sezione ? "" : v.codice}</td>
                    <td style={{ fontWeight: sezione ? 600 : 400 }}>
                      {/* Il nome della voce apre il dettaglio: da quale
                          categoria di banca è fatta, con quali controparti, e
                          dove cambiarne l'associazione. Un numero di bilancio
                          senza il modo di aprirlo si può solo credere o non
                          credere. */}
                      {sezione ? (
                        v.nome
                      ) : (
                        <Link href={`/conto-economico/${v.codice}?anno=${anno}`} style={{ color: "var(--blue)" }}>
                          {v.nome}
                        </Link>
                      )}
                      {v.aiuto && <div className="muted" style={{ fontSize: 11.5 }}>{v.aiuto}</div>}
                    </td>
                    <td className="num">
                      {sezione ? (
                        <span style={{ fontWeight: 700, color: valore < 0 ? "var(--red)" : undefined }}>
                          {eur(valore)}
                        </span>
                      ) : (
                        <input
                          defaultValue={attuale ? String(attuale.importo) : ""}
                          placeholder="0"
                          disabled={busy === v.codice}
                          onBlur={(e) => {
                            const nuovo = e.target.value.trim();
                            if (nuovo === "" && !attuale) return;
                            if (Number(nuovo.replace(",", ".")) !== attuale?.importo) salva(v.codice, nuovo || "0");
                          }}
                          style={{ width: 130, padding: "5px 7px", textAlign: "right" }}
                        />
                      )}
                    </td>
                    <td className="num">
                      {sezione ? null : attuale?.mesi ? (
                        <button className="btn secondary small" onClick={() => apriRipartizione(v)}>
                          ripartita ▾
                        </button>
                      ) : (
                        <button className="btn secondary small" onClick={() => apriRipartizione(v)}>
                          solo annua ▾
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* I due numeri che il bilancio non contiene e che decidono le imposte.
          Separati dallo schema di legge perché voci di conto economico non sono:
          non entrano in nessun totale, e metterli in mezzo alle altre farebbe
          credere il contrario. Restano vuoti finché non arrivano dal
          commercialista — un valore inventato qui sposta l'IRES di migliaia di
          euro con l'aria di essere calcolato. */}
      <h2 className="section-title">Dati fiscali dal commercialista</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quello che il bilancio non dice, ma cambia le imposte</th>
                <th className="num" style={{ width: 160 }}>Importo {anno}</th>
              </tr>
            </thead>
            <tbody>
              {VOCI_FISCALI.map((v) => {
                const attuale = mappa.get(v.codice);
                return (
                  <tr key={v.codice}>
                    <td>
                      {v.nome}
                      {v.aiuto && <div className="muted" style={{ fontSize: 11.5 }}>{v.aiuto}</div>}
                    </td>
                    <td className="num">
                      <input
                        defaultValue={attuale ? String(attuale.importo) : ""}
                        placeholder="non comunicato"
                        disabled={busy === v.codice}
                        onBlur={(e) => {
                          const nuovo = e.target.value.trim();
                          if (nuovo === "" && !attuale) return;
                          if (Number(nuovo.replace(",", ".")) !== attuale?.importo) salva(v.codice, nuovo || "0");
                        }}
                        style={{ width: 130, padding: "5px 7px", textAlign: "right" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        Finché queste caselle sono vuote, la stima in{" "}
        <Link href="/tasse" style={{ color: "var(--blue)" }}>Tasse</Link> le dichiara mancanti invece di far finta
        che valgano zero: <strong>le perdite pregresse abbassano l&apos;IRES</strong> (fino all&apos;80%
        dell&apos;imponibile) e <strong>gli ammortamenti eccedenti la alzano</strong>. Sul 2024 le variazioni vere
        erano 70.100 € e le percentuali per categoria ne spiegavano il 2%: il resto è di questo tipo.
      </p>

      {apriMesi && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>
            Ripartizione mensile — {SCHEMA.find((v) => v.codice === apriMesi)?.nome}
          </h3>
          <p className="page-caption" style={{ marginTop: 0 }}>
            La somma dei dodici mesi deve fare esattamente l&apos;importo annuo{" "}
            (<strong>{eur(mappa.get(apriMesi)?.importo ?? 0)}</strong>): una ripartizione che non torna col totale
            viene rifiutata qui, invece di essere scoperta fra sei mesi in una tabella. Lasciandola vuota la voce
            resta <strong>solo annua</strong> e le viste mensili lo dicono, invece di spalmarla in dodicesimi.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {MESI.map((m, i) => (
              <label key={m} style={{ display: "grid", gap: 3, fontSize: 12 }}>
                {m}
                <input
                  value={mesi[i]}
                  onChange={(e) => setMesi((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  style={{ width: 88, padding: "5px 7px", textAlign: "right" }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <button className="btn" disabled={busy === apriMesi} onClick={() => salvaMesi(apriMesi)}>
              {busy === apriMesi ? "Salvo…" : "Salva ripartizione"}
            </button>
            <button className="btn secondary" onClick={() => setApriMesi(null)}>Chiudi</button>
            <span className={Math.abs(sommaMesiAperti - (mappa.get(apriMesi)?.importo ?? 0)) > 1 ? "neg" : "pos"}>
              somma: {eur(sommaMesiAperti)}
            </span>
          </div>
        </div>
      )}

      <h2 className="section-title">Carica il bilancio dal file del commercialista</h2>
      <div className="card">
        <p className="page-caption" style={{ marginTop: 0 }}>
          Copia le righe dal PDF o dall&apos;Excel e incollale qui: una per riga, <strong>codice e importo</strong>{" "}
          (es. <code>B7 412.350,20</code>). Vanno bene tabulazione, punto e virgola o due spazi come separatore, e i
          numeri all&apos;italiana. Le righe che non hanno un codice dello schema vengono <strong>ignorate e
          contate</strong>: nessuna riga finisce in una voce a caso.
        </p>
        <textarea
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          rows={6}
          placeholder={"A1\t1.234.567,00\nB6\t210.000,00\nB7\t412.350,20"}
          style={{ width: "100%", padding: 10, font: "13px/1.5 ui-monospace, monospace" }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button className="btn" disabled={busy === "import" || !testo.trim()} onClick={importa}>
            {busy === "import" ? "Carico…" : "Carica"}
          </button>
          {esitoImport && <span className="muted">{esitoImport}</span>}
        </div>
      </div>
    </>
  );
}
