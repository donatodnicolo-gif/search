"use client";

import { useMemo, useState, useTransition } from "react";

type Campagna = {
  id: string;
  nome: string;
  canale: string;
  accesa: boolean;
  budget: number | null;
  inCoda: boolean;
  budgetInCoda: number | null;
};

// L'editor dei budget: si scrive, il totale si aggiorna, si mette in coda solo
// quello che è cambiato.
//
// ⚠️ IL TOTALE SI VEDE MENTRE SI SCRIVE. Senza, adattare cinque campagne a un
// tetto vuol dire fare la somma a mente cinque volte e sbagliarla una: il
// numero che conta — quanto si arriva a spendere al mese — deve stare sotto gli
// occhi *durante* la decisione, non dopo.
//
// ⚠️ SI METTE IN CODA SOLO CIÒ CHE È CAMBIATO. Rimandare anche i budget
// identici vorrebbe dire una modifica per campagna su Google, il blackout di 72
// ore su tutte e una coda di operazioni che non cambiano niente.
export function AdattaBudget({
  brand,
  etichettaBrand,
  mese,
  giorniMese,
  tetto,
  tettoTesto,
  campagne,
  azione,
}: {
  brand: string;
  etichettaBrand: string;
  mese: string;
  giorniMese: number;
  tetto: number | null;
  tettoTesto: string | null;
  campagne: Campagna[];
  azione: (input: {
    brand: string;
    modifiche: { campagnaId: string; budget: number }[];
    motivo: string;
  }) => Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }>;
}) {
  const [valori, setValori] = useState<Record<string, string>>(() =>
    Object.fromEntries(campagne.map((c) => [c.id, c.budget != null ? String(c.budget) : ""]))
  );
  const [motivo, setMotivo] = useState("");
  const [esito, setEsito] = useState<{ ok: true; messaggio: string } | { ok: false; errore: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  const euro = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const numero = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const { attuale, nuovo, modifiche } = useMemo(() => {
    let attuale = 0;
    let nuovo = 0;
    const modifiche: { campagnaId: string; budget: number }[] = [];
    for (const c of campagne) {
      // ⚠️ Solo le campagne ACCESE contano nel totale: una in pausa non spende,
      // e sommarla direbbe che si sta sforando quando non è vero.
      if (c.accesa && c.budget != null) attuale += c.budget;
      const n = numero(valori[c.id] ?? "");
      if (c.accesa && n != null) nuovo += n;
      if (n != null && c.budget != null && Math.abs(n - c.budget) > 0.005) {
        modifiche.push({ campagnaId: c.id, budget: n });
      } else if (n != null && c.budget == null) {
        modifiche.push({ campagnaId: c.id, budget: n });
      }
    }
    return { attuale, nuovo, modifiche };
  }, [valori, campagne]);

  const alMeseNuovo = nuovo * giorniMese;
  const differenza = tetto != null ? tetto - alMeseNuovo : null;

  // «Portalo al tetto»: scala tutti i budget accesi con la stessa proporzione.
  // ⚠️ Proporzionale e non uguale per tutti: chi spende 100 e chi spende 5 non
  // vanno riportati allo stesso numero — la ripartizione fra campagne è una
  // decisione già presa, e questo bottone non deve cancellarla.
  const scalaAlTetto = () => {
    if (tetto == null || nuovo <= 0) return;
    const obiettivoGiorno = tetto / giorniMese;
    const fattore = obiettivoGiorno / nuovo;
    const prossimi = { ...valori };
    for (const c of campagne) {
      if (!c.accesa) continue;
      const n = numero(valori[c.id] ?? "");
      if (n == null) continue;
      prossimi[c.id] = String(Math.max(1, Math.round(n * fattore)));
    }
    setValori(prossimi);
  };

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Budget delle campagne di {etichettaBrand}
      </div>

      <div className="kpi-riga" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="kpi-valore">{euro(attuale)}</div>
          <div className="kpi-etichetta">Acceso adesso, al giorno</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: nuovo !== attuale ? "var(--blue)" : undefined }}>
            {euro(nuovo)}
          </div>
          <div className="kpi-etichetta">Con quello che hai scritto</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(alMeseNuovo)}</div>
          <div className="kpi-etichetta">Al mese ({giorniMese} giorni), al massimo</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{tettoTesto ?? "—"}</div>
          <div className="kpi-etichetta">Consentito da Budgets per {mese}</div>
        </div>
        {differenza != null && (
          <div className="kpi">
            <div className="kpi-valore" style={{ color: differenza < 0 ? "var(--orange)" : "var(--green)" }}>
              {differenza >= 0 ? "+" : ""}
              {euro(differenza)}
            </div>
            <div className="kpi-etichetta">
              {differenza >= 0 ? "Spazio che resterebbe" : "Oltre il tetto"}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="btn small btn-secondario" onClick={scalaAlTetto} disabled={tetto == null}>
          Portalo al tetto (in proporzione)
        </button>
        <button
          type="button"
          className="btn small btn-secondario"
          onClick={() =>
            setValori(Object.fromEntries(campagne.map((c) => [c.id, c.budget != null ? String(c.budget) : ""])))
          }
        >
          Rimetti com&apos;era
        </button>
        <span className="cella-sub" style={{ alignSelf: "center", whiteSpace: "normal" }}>
          «Portalo al tetto» scala <b>in proporzione</b>: chi spende molto e chi spende poco non
          finiscono allo stesso numero — la ripartizione fra campagne è una decisione già presa.
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Campagna</th>
              <th>Piattaforma</th>
              <th className="num">Adesso</th>
              <th className="num">Nuovo €/giorno</th>
              <th className="num">Differenza</th>
            </tr>
          </thead>
          <tbody>
            {campagne.map((c) => {
              const n = numero(valori[c.id] ?? "");
              const diff = n != null && c.budget != null ? n - c.budget : null;
              return (
                <tr key={c.id} style={{ opacity: c.accesa ? 1 : 0.5 }}>
                  <td className="cella-nome" style={{ maxWidth: 320 }}>
                    <a href={`/campagne/${c.id}`}>{c.nome}</a>
                    <div className="cella-sub">
                      {c.accesa ? "in asta" : "ferma su Google/Meta — non spende"}
                      {c.inCoda && (
                        <span style={{ color: "var(--orange)" }}>
                          {" "}· ha già un cambio in coda
                          {c.budgetInCoda != null && ` a ${euro(c.budgetInCoda)}`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="cella-muta">{c.canale === "meta_ads" ? "Meta" : c.canale === "google_ads" ? "Google" : c.canale}</td>
                  <td className="num cella-muta">{c.budget != null ? euro(c.budget) : "non noto"}</td>
                  <td className="num">
                    <input
                      value={valori[c.id] ?? ""}
                      onChange={(e) => setValori((v) => ({ ...v, [c.id]: e.target.value }))}
                      inputMode="decimal"
                      style={{
                        font: "inherit",
                        width: 90,
                        textAlign: "right",
                        padding: "4px 8px",
                        borderRadius: 8,
                        border: "1px solid var(--hairline-strong)",
                      }}
                    />
                  </td>
                  <td
                    className="num"
                    style={{ color: diff == null || diff === 0 ? undefined : diff > 0 ? "var(--blue)" : "var(--orange)" }}
                  >
                    {diff == null || diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${euro(diff)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="campo-modulo largo" style={{ marginTop: 12 }}>
        <label>Perché (finisce nello storico di ogni operazione)</label>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={`es. rientro nel tetto di ${mese}`}
          style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", width: "100%" }}
        />
      </div>

      {esito && (
        <div className={esito.ok ? "avviso-ok" : "modale-avviso"} style={{ marginTop: 10 }}>
          {esito.ok ? (
            <>
              {esito.messaggio} <a href="/operazioni" style={{ textDecoration: "underline" }}>Vai ad approvarle</a>
            </>
          ) : (
            esito.errore
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn small"
          disabled={inCorso || modifiche.length === 0}
          onClick={() => {
            setEsito(null);
            avvia(async () => {
              const r = await azione({ brand, modifiche, motivo });
              setEsito(r);
            });
          }}
        >
          {inCorso
            ? "Metto in coda…"
            : modifiche.length === 0
              ? "Non hai cambiato niente"
              : `Metti in coda ${modifiche.length === 1 ? "1 modifica" : `${modifiche.length} modifiche`}`}
        </button>
        <span className="cella-sub" style={{ whiteSpace: "normal" }}>
          Va in coda <b>solo quello che hai cambiato</b>, una operazione per campagna: rimandare anche
          i budget identici vorrebbe dire far scattare il blackout di 72 ore su campagne che non
          hanno cambiato niente.
        </span>
      </div>
    </section>
  );
}
