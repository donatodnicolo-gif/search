"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type MeseAdv = { mese: number; banca: number; campagne: number; differenza: number; giaSpostato: number };

export function AdvCompetenza({
  anno,
  mesi,
  totBanca,
  totCampagne,
  totDifferenza,
  totGiaSpostato,
  coperturaCompleta,
  avvertenze,
}: {
  anno: number;
  mesi: MeseAdv[];
  totBanca: number;
  totCampagne: number;
  totDifferenza: number;
  totGiaSpostato: number;
  coperturaCompleta: boolean;
  avvertenze: string[];
}) {
  const router = useRouter();
  const [annoDest, setAnnoDest] = useState(anno - 1);
  const [meseDest, setMeseDest] = useState(12);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  async function sposta() {
    if (
      !confirm(
        `Portare ${eur(totDifferenza)} di pubblicità in competenza ${annoDest}?\n\n` +
          `Cambia il conto economico di due anni: ${anno} resta com'è (quella somma nelle campagne non c'era) ` +
          `e il ${annoDest} si carica di ${eur(totDifferenza)} di pubblicità in più.\n\n` +
          `Ogni riga resta cancellabile una per una qui sotto.`
      )
    ) {
      return;
    }
    setBusy(true);
    setErrore(null);
    setEsito(null);
    const res = await fetch("/api/competenza/adv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anno, annoCompetenza: annoDest, meseCompetenza: meseDest }),
    });
    setBusy(false);
    const b = await res.json().catch(() => null);
    if (!res.ok) {
      setErrore(b?.error ?? "Non è stato possibile creare le rettifiche.");
      return;
    }
    setEsito(`${b.create} rettifiche create per ${eur(b.spostato)}.`);
    router.refresh();
  }

  const mesiConDati = mesi.filter((m) => m.banca > 0 || m.campagne > 0);

  return (
    <>
      <h2 className="section-title">Pubblicità: quello che ha pagato il conto, e quello che è costato fare campagne</h2>

      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}
      {esito && <div className="card" style={{ marginBottom: 12, borderColor: "var(--green)" }}>{esito}</div>}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mese</th>
                <th className="num">Uscito dal conto</th>
                <th className="num">Campagne (Marketing)</th>
                <th className="num">Differenza</th>
                <th className="num">Già in competenza altrove</th>
              </tr>
            </thead>
            <tbody>
              {mesiConDati.map((m) => (
                <tr key={m.mese}>
                  <td>{MESI[m.mese - 1]}</td>
                  <td className="num">{eur(m.banca)}</td>
                  <td className="num">{eur(m.campagne)}</td>
                  <td className={`num ${m.differenza > 0 ? "neg" : "muted"}`} style={{ fontWeight: 600 }}>
                    {m.differenza > 0 ? eur(m.differenza) : "—"}
                  </td>
                  <td className="num muted">{m.giaSpostato > 0 ? eur(m.giaSpostato) : "—"}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale {anno}</td>
                <td className="num">{eur(totBanca)}</td>
                <td className="num">{eur(totCampagne)}</td>
                <td className="num neg">{eur(totDifferenza)}</td>
                <td className="num muted">{totGiaSpostato > 0 ? eur(totGiaSpostato) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <strong>La competenza della pubblicità è l&apos;anno della transazione.</strong> Verificato sui
        movimenti, non per principio: Google e Meta addebitano <strong>a soglia</strong> — importi fissi ogni
        due o tre giorni per tutto il mese — quindi il denaro esce entro pochi giorni dalla campagna. Su tutti
        i movimenti pubblicitari che Qonto conosce, quelli con <em>anno di emissione</em> diverso
        dall&apos;<em>anno di regolamento</em> sono <strong>zero</strong>: la pubblicità non scavalca mai il
        capodanno. L&apos;unica coda è il residuo sotto soglia addebitato l&apos;1–2 del mese, che riguarda il
        mese prima, non l&apos;anno prima.
        <div style={{ marginTop: 8 }}>
          Quindi la differenza qui sopra <strong>non si sposta</strong>: non è competenza di un altro
          esercizio, è spesa di quest&apos;anno che Marketing non vede (account non collegati) più voci che
          pubblicità non sono e vanno tolte dalla categoria nel{" "}
          <a href="/cfo" style={{ color: "var(--blue)" }}>CFO</a>. Il bottone resta per i casi veri —
          una fattura di dicembre pagata a gennaio — e va usato su quelli, non sul totale.
          {!coperturaCompleta && avvertenze.length > 0 && (
            <>
              {" "}
              Marketing dichiara la copertura incompleta: {avvertenze.join(" ")}
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
            Anno di competenza
            <select value={annoDest} onChange={(e) => setAnnoDest(Number(e.target.value))} style={{ padding: "6px 8px" }}>
              {[anno - 2, anno - 1, anno + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
            Mese
            <select value={meseDest} onChange={(e) => setMeseDest(Number(e.target.value))} style={{ padding: "6px 8px" }}>
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy || totDifferenza <= 0} onClick={sposta}>
            {busy ? "Sposto…" : `Porta ${eur(totDifferenza)} in competenza ${annoDest}`}
          </button>
        </div>
        <p className="page-caption" style={{ marginBottom: 0 }}>
          La differenza di ogni mese si divide fra le <strong>controparti vere</strong> di quel mese, in
          proporzione a quanto ciascuna ha preso: ogni rettifica nomina un addebito che esiste, altrimenti nel
          CFO resterebbe un importo senza categoria che non entra in nessuna voce di P&amp;L. Le righe compaiono
          nell&apos;elenco qui sotto e si cancellano una per una. Premere due volte non raddoppia: quello che è
          già stato spostato è scalato dalla differenza.
        </p>
      </div>
    </>
  );
}
