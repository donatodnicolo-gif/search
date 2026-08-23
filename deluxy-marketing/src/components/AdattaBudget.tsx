"use client";

import { useMemo, useState, useTransition } from "react";

type Campagna = {
  id: string;
  nome: string;
  canale: string;
  accesa: boolean;
  budget: number | null;
  /** Quanto ha già speso questo mese (0 se il mese non è cominciato). */
  speso: number;
  inCoda: boolean;
  budgetInCoda: number | null;
};

type Piattaforma = { nome: string; percent: number; proprio: boolean; euro: number };

// Il nome che Budgets dà alla piattaforma e il canale con cui arrivano le
// campagne sono due vocabolari diversi: l'abbinamento sta qui, in un punto
// solo, invece di essere indovinato da una `includes` sparsa nel codice.
// L'ordine in cui si guardano, e come si chiamano a schermo. Google prima
// perché è dove sta il grosso della spesa.
const ORDINE_CANALI = ["google_ads", "meta_ads", "tiktok", ""];
const NOME_CANALE: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok: "TikTok",
  "": "Senza piattaforma",
};

const CANALE_DI_PIATTAFORMA: Record<string, string> = {
  google: "google_ads",
  meta: "meta_ads",
  tiktok: "tiktok",
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
  piattaforme,
  giorniRimasti,
  meseIniziato,
  fuoriElenco,
  campagne,
  azione,
}: {
  brand: string;
  etichettaBrand: string;
  mese: string;
  giorniMese: number;
  tetto: number | null;
  tettoTesto: string | null;
  /** Come Budgets ripartisce il monte del mese fra le piattaforme. */
  piattaforme: Piattaforma[] | null;
  /** Giorni che restano nel mese, oggi compreso. */
  giorniRimasti: number;
  /** Il mese è in corso (c'è già spesa) o è tutto davanti? */
  meseIniziato: boolean;
  /** Quante campagne ferme sono rimaste fuori: si dichiarano, non spariscono. */
  fuoriElenco: number;
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

  // ⚠️ DOVE SI ARRIVA A FINE MESE. Non «budget × giorni del mese»: a metà
  // agosto quel conto ignora i venti giorni già spesi e sbaglia quasi del
  // doppio. Si somma quello che è GIÀ uscito con i giorni che restano al
  // budget nuovo.
  //
  // ⚠️ Resta comunque un MASSIMO: il budget giornaliero è un tetto, e quasi
  // nessuna campagna lo tocca. È scritto sotto la cifra, perché un numero
  // così preciso si legge come una previsione.
  const perPiattaforma = useMemo(() => {
    const m = new Map<string, { speso: number; nuovoGiorno: number; attualeGiorno: number; campagne: number }>();
    for (const c of campagne) {
      const k = c.canale || "altro";
      const v = m.get(k) ?? { speso: 0, nuovoGiorno: 0, attualeGiorno: 0, campagne: 0 };
      v.speso += c.speso;
      if (c.accesa) {
        v.campagne++;
        v.attualeGiorno += c.budget ?? 0;
        const n = numero(valori[c.id] ?? "");
        if (n != null) v.nuovoGiorno += n;
      }
      m.set(k, v);
    }
    return m;
  }, [valori, campagne]);

  const tettoDi = (canale: string) => {
    const pf = (piattaforme ?? []).find((x) => CANALE_DI_PIATTAFORMA[x.nome.toLowerCase()] === canale);
    return pf ?? null;
  };

  const fineMese = campagne.reduce((s, c) => {
    if (!c.accesa) return s + c.speso;
    const n = numero(valori[c.id] ?? "");
    return s + c.speso + (n ?? 0) * giorniRimasti;
  }, 0);

  const alMeseNuovo = nuovo * giorniMese;
  // ⚠️ Lo scarto si misura su DOVE SI ARRIVA, non sul mese teorico pieno:
  // a metà mese quel secondo numero direbbe che c'è spazio quando i soldi
  // sono già usciti.
  const differenza = tetto != null ? tetto - fineMese : null;
  void alMeseNuovo;

  /**
   * Il budget giornaliero SUGGERITO per ogni campagna.
   *
   * La regola, detta in una riga: *quello che resta del tetto, diviso i
   * giorni che restano, spartito fra le campagne accese in proporzione a
   * quello che hanno adesso.*
   *
   * ⚠️ In proporzione, non in parti uguali: la ripartizione fra campagne è
   * una decisione già presa — c'è chi porta ordini e chi presidia — e un
   * suggerimento non deve cancellarla.
   * ⚠️ Si parte da QUELLO CHE RESTA, non dal tetto pieno: a metà mese
   * spartire tutto il tetto sui giorni rimasti vorrebbe dire spendere due
   * volte i soldi già usciti.
   * ⚠️ Per piattaforma quando Budgets dice come ripartire: il totale può
   * tornare mentre Google e Meta sono entrambe fuori posto in direzioni
   * opposte, ed è il caso che il totale nasconde.
   */
  const suggerisci = () => {
    const prossimi = { ...valori };
    const gruppi = piattaforme && piattaforme.length > 0
      ? [...new Set(campagne.map((c) => c.canale))].map((canale) => ({
          canale,
          tetto: tettoDi(canale)?.euro ?? null,
        }))
      : [{ canale: null as string | null, tetto }];

    for (const g of gruppi) {
      if (g.tetto == null) continue;
      const sue = campagne.filter((c) => c.accesa && (g.canale == null || c.canale === g.canale));
      if (sue.length === 0) continue;
      const spesoLoro = campagne
        .filter((c) => g.canale == null || c.canale === g.canale)
        .reduce((s, c) => s + c.speso, 0);
      const restante = Math.max(0, g.tetto - spesoLoro);
      const alGiornoObiettivo = restante / giorniRimasti;
      const base = sue.reduce((s, c) => s + (c.budget ?? 0), 0);
      for (const c of sue) {
        const quota = base > 0 ? (c.budget ?? 0) / base : 1 / sue.length;
        prossimi[c.id] = String(Math.max(1, Math.round(alGiornoObiettivo * quota)));
      }
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
          <div className="kpi-valore">{euro(fineMese)}</div>
          <div className="kpi-etichetta">
            A fine mese, con questi valori
            {meseIniziato && (
              <div className="cella-sub">
                già spesi {euro(campagne.reduce((t, c) => t + c.speso, 0))} + {giorniRimasti} giorni
              </div>
            )}
          </div>
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
        <button type="button" className="btn small" onClick={suggerisci} disabled={tetto == null}>
          Suggerisci i budget
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
          Il suggerimento è una divisione dichiarata: <b>quello che resta del tetto</b> diviso i{" "}
          <b>{giorniRimasti} giorni</b> che restano, spartito fra le campagne accese{" "}
          <b>in proporzione a quello che hanno adesso</b> — chi porta ordini e chi presidia non
          finiscono allo stesso numero. {piattaforme && piattaforme.length > 0
            ? "Piattaforma per piattaforma, come dice Budgets."
            : "Sul totale del brand: Budgets non ha una ripartizione per piattaforma per questo mese."}
        </span>
      </div>

      {/* ⚠️ PIATTAFORMA PER PIATTAFORMA. Il totale può tornare mentre Google
          e Meta sono entrambe fuori posto in direzioni opposte: è il caso che
          un totale nasconde, ed è anche quello che capita più spesso. */}
      {piattaforme && piattaforme.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Piattaforma</th>
                <th className="num">Disponibile per {mese}</th>
                <th className="num">Già speso</th>
                <th className="num">Acceso ora</th>
                <th className="num">Con i tuoi valori, a fine mese</th>
              </tr>
            </thead>
            <tbody>
              {piattaforme.map((pf) => {
                const canale = CANALE_DI_PIATTAFORMA[pf.nome.toLowerCase()] ?? pf.nome.toLowerCase();
                const v = perPiattaforma.get(canale);
                const arrivo = (v?.speso ?? 0) + (v?.nuovoGiorno ?? 0) * giorniRimasti;
                // ⚠️ Dove arriverebbe LASCIANDO TUTTO COM'È: è il termine di
                // paragone che manca sempre. «A fine mese 3.630 €» non dice
                // se è una conseguenza di quello che hai appena scritto o lo
                // stato di fatto — e sono due letture opposte.
                const arrivoOggi = (v?.speso ?? 0) + (v?.attualeGiorno ?? 0) * giorniRimasti;
                const scarto = arrivo - arrivoOggi;
                const sfora = arrivo > pf.euro;
                return (
                  <tr key={pf.nome}>
                    <td className="cella-nome">
                      {pf.nome}
                      <div className="cella-sub">
                        {pf.percent}% del monte
                        {/* Chi decide deve sapere se la ripartizione è stata
                            scelta per questo brand o ereditata dall'azienda. */}
                        {!pf.proprio && " · ripartizione d'azienda, non di questo brand"}
                      </div>
                    </td>
                    <td className="num">{euro(pf.euro)}</td>
                    <td className="num cella-muta">{v ? euro(v.speso) : "—"}</td>
                    <td className="num cella-muta">
                      {v ? euro(v.nuovoGiorno) : "—"}
                      <div className="cella-sub">al giorno · {v?.campagne ?? 0} campagne</div>
                    </td>
                    <td className="num" style={{ fontWeight: 600, color: sfora ? "var(--orange)" : "var(--green)" }}>
                      {euro(arrivo)}
                      <div className="cella-sub" style={{ color: sfora ? "var(--orange)" : undefined }}>
                        {sfora ? `${euro(arrivo - pf.euro)} oltre` : `${euro(pf.euro - arrivo)} di spazio`}
                      </div>
                      <div className="cella-sub">
                        {Math.round(scarto) === 0
                          ? "come adesso"
                          : `${scarto > 0 ? "+" : ""}${euro(scarto)} rispetto a oggi`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Campagna</th>
              <th className="num">Adesso</th>
              <th className="num">Nuovo €/giorno</th>
              <th className="num">A fine mese</th>
            </tr>
          </thead>
          {/* ⚠️ UN BLOCCO PER PIATTAFORMA. Google e Meta hanno budget
              diversi, tetti diversi e perfino un esecutore diverso: in un
              elenco unico si mescolavano, e per capire quanto stavi mettendo
              su Meta bisognava sommare a occhio le righe con scritto Meta.
              Ogni blocco chiude con il proprio totale, che è il numero su cui
              si decide. */}
          {ORDINE_CANALI.filter((canale) => campagne.some((c) => c.canale === canale)).map((canale) => {
            const sue = campagne.filter((c) => c.canale === canale);
            const pf = tettoDi(canale);
            const v = perPiattaforma.get(canale);
            const arrivo = (v?.speso ?? 0) + (v?.nuovoGiorno ?? 0) * giorniRimasti;
            const arrivoOggi = (v?.speso ?? 0) + (v?.attualeGiorno ?? 0) * giorniRimasti;
            const scarto = arrivo - arrivoOggi;
            const sfora = pf != null && arrivo > pf.euro;
            return (
          <tbody key={canale}>
            <tr>
              {/* L'intestazione del blocco porta già il confronto: chi
                  scrive un numero nella riga sotto deve vedere subito se
                  sfora, non dopo aver scorso in cima alla pagina. */}
              <td colSpan={4} style={{ background: "var(--fill)", fontWeight: 600 }}>
                {NOME_CANALE[canale] ?? canale}
                <span className="cella-sub" style={{ fontWeight: 400, marginLeft: 10 }}>
                  {sue.length} campagne in asta
                  {pf != null && (
                    <>
                      {" · "}disponibile {euro(pf.euro)}{" · "}
                      <span style={{ color: sfora ? "var(--orange)" : "var(--green)" }}>
                        a fine mese {euro(arrivo)}
                      </span>
                      {sfora
                        ? ` (${euro(arrivo - pf.euro)} oltre)`
                        : ` (${euro(pf.euro - arrivo)} di spazio)`}
                    </>
                  )}
                  {/* Il paragone con «se non tocco niente»: senza, non si
                      capisce se quel numero è l'effetto di quello che si sta
                      scrivendo o lo stato di fatto. */}
                  {Math.round(scarto) !== 0 && (
                    <span style={{ color: scarto > 0 ? "var(--blue)" : "var(--orange)" }}>
                      {" · "}
                      {scarto > 0 ? "+" : ""}
                      {euro(scarto)} rispetto a oggi
                    </span>
                  )}
                  {pf == null && arrivo > 0 && `${" · "}a fine mese ${euro(arrivo)}`}
                  {pf == null && " · Budgets non dice quanto spetta a questa piattaforma"}
                </span>
              </td>
            </tr>
            {sue.map((c) => {
              const n = numero(valori[c.id] ?? "");
              const diff = n != null && c.budget != null ? n - c.budget : null;
              // ⚠️ Dove arriva QUESTA campagna a fine mese, e di quanto
              // cambia rispetto a com'è impostata adesso. Il numero al giorno
              // è troppo piccolo per pesare una decisione: 5 € in più al
              // giorno sembrano niente e a fine mese sono 150.
              const arrivoRiga = c.speso + (n ?? 0) * giorniRimasti;
              const arrivoOggi = c.speso + (c.budget ?? 0) * giorniRimasti;
              const scartoRiga = arrivoRiga - arrivoOggi;
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
                  <td className="num">
                    <b>{euro(arrivoRiga)}</b>
                    <div className="cella-sub">
                      {/* Quanto cambia rispetto a oggi: è la cifra che si
                          confronta col tetto, non i 5 € al giorno. */}
                      {Math.round(scartoRiga) === 0 ? (
                        "come adesso"
                      ) : (
                        <span style={{ color: scartoRiga > 0 ? "var(--blue)" : "var(--orange)" }}>
                          {scartoRiga > 0 ? "+" : ""}
                          {euro(scartoRiga)} rispetto a oggi
                        </span>
                      )}
                      {diff != null && diff !== 0 && (
                        <div>
                          {diff > 0 ? "+" : ""}
                          {euro(diff)} al giorno × {giorniRimasti} giorni
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
            );
          })}
        </table>
      </div>

      {fuoriElenco > 0 && (
        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
          {fuoriElenco === 1
            ? "Una campagna ferma su Google/Meta non è in elenco: non spende, quindi non c’è niente da adattare."
            : fuoriElenco +
              " campagne ferme su Google/Meta non sono in elenco: non spendono, quindi non c’è niente da adattare."}{" "}
          Per riaccenderne una si passa dalla sua scheda.
        </p>
      )}

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
