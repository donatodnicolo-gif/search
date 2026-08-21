"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type MeseSpesa = { month: number; vendite: number; percent: number; pubblicato: number };
type MaisonSpese = { id: string; nome: string; mesi: MeseSpesa[] };

export function SpeseEditor({
  year,
  maisons,
  primoMeseAperto,
}: {
  year: number;
  maisons: MaisonSpese[];
  // Il primo mese ancora modificabile, deciso dal server: calcolarlo qui con
  // `new Date()` darebbe un valore diverso fra render sul server e idratazione
  // nel browser proprio a cavallo della mezzanotte del primo del mese.
  primoMeseAperto: number;
}) {
  const router = useRouter();

  // Le percentuali salvate, così come arrivano dal server. Sono la **base**:
  // lo stato tiene solo le caselle che l'utente ha toccato, quindi dopo un
  // `router.refresh()` (salvataggio, brand nuovo) i valori nuovi entrano da
  // soli, invece di restare congelati in uno stato inizializzato una volta.
  const originali = useMemo(() => {
    const o: Record<string, number> = {};
    for (const m of maisons) for (const x of m.mesi) o[`${m.id}:${x.month}`] = x.percent;
    return o;
  }, [maisons]);

  const [modifiche, setModifiche] = useState<Record<string, number>>({});
  const [salvo, setSalvo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [nuovoBrand, setNuovoBrand] = useState("");
  const [creo, setCreo] = useState(false);
  const [esitoBrand, setEsitoBrand] = useState<string | null>(null);

  const chiuso = (month: number) => month < primoMeseAperto;
  const valore = (key: string) => modifiche[key] ?? originali[key] ?? 0;
  const toccata = (key: string) => modifiche[key] !== undefined && modifiche[key] !== (originali[key] ?? 0);

  // Consentito di una maison con una certa mappa di percentuali: serve due
  // volte per ogni riga (com'è adesso e com'era salvato), quindi una funzione
  // sola invece di due somme che possono divergere.
  const consentito = (m: MaisonSpese, percentuale: (key: string) => number, mesi?: (x: MeseSpesa) => boolean) =>
    m.mesi
      .filter((x) => (mesi ? mesi(x) : true))
      .reduce((s, x) => s + (x.vendite * percentuale(`${m.id}:${x.month}`)) / 100, 0);

  const righe = useMemo(
    () =>
      maisons.map((m) => {
        const ora = consentito(m, valore);
        const salvato = consentito(m, (k) => originali[k] ?? 0);
        return { m, ora, salvato, differenza: ora - salvato };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maisons, modifiche, originali]
  );

  const totale = righe.reduce((s, r) => s + r.ora, 0);
  const totaleSalvato = righe.reduce((s, r) => s + r.salvato, 0);
  const differenza = totale - totaleSalvato;

  const totaleChiusi = maisons.reduce((s, m) => s + consentito(m, valore, (x) => chiuso(x.month)), 0);
  const totaleAperti = totale - totaleChiusi;

  // Quali mesi sono stati toccati, per nome: «il totale è cambiato» senza dire
  // *dove* costringe a ricontrollare dodici caselle per maison.
  const chiaviToccate = Object.keys(modifiche).filter((k) => toccata(k));
  const mesiCambiati = [...new Set(chiaviToccate.map((k) => Number(k.split(":")[1])))].sort((a, b) => a - b);
  // Il bottone si accende sulle **caselle** toccate, non sulla differenza in
  // euro: due modifiche opposte che si compensano lasciano il totale identico
  // e sarebbero comunque da salvare.
  const daSalvare = chiaviToccate.length > 0;

  async function salva() {
    setSalvo(true);
    setEsito(null);
    // Si mandano **solo i mesi aperti**: un mese chiuso qui non ha input, e
    // spedirlo lo stesso lo riscriverebbe con il valore che si vede — identico
    // oggi, ma è esattamente il modo in cui un blocco smette di bloccare.
    const entries = maisons.flatMap((m) =>
      m.mesi
        .filter((x) => !chiuso(x.month))
        .map((x) => ({ maisonId: m.id, month: x.month, percent: valore(`${m.id}:${x.month}`) }))
    );
    const res = await fetch("/api/spese", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, entries }),
    });
    const body = await res.json().catch(() => null);
    setSalvo(false);
    if (res.ok) {
      setModifiche({});
      // Il server rifiuta i mesi chiusi anche se il form non li manda: se ne ha
      // scartato qualcuno vuol dire che questa scheda era aperta da prima che
      // il mese si chiudesse, e dirlo evita di credere di aver salvato.
      const scartati: number[] = Array.isArray(body?.mesiChiusiIgnorati) ? body.mesiChiusiIgnorati : [];
      setEsito(
        scartati.length > 0
          ? `Salvate le percentuali dei mesi aperti. ${scartati.map((m) => MESI[m - 1]).join(", ")} ${scartati.length === 1 ? "si è chiuso" : "si sono chiusi"} nel frattempo: ricarica la pagina.`
          : "Percentuali salvate."
      );
      router.refresh();
    } else {
      setEsito("Salvataggio non riuscito, riprovare.");
    }
  }

  async function creaBrand() {
    const nome = nuovoBrand.trim();
    if (!nome) return;
    setCreo(true);
    setEsitoBrand(null);
    const res = await fetch("/api/maison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const body = await res.json().catch(() => null);
    setCreo(false);
    if (res.ok) {
      setNuovoBrand("");
      setEsitoBrand(`«${nome}» aggiunto: nasce senza vendite a budget, quindi il consentito resta 0 finché non lo compili in Maison.`);
      router.refresh();
    } else {
      setEsitoBrand(body?.error ?? "Non è stato possibile aggiungere il brand.");
    }
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Spesa ADV consentita {year} (tutti i brand)</div>
          <div className="kpi-value">{eur(totale)}</div>
          <div className="kpi-sub">si aggiorna con le % qui sotto</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Rispetto a quello che è salvato</div>
          <div className={`kpi-value ${differenza === 0 ? "" : differenza > 0 ? "neg" : "pos"}`}>
            {differenza === 0
              ? daSalvare
                ? "totale invariato"
                : "invariato"
              : `${differenza > 0 ? "+" : "−"}${eur(Math.abs(differenza))}`}
          </div>
          <div className="kpi-sub">
            {!daSalvare
              ? "nessuna modifica da salvare"
              : `da ${eur(totaleSalvato)} a ${eur(totale)} · ${mesiCambiati.map((m) => MESI[m - 1]).join(", ")}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mesi ancora apribili ({MESI[primoMeseAperto - 1]}–Dic)</div>
          <div className="kpi-value">{eur(totaleAperti)}</div>
          <div className="kpi-sub">
            {primoMeseAperto > 1
              ? `più ${eur(totaleChiusi)} nei mesi chiusi, non modificabili`
              : "l'anno è tutto ancora davanti"}
          </div>
        </div>
      </div>

      {maisons.map((m) => {
        const riga = righe.find((r) => r.m.id === m.id)!;
        const totPubblicato = m.mesi.reduce((s, x) => s + x.pubblicato, 0);
        return (
          <div className="card" key={m.id}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>{m.nome}</h2>
                <p className="page-caption">
                  Consentito {eur(riga.ora)} · pubblicato {eur(totPubblicato)}
                  {riga.differenza !== 0 && (
                    <>
                      {" · "}
                      <strong className={`delta ${riga.differenza > 0 ? "su" : "giu"}`}>
                        {riga.differenza > 0 ? "+" : "−"}
                        {eur(Math.abs(riga.differenza))}
                      </strong>{" "}
                      rispetto ai {eur(riga.salvato)} salvati
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="mesi-grid">
              {m.mesi.map((x) => {
                const key = `${m.id}:${x.month}`;
                const percent = valore(key);
                const bloccato = chiuso(x.month);
                const importo = (x.vendite * percent) / 100;
                const importoSalvato = (x.vendite * (originali[key] ?? 0)) / 100;
                return (
                  <div className="mese-cell" key={x.month}>
                    <div className="k">
                      {MESI[x.month - 1]} · % su {eur(x.vendite)}
                      {bloccato && " · chiuso"}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={percent}
                      disabled={bloccato}
                      className={toccata(key) ? "toccata" : undefined}
                      title={
                        bloccato
                          ? `${MESI[x.month - 1]} è un mese passato: il budget ADV non si riscrive dopo che è stato speso.`
                          : undefined
                      }
                      onChange={(e) =>
                        setModifiche((p) => ({
                          ...p,
                          [key]: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                    />
                    <div className="sub">
                      = {eur(importo)}
                      {toccata(key) && (
                        <>
                          <br />
                          <span className={`delta ${importo >= importoSalvato ? "su" : "giu"}`}>
                            {importo >= importoSalvato ? "+" : "−"}
                            {eur(Math.abs(importo - importoSalvato))}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>Aggiungi un brand</h2>
        <p className="page-caption" style={{ marginTop: 0 }}>
          Il brand nuovo compare subito qui e in tutte le pagine che ragionano per maison, ma{" "}
          <strong>nasce a zero</strong>: senza vendite a budget la percentuale non ha su cosa applicarsi, e
          il consentito resta 0 finché il budget non lo scrivi in <strong>Maison</strong>.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={nuovoBrand}
            placeholder="Nome del brand"
            maxLength={60}
            style={{ padding: "7px 10px", fontSize: 13, minWidth: 220 }}
            onChange={(e) => setNuovoBrand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") creaBrand();
            }}
          />
          <button className="btn" onClick={creaBrand} disabled={creo || !nuovoBrand.trim()}>
            {creo ? "Aggiungo…" : "Aggiungi brand"}
          </button>
          {esitoBrand && (
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esitoBrand}</span>
          )}
        </div>
      </div>

      <h2 className="section-title">Totale {year}</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th className="num">Consentito ora</th>
                <th className="num">Salvato</th>
                <th className="num">Differenza</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.m.id}>
                  <td>{r.m.nome}</td>
                  <td className="num">{eur(r.ora)}</td>
                  <td className="num muted">{eur(r.salvato)}</td>
                  <td className={`num ${r.differenza === 0 ? "muted" : r.differenza > 0 ? "neg" : "pos"}`}>
                    {r.differenza === 0 ? "—" : `${r.differenza > 0 ? "+" : "−"}${eur(Math.abs(r.differenza))}`}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale {year}</td>
                <td className="num">{eur(totale)}</td>
                <td className="num">{eur(totaleSalvato)}</td>
                <td className={`num ${differenza === 0 ? "" : differenza > 0 ? "neg" : "pos"}`}>
                  {differenza === 0 ? "—" : `${differenza > 0 ? "+" : "−"}${eur(Math.abs(differenza))}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="page-caption" style={{ margin: "10px 14px 4px" }}>
          La colonna <strong>«salvato»</strong> è quello che c&apos;è nel database adesso: finché non premi
          «Salva percentuali» la differenza vive solo in questa pagina, e ricaricando sparisce. Dentro il
          totale ci sono <strong>{eur(totaleChiusi)}</strong> di mesi chiusi
          {primoMeseAperto > 1 ? ` (Gen–${MESI[primoMeseAperto - 2]})` : ""}, che non si possono più muovere:
          la differenza qui sopra riguarda solo {MESI[primoMeseAperto - 1]}–Dic.
        </p>
      </div>

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button className="btn primary" onClick={salva} disabled={salvo || !daSalvare}>
          {salvo ? "Salvataggio…" : !daSalvare ? "Niente da salvare" : "Salva percentuali"}
        </button>
      </div>
    </>
  );
}
