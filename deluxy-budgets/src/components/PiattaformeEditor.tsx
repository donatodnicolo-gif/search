"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI, pct } from "@/lib/format";

type Piattaforma = {
  id: string;
  nome: string;
  colore: string | null;
  split: Record<number, number>;
  // Vero quando questa ripartizione e scritta per questo brand; falso quando e
  // ereditata da quella d azienda.
  propria: boolean;
  // La spesa **vera** di questa piattaforma, mese per mese (null = non
  // misurata: mese aperto, Marketing muto, o canale che Marketing non ha).
  speso: (number | null)[] | null;
  // Il canale di Marketing abbinato, per poterlo dichiarare in pagina.
  canale: string | null;
};

const COLORI = [
  { key: "blue", label: "Blu" },
  { key: "purple", label: "Viola" },
  { key: "green", label: "Verde" },
  { key: "gold", label: "Oro" },
  { key: "orange", label: "Arancio" },
  { key: "neutral", label: "Grigio" },
];

export function PiattaformeEditor({
  year,
  ambito,
  budgetMese,
  primoMeseAperto,
  quandoSalvata,
  soloLettura,
  piattaforme,
}: {
  year: number;
  // Per quale brand si sta scrivendo: stringa vuota = azienda.
  ambito: string;
  budgetMese: number[]; // budget ADV per mese, indice 0..11
  // Primo mese ancora da spendere: prima di questo si guarda il consuntivo.
  primoMeseAperto: number;
  // Quando questa ripartizione e stata salvata l ultima volta, gia formattata
  // sul fuso italiano dal server. null = mai passata da questa pagina.
  quandoSalvata: string | null;
  // La vista somma non si scrive: e il risultato di quello che gli altri hanno
  // deciso. Le caselle restano leggibili ma bloccate, e il bottone sparisce —
  // un bottone che non puo fare niente e peggio di nessun bottone.
  soloLettura: boolean;
  piattaforme: Piattaforma[];
}) {
  const router = useRouter();
  // % per `${piattaformaId}:${month}`
  const [perc, setPerc] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of piattaforme) for (let m = 1; m <= 12; m++) init[`${p.id}:${m}`] = p.split[m] ?? 0;
    return init;
  });
  const [nuovo, setNuovo] = useState<{ nome: string; colore: string } | null>(null);
  const [salvo, setSalvo] = useState(false);
  // L esito del salvataggio: **con l ora**, perche «salvata» senza quando non
  // distingue il salvataggio di adesso da quello di dieci minuti fa.
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  // ---- Un mese gia chiuso non si ripartisce: si e gia ripartito ----
  //
  // Li la riga non e «budget x percentuale» ma la **spesa vera** di quella
  // piattaforma, e la percentuale accanto e quella che ne e uscita. La casella
  // e in sola lettura: i soldi sono usciti, riscrivere la percentuale non li
  // riporta indietro.
  const chiuso = (m: number) => m < primoMeseAperto;
  const spesoDi = (p: Piattaforma, m: number) => (chiuso(m) ? p.speso?.[m - 1] ?? null : null);
  const misurato = (p: Piattaforma, m: number) => spesoDi(p, m) !== null;
  // Il totale del mese: sui mesi chiusi e la somma di quello che le piattaforme
  // hanno **davvero speso**, non il budget — cosi il totale somma le sue caselle.
  const totaleMese = (m: number) =>
    chiuso(m) && piattaforme.some((p) => misurato(p, m))
      ? piattaforme.reduce((s, p) => s + (spesoDi(p, m) ?? 0), 0)
      : budgetMese[m - 1];

  const getPct = (id: string, m: number) => perc[`${id}:${m}`] ?? 0;
  const importo = (id: string, m: number) => {
    const p = piattaforme.find((x) => x.id === id);
    const vero = p ? spesoDi(p, m) : null;
    return vero !== null ? vero : (totaleMese(m) * getPct(id, m)) / 100;
  };
  // La percentuale che si vede: misurata dove il mese e chiuso, decisa dove no.
  const pctMostrata = (p: Piattaforma, m: number) => {
    const vero = spesoDi(p, m);
    const tot = totaleMese(m);
    if (vero === null || tot <= 0) return getPct(p.id, m);
    return Math.round((vero / tot) * 1000) / 10;
  };

  const budgetAnno = Array.from({ length: 12 }, (_, i) => totaleMese(i + 1)).reduce((s, v) => s + v, 0);

  const totalePctMese = (m: number) => piattaforme.reduce((s, p) => s + pctMostrata(p, m), 0);
  const totaleAnnoPiattaforma = (id: string) => {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += importo(id, m);
    return t;
  };
  // Quanto di quel totale è **già uscito** e quanto è ancora una decisione:
  // sommati nell'importo non si distinguono, e sono due cose diverse.
  const dettaglioAnno = (p: Piattaforma) => {
    let speso = 0;
    let daSpendere = 0;
    for (let m = 1; m <= 12; m++) {
      const vero = spesoDi(p, m);
      if (vero !== null) speso += vero;
      else daSpendere += importo(p.id, m);
    }
    return speso > 0
      ? `${eur(speso)} già spesi nei mesi chiusi + ${eur(daSpendere)} a budget su quelli che restano.`
      : `${eur(daSpendere)} a budget: nessun mese chiuso misurato per questa piattaforma.`;
  };
  const allocatoAnno = useMemo(
    () => piattaforme.reduce((s, p) => s + totaleAnnoPiattaforma(p.id), 0),
    [piattaforme, perc, budgetMese] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // La quota dell anno coperta dalle piattaforme: e la somma vera, non 100 per
  // definizione — se una piattaforma viene tolta, la sua parte resta scoperta.
  const quotaAnnoTotale = budgetAnno > 0 ? (allocatoAnno / budgetAnno) * 100 : 0;

  async function salva() {
    setSalvo(true);
    setEsito(null);
    // Si mandano **solo i mesi ancora aperti**: su un mese chiuso la casella
    // mostra la quota davvero uscita — una misura, non una decisione — e
    // rispedirla sovrascriverebbe la quota a budget con quella misura.
    const split = piattaforme.flatMap((p) =>
      Array.from({ length: 12 }, (_, i) => i + 1)
        .filter((m) => !chiuso(m))
        .map((m) => ({ piattaformaId: p.id, month: m, percent: getPct(p.id, m) }))
    );
    const res = await fetch("/api/piattaforme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, ambito, split }),
    });
    setSalvo(false);
    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    setEsito(
      res.ok
        ? {
            ok: true,
            testo: ambito
              ? `Ripartizione di questo brand salvata alle ${ora}: da ora non segue più quella d azienda.`
              : `Ripartizione d azienda salvata alle ${ora}.`,
          }
        : { ok: false, testo: "Salvataggio non riuscito: riprova." }
    );
    if (res.ok) router.refresh();
  }

  async function creaPiattaforma() {
    if (!nuovo) return;
    if (!nuovo.nome.trim()) {
      setErrore("Indicare il nome della piattaforma.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/piattaforme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuovo),
    });
    setSalvo(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErrore(body?.error ?? "Creazione non riuscita, riprovare.");
      return;
    }
    setNuovo(null);
    router.refresh();
  }

  async function elimina(p: Piattaforma) {
    if (!confirm(`Rimuovere la piattaforma "${p.nome}"? Le sue percentuali verranno cancellate.`)) return;
    const res = await fetch(`/api/piattaforme?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Budget ADV {year}</div>
          <div className="kpi-value">{eur(budgetAnno)}</div>
          <div className="kpi-sub">da ripartire tra le piattaforme</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Allocato alle piattaforme</div>
          <div className={`kpi-value ${Math.abs(allocatoAnno - budgetAnno) < 1 ? "pos" : ""}`}>
            {eur(allocatoAnno)}
          </div>
          <div className="kpi-sub">
            {budgetAnno > 0 ? Math.round((allocatoAnno / budgetAnno) * 100) : 0}% del budget
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Piattaforme</div>
          <div className="kpi-value">{piattaforme.length}</div>
          <div className="kpi-sub">aggiungibili e rimovibili</div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Ripartizione mensile (% → importo)</h2>
          {/* Quando e stata salvata: una ripartizione senza data non si sa se
              e quella di stamattina o quella di marzo. */}
          <p className="page-caption" style={{ marginTop: 4 }}>
            {quandoSalvata ? (
              <>
                Salvata l’ultima volta il <strong>{quandoSalvata}</strong>
              </>
            ) : (
              <span className="muted">Mai salvata da questa pagina</span>
            )}
          </p>
        </div>
        <button
          className="btn secondary"
          onClick={() => {
            setErrore(null);
            setNuovo({ nome: "", colore: "neutral" });
          }}
        >
          Aggiungi piattaforma
        </button>
      </div>

      {piattaforme.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">◫</div>
          <div className="empty-title">Nessuna piattaforma</div>
          <div className="empty-text">Aggiungi Google, Meta, TikTok o altre e imposta le percentuali per mese.</div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piattaforma</th>
                  {MESI.map((m) => (
                    <th className="num" key={m}>{m}</th>
                  ))}
                  <th className="num">Anno</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {piattaforme.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`badge ${p.colore ?? "neutral"}`}><span className="dot" />{p.nome}</span>
                    </td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <td className="num" key={m} style={{ minWidth: 84 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={pctMostrata(p, m)}
                          disabled={soloLettura || chiuso(m)}
                          title={
                            misurato(p, m)
                              ? `${MESI[m - 1]} e passato: questa e la quota davvero uscita — ${eur(spesoDi(p, m) ?? 0)} su ${p.canale ?? "questo canale"}, secondo Marketing.`
                              : chiuso(m)
                                ? `${MESI[m - 1]} e un mese passato: la ripartizione non si riscrive dopo che i soldi sono usciti.`
                                : undefined
                          }
                          onChange={(e) =>
                            setPerc((prev) => ({
                              ...prev,
                              [`${p.id}:${m}`]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            }))
                          }
                          style={{
                            padding: "5px 8px",
                            fontSize: 12.5,
                            textAlign: "right",
                            ...(soloLettura || chiuso(m)
                              ? { background: "var(--fill)", color: "var(--text-tertiary)", cursor: "not-allowed" }
                              : null),
                          }}
                        />
                        <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: "right" }}>
                          {eur(importo(p.id, m))}
                          {misurato(p, m) ? (
                            <div style={{ color: "var(--blue)" }}>speso</div>
                          ) : chiuso(m) ? (
                            <div title="Mese chiuso, ma Marketing non ha un canale per questa piattaforma: quello che vedi e ancora il budget.">
                              a budget
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ))}
                    {/* Sull'anno la domanda non è più «quanto», è **quanta
                        parte**: la colonna porta l'importo e la sua quota sul
                        totale. Nel titolo la spaccatura fra quello che è già
                        uscito e quello che è ancora una decisione, che
                        nell'importo sono sommati e non si distinguerebbero. */}
                    <td className="num" style={{ fontWeight: 600 }}>
                      <div title={dettaglioAnno(p)}>{eur(totaleAnnoPiattaforma(p.id))}</div>
                      <div
                        className="muted"
                        style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}
                        title={dettaglioAnno(p)}
                      >
                        {budgetAnno > 0 ? pct((totaleAnnoPiattaforma(p.id) / budgetAnno) * 100) : "—"}
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn secondary small"
                        style={{ color: "var(--red)" }}
                        onClick={() => elimina(p)}
                        title="Rimuovi piattaforma"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>Totale %</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const tot = totalePctMese(m);
                    const ok = Math.abs(tot - 100) < 0.5;
                    return (
                      <td className="num" key={m} style={{ color: ok ? "var(--green)" : "var(--orange)" }}>
                        {Math.round(tot)}%
                      </td>
                    );
                  })}
                  {/* Sull anno la somma delle quote **non e** per costruzione
                      100: se una piattaforma viene tolta, la sua quota resta
                      non assegnata. Scriverla a mano direbbe una cosa falsa
                      proprio dove serve accorgersene. */}
                  <td
                    className="num"
                    style={{ color: quotaAnnoTotale >= 99.5 && quotaAnnoTotale <= 100.5 ? "var(--green)" : "var(--orange)" }}
                    title={
                      quotaAnnoTotale < 99.5
                        ? `Le piattaforme coprono il ${pct(quotaAnnoTotale)} del budget dell anno: ${eur(budgetAnno - allocatoAnno)} non sono assegnati a nessuna.`
                        : undefined
                    }
                  >
                    {pct(quotaAnnoTotale)}
                  </td>
                  <td />
                </tr>
                <tr className="tot">
                  <td>{primoMeseAperto > 1 ? "Speso / budget ADV mese" : "Budget ADV mese"}</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <td className="num" key={m} style={chiuso(m) ? { color: "var(--blue)" } : undefined}>
                      {eur(totaleMese(m))}
                    </td>
                  ))}
                  <td className="num">{eur(budgetAnno)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="page-caption" style={{ marginTop: 14 }}>
        L&apos;importo per piattaforma = budget ADV del mese × la sua %. La riga <strong>Totale %</strong> è
        verde quando le piattaforme coprono il 100% del mese, arancione se sopra o sotto. Il budget ADV
        mensile arriva da <a href="/spese" style={{ color: "var(--blue)" }}>Spese ADV</a>.
      </p>

      {nuovo && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>Nuova piattaforma</h2>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input
                type="text"
                value={nuovo.nome}
                onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
                placeholder="Es. Pinterest, LinkedIn, Amazon Ads"
              />
            </div>
            <div>
              <label className="field-label">Colore</label>
              <select value={nuovo.colore} onChange={(e) => setNuovo({ ...nuovo, colore: e.target.value })}>
                {COLORI.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setNuovo(null)}>Annulla</button>
            <button className="btn primary" onClick={creaPiattaforma} disabled={salvo}>
              {salvo ? "Creazione…" : "Crea piattaforma"}
            </button>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Nasce con percentuali a zero: impostale nella griglia e salva.
          </p>
        </div>
      )}

      {/* Nella vista somma non c'è niente da salvare: il bottone sparisce del
          tutto, invece di restare lì spento — un bottone che non può fare
          niente fa cercare cosa manca per accenderlo. */}
      {!soloLettura && (
      <div className="form-footer">
        {/* La conferma sta **dove si e agito**, accanto al bottone, e non e un
            grigetto: un salvataggio che non si vede sembra un bottone rotto. */}
        {esito && (
          <span className={`badge ${esito.ok ? "green" : "red"}`}>
            <span className="dot" />
            {esito.testo}
          </span>
        )}
        <button className="btn primary" onClick={salva} disabled={salvo || piattaforme.length === 0}>
          {salvo ? "Salvataggio…" : "Salva ripartizione"}
        </button>
      </div>
      )}
    </>
  );
}
