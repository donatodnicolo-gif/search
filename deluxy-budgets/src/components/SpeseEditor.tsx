"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

// Punti percentuali, con al più un decimale: `150 − 100` fa 50, ma `113,4 − 100`
// in virgola mobile fa 13,399999999999999 e a schermo sarebbe illeggibile.
const punti = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 });

type MeseSpesa = {
  month: number;
  speso: number | null;
  percent: number;
  pubblicato: number;
};
type MaisonSpese = { id: string; nome: string; pubblicatoAnno: number; mesi: MeseSpesa[] };

export function SpeseEditor({
  year,
  maisons,
  primoMeseAperto,
  spesaOk,
  brandSenzaCasa,
}: {
  year: number;
  maisons: MaisonSpese[];
  // Il primo mese ancora modificabile, deciso dal server: calcolarlo qui con
  // `new Date()` darebbe un valore diverso fra render sul server e idratazione
  // nel browser proprio a cavallo della mezzanotte del primo del mese.
  primoMeseAperto: number;
  // Se Marketing ha risposto sulla spesa per brand.
  spesaOk: boolean;
  // Brand che Marketing conosce e che qui non hanno una maison: la loro spesa
  // non è in nessuna scheda, e dirlo evita di leggere il totale come completo.
  brandSenzaCasa: string[];
}) {
  const router = useRouter();

  // Le percentuali salvate, così come arrivano dal server. Sono la **base**:
  // lo stato tiene solo le caselle che l'utente ha toccato, quindi dopo un
  // `router.refresh()` i valori nuovi entrano da soli, invece di restare
  // congelati in uno stato inizializzato una volta.
  const originali = useMemo(() => {
    const o: Record<string, number> = {};
    for (const m of maisons) for (const x of m.mesi) o[`${m.id}:${x.month}`] = x.percent;
    return o;
  }, [maisons]);

  const [modifiche, setModifiche] = useState<Record<string, number>>({});
  // Quale salvataggio è in corso: l'id del brand, `"*"` per tutti, `null` per
  // nessuno. Un booleano solo metterebbe «Salvataggio…» su ogni bottone della
  // pagina mentre ne sta lavorando uno.
  const [salvo, setSalvo] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [nuovoBrand, setNuovoBrand] = useState("");
  const [creo, setCreo] = useState(false);
  const [esitoBrand, setEsitoBrand] = useState<string | null>(null);

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
      setEsitoBrand(
        `«${nome}» aggiunto: nasce senza budget pubblicitario, quindi non ha ancora un 100% da distribuire.`
      );
      router.refresh();
    } else {
      setEsitoBrand(body?.error ?? "Non è stato possibile aggiungere il brand.");
    }
  }

  const chiuso = (month: number) => month < primoMeseAperto;
  const valore = (key: string) => modifiche[key] ?? originali[key] ?? 0;
  const toccata = (key: string) => modifiche[key] !== undefined && modifiche[key] !== (originali[key] ?? 0);

  // ---- Cosa vuol dire una percentuale, qui ----
  //
  // È la **quota del budget pubblicitario dell'anno** di quel brand che si
  // spende in quel mese, non una percentuale delle vendite del mese. Quindi:
  //  - l'importo del mese = monte annuo × quota;
  //  - le dodici quote di un brand **devono fare 100**, perché distribuiscono
  //    un numero che è già deciso;
  //  - sopra il 100 si impegna pubblicità che non c'è → non si salva;
  //  - sotto il 100 resta budget non assegnato → si salva, ma si dice quanto.
  const importoMese = (m: MaisonSpese, x: MeseSpesa, percentuale: (key: string) => number) =>
    misurato(x) ? x.speso ?? 0 : (m.pubblicatoAnno * percentuale(`${m.id}:${x.month}`)) / 100;

  // Un mese chiuso di cui Marketing conosce la spesa: lì la quota non è una
  // decisione, è una misura — **quanto del monte annuo è già stato consumato**.
  // `speso === null` vuol dire non misurato (mese aperto, Marketing muto, o
  // brand che in Marketing non esiste: B2B ed Experience non fanno campagne),
  // e lì resta la quota decisa a budget.
  const misurato = (x: MeseSpesa) => chiuso(x.month) && x.speso !== null;
  const quotaReale = (m: MaisonSpese, x: MeseSpesa) =>
    misurato(x) && m.pubblicatoAnno > 0 ? ((x.speso ?? 0) / m.pubblicatoAnno) * 100 : null;

  // La quota di un mese, misurata dove si può e decisa dove no: è quella che si
  // vede nella casella ed è quella che entra nella somma.
  const quota = (m: MaisonSpese, x: MeseSpesa, percentuale: (key: string) => number) => {
    const r = quotaReale(m, x);
    return r !== null ? r : percentuale(`${m.id}:${x.month}`);
  };

  const sommaQuote = (m: MaisonSpese, percentuale: (key: string) => number) =>
    m.mesi.reduce((s, x) => s + quota(m, x, percentuale), 0);

  const consentito = (m: MaisonSpese, percentuale: (key: string) => number, filtro?: (x: MeseSpesa) => boolean) =>
    m.mesi.filter((x) => (filtro ? filtro(x) : true)).reduce((s, x) => s + importoMese(m, x, percentuale), 0);

  const righe = useMemo(
    () =>
      maisons.map((m) => {
        const ora = consentito(m, valore);
        const salvato = consentito(m, (k) => originali[k] ?? 0);
        const pp = sommaQuote(m, valore);
        const ppSalvati = sommaQuote(m, (k) => originali[k] ?? 0);
        const speso = m.mesi.filter(misurato).reduce((s, x) => s + (x.speso ?? 0), 0);
        // Il vincolo non è «la somma dei dodici ≤ 100» ma «non assegnare più di
        // quello che resta»: i mesi chiusi non si toccano più, quindi il
        // divieto deve cadere sulla parte che si può ancora muovere. Senza
        // questa distinzione un brand i cui soli mesi chiusi superano il 100%
        // — succede a B2B ed Experience, che portano quote scritte con la
        // vecchia regola — resterebbe **bloccato per sempre**, perché nessuna
        // modifica possibile lo riporterebbe sotto.
        const ppChiusi = m.mesi.filter((x) => chiuso(x.month)).reduce((s, x) => s + quota(m, x, valore), 0);
        const ppAperti = pp - ppChiusi;
        const disponibile = Math.max(0, 100 - ppChiusi);
        return {
          m,
          ora,
          salvato,
          differenza: ora - salvato,
          pp,
          ppSalvati,
          ppDiff: pp - ppSalvati,
          speso,
          mesiMisurati: m.mesi.filter(misurato).map((x) => x.month),
          ppChiusi,
          ppAperti,
          disponibile,
          // Quanto manca al 100% (positivo) o di quanto si sfora (negativo).
          resta: 100 - pp,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maisons, modifiche, originali]
  );

  const totale = righe.reduce((s, r) => s + r.ora, 0);
  const totaleSalvato = righe.reduce((s, r) => s + r.salvato, 0);
  const differenza = totale - totaleSalvato;
  const totaleSpeso = righe.reduce((s, r) => s + r.speso, 0);
  const monteAnnuo = maisons.reduce((s, m) => s + m.pubblicatoAnno, 0);

  const chiaviToccate = Object.keys(modifiche).filter((k) => toccata(k));
  const mesiCambiati = [...new Set(chiaviToccate.map((k) => Number(k.split(":")[1])))].sort((a, b) => a - b);
  // Il bottone si accende sulle **caselle** toccate, non sulla differenza in
  // euro: due modifiche opposte che si compensano lasciano il totale identico
  // e sarebbero comunque da salvare.
  const daSalvare = chiaviToccate.length > 0;

  // Chi sfora il 100%: è **questa** la regola che blocca il salvataggio.
  // Una tolleranza di mezzo punto perché le quote si scrivono con un decimale e
  // dodici arrotondamenti non devono trasformarsi in un divieto.
  const TOLLERANZA = 0.5;
  // Blocca solo quello che si può ancora correggere: le quote dei mesi **aperti**
  // oltre quello che resta da assegnare.
  const sfora = (r: (typeof righe)[number]) => r.ppAperti > r.disponibile + TOLLERANZA;
  const sforanti = righe.filter(sfora);
  // Diverso, e non bloccabile: il budget dell'anno è già stato superato dai mesi
  // chiusi. Non c'è modifica che lo riporti indietro — si dice e basta.
  const giaSuperato = (r: (typeof righe)[number]) => r.ppChiusi > 100 + TOLLERANZA;

  // `quali` vuoto = tutti.
  async function salva(quali?: MaisonSpese[]) {
    const elenco = quali ?? maisons;
    const bloccati = righe.filter((r) => elenco.some((m) => m.id === r.m.id) && sfora(r));
    if (bloccati.length > 0) {
      setEsito(
        `${bloccati.map((r) => r.m.nome).join(", ")}: sui mesi ancora aperti si assegna più budget pubblicitario di quello che resta. Correggi prima di salvare.`
      );
      return;
    }
    setSalvo(quali && quali.length === 1 ? quali[0].id : "*");
    setEsito(null);
    // Si mandano **solo i mesi aperti**: un mese chiuso qui non ha input, e
    // spedirlo lo stesso lo riscriverebbe con il valore che si vede — identico
    // oggi, ma è esattamente il modo in cui un blocco smette di bloccare.
    const entries = elenco.flatMap((m) =>
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
    setSalvo(null);
    if (res.ok) {
      // Si azzerano **solo le caselle appena salvate**: con un salvataggio per
      // brand, ripulire tutto farebbe sparire le modifiche degli altri brand
      // dallo schermo senza che nessuno le abbia scritte da nessuna parte.
      const idSalvati = new Set(elenco.map((m) => m.id));
      setModifiche((p) =>
        Object.fromEntries(Object.entries(p).filter(([k]) => !idSalvati.has(k.split(":")[0])))
      );
      const scartati: number[] = Array.isArray(body?.mesiChiusiIgnorati) ? body.mesiChiusiIgnorati : [];
      const rifiutate: number = Number(body?.percentualiRifiutate ?? 0);
      const dove = quali && quali.length === 1 ? ` di ${quali[0].nome}` : "";
      setEsito(
        [
          `Percentuali${dove} salvate.`,
          scartati.length > 0
            ? `${scartati.map((m) => MESI[m - 1]).join(", ")} ${scartati.length === 1 ? "si è chiuso" : "si sono chiusi"} nel frattempo: ricarica la pagina.`
            : "",
          rifiutate > 0 ? `${rifiutate} valori fuori dal 0–100% sono stati rifiutati.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
      router.refresh();
    } else {
      setEsito(body?.error ?? "Salvataggio non riuscito, riprovare.");
    }
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Budget pubblicità {year}, tutti i brand</div>
          <div className="kpi-value">{eur(monteAnnuo)}</div>
          <div className="kpi-sub">è il 100%: le quote qui sotto lo distribuiscono fra i mesi</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Assegnato ai mesi</div>
          <div className="kpi-value">{eur(totale)}</div>
          <div className="kpi-sub">
            {totaleSpeso > 0
              ? `${eur(totaleSpeso)} già spesi + ${eur(totale - totaleSpeso)} ancora da spendere`
              : "somma di tutte le caselle"}
          </div>
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
      </div>

      {maisons.map((m) => {
        const riga = righe.find((r) => r.m.id === m.id)!;
        const modificatoQui = chiaviToccate.some((k) => k.startsWith(`${m.id}:`));
        const sforaQui = sfora(riga);
        return (
          <div className="card" key={m.id}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>{m.nome}</h2>
                <p className="page-caption">
                  Budget pubblicità dell&apos;anno <strong>{eur(m.pubblicatoAnno)}</strong>
                  {riga.speso > 0 && (
                    <>
                      {" "}
                      · già spesi <strong>{eur(riga.speso)}</strong> (
                      {riga.mesiMisurati.length > 0
                        ? `${MESI[riga.mesiMisurati[0] - 1]}–${MESI[riga.mesiMisurati[riga.mesiMisurati.length - 1] - 1]}`
                        : "mesi chiusi"}
                      )
                    </>
                  )}
                  {" · assegnato ai mesi "}
                  <strong>{eur(riga.ora)}</strong>
                  {riga.differenza !== 0 && (
                    <>
                      {" "}
                      <strong className={`delta ${riga.differenza > 0 ? "su" : "giu"}`}>
                        {riga.differenza > 0 ? "+" : "−"}
                        {eur(Math.abs(riga.differenza))}
                      </strong>{" "}
                      rispetto ai {eur(riga.salvato)} salvati
                    </>
                  )}
                </p>
                {/* La riga che risponde alla domanda vera: **le dodici quote
                    fanno 100?** Sopra si blocca, sotto si dice quanto resta. */}
                <p className="page-caption" style={{ marginTop: 2 }}>
                  Somma delle dodici quote:{" "}
                  <strong className={sforaQui ? "delta su" : Math.abs(riga.resta) <= TOLLERANZA ? "delta giu" : undefined}>
                    {punti(riga.pp)} p.p.
                  </strong>{" "}
                  {sforaQui ? (
                    <span className="delta su">
                      — <strong>{punti(riga.pp - 100)} p.p. oltre il 100%</strong>, cioè{" "}
                      {eur((m.pubblicatoAnno * (riga.pp - 100)) / 100)} di pubblicità che non c&apos;è
                    </span>
                  ) : Math.abs(riga.resta) <= TOLLERANZA ? (
                    <span className="delta giu">— il budget dell&apos;anno è tutto assegnato</span>
                  ) : riga.resta < 0 ? (
                    <span className="delta su">
                      — <strong>{punti(-riga.resta)} p.p. oltre il budget dell&apos;anno</strong>, cioè{" "}
                      {eur((m.pubblicatoAnno * -riga.resta) / 100)} in più
                    </span>
                  ) : (
                    <span className="muted">
                      — restano <strong>{punti(riga.resta)} p.p.</strong> da assegnare, cioè{" "}
                      {eur((m.pubblicatoAnno * riga.resta) / 100)}
                    </span>
                  )}
                  {riga.ppDiff !== 0 && (
                    <>
                      {" · "}
                      <span className={`delta ${riga.ppDiff > 0 ? "su" : "giu"}`}>
                        {riga.ppDiff > 0 ? "+" : "−"}
                        {punti(Math.abs(riga.ppDiff))} p.p.
                      </span>{" "}
                      rispetto ai {punti(riga.ppSalvati)} salvati
                    </>
                  )}
                </p>
              </div>
              {/* Il salvataggio del singolo brand sta nella sua scheda: dodici
                  caselle si sistemano un brand per volta, e dover scorrere fino
                  in fondo per salvarne uno fa salvare anche gli altri per sbaglio. */}
              <button
                className="btn"
                onClick={() => salva([m])}
                disabled={salvo !== null || !modificatoQui || sforaQui}
                title={
                  sforaQui
                    ? "Le dodici quote superano il 100%: correggile prima di salvare."
                    : !modificatoQui
                      ? "Niente da salvare su questo brand."
                      : `Salva solo le percentuali di ${m.nome}.`
                }
              >
                {salvo === m.id ? "Salvataggio…" : `Salva ${m.nome}`}
              </button>
            </div>

            {giaSuperato(riga) && (
              <div className="avviso-errore" style={{ marginBottom: 12 }}>
                <strong>
                  I soli mesi chiusi di {m.nome} valgono già {punti(riga.ppChiusi)}% del budget
                  pubblicitario dell&apos;anno.
                </strong>{" "}
                Il 100% è {eur(m.pubblicatoAnno)} e i mesi da {MESI[0]} a{" "}
                {MESI[primoMeseAperto - 2]}{" "}
                {riga.speso > 0 ? (
                  <>ne hanno già consumati <strong>{eur(riga.speso)}</strong></>
                ) : (
                  <>
                    ne impegnano <strong>{eur((m.pubblicatoAnno * riga.ppChiusi) / 100)}</strong> — quote
                    scritte quando la percentuale voleva dire un&apos;altra cosa
                  </>
                )}
                . Non è
                una cosa che si corregge da qui — quei mesi non si riscrivono — ma <strong>tutto quello che
                si assegna ai mesi ancora aperti si aggiunge a uno sforamento che c&apos;è già</strong>.
              </div>
            )}

            {sforaQui && (
              <div className="avviso-errore" style={{ marginBottom: 12 }}>
                <strong>
                  {riga.disponibile <= TOLLERANZA
                    ? `Del budget pubblicitario di ${m.nome} non resta niente da assegnare`
                    : `${m.nome} assegna ai mesi aperti ${punti(riga.ppAperti)}% quando ne restano ${punti(riga.disponibile)}`}
                </strong>
                : il 100% è il budget dell&apos;anno di questo brand,{" "}
                <strong>{eur(m.pubblicatoAnno)}</strong>, e continuare vorrebbe dire impegnare{" "}
                <strong>{eur((m.pubblicatoAnno * (riga.ppAperti - riga.disponibile)) / 100)}</strong> di
                pubblicità che non è a budget. Il salvataggio di questo brand resta bloccato finché la parte
                sui mesi aperti non rientra.
                <div style={{ marginTop: 6 }}>
                  Si toglie <strong>dai mesi ancora aperti</strong>: quelli chiusi non si toccano
                  {riga.speso > 0 ? (
                    <> — la loro quota è <strong>spesa davvero</strong> ({eur(riga.speso)}), non una decisione.</>
                  ) : (
                    <>.</>
                  )}
                </div>
              </div>
            )}

            <div className="mesi-grid">
              {m.mesi.map((x) => {
                const key = `${m.id}:${x.month}`;
                const bloccato = chiuso(x.month);
                const misura = misurato(x);
                const reale = quotaReale(m, x);
                // In un mese misurato la casella mostra la quota **consumata**,
                // arrotondata a un decimale solo per essere leggibile: il conto
                // sotto usa l'importo vero, non la percentuale arrotondata.
                const percent = misura && reale !== null ? Math.round(reale * 10) / 10 : valore(key);
                const importo = importoMese(m, x, valore);
                const importoSalvato = importoMese(m, x, (k) => originali[k] ?? 0);
                // Una singola casella oltre 100 è impossibile per definizione —
                // un mese non può prendersi più di tutto l'anno — ma il divieto
                // vero è sulla somma: qui si segnala solo il valore assurdo.
                const errata = !bloccato && (!Number.isFinite(percent) || percent < 0 || percent > 100);
                return (
                  <div className="mese-cell" key={x.month}>
                    <div className="k">
                      {MESI[x.month - 1]}
                      {bloccato && " · chiuso"}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={percent}
                      disabled={bloccato}
                      aria-invalid={errata || undefined}
                      className={[errata ? "errata" : "", toccata(key) && !errata ? "toccata" : ""]
                        .filter(Boolean)
                        .join(" ") || undefined}
                      title={
                        misura
                          ? `${MESI[x.month - 1]} è passato: questa è la quota davvero consumata — ${eur(x.speso ?? 0)} spesi sui ${eur(m.pubblicatoAnno)} dell'anno. La quota decisa a budget era ${punti(valore(key))}%.`
                          : bloccato
                            ? `${MESI[x.month - 1]} è un mese passato: il budget ADV non si riscrive dopo che è stato speso.`
                            : errata
                              ? "Fuori dallo 0–100%: un mese non può prendersi più del budget di tutto l'anno."
                              : undefined
                      }
                      onChange={(e) =>
                        setModifiche((p) => ({
                          ...p,
                          [key]: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                    />
                    {/* Tre righe **sempre**, ognuna su una riga sola: è quello
                        che tiene gli input della stessa riga alla stessa quota.
                        1) quanto fa, 2) su quanto (il monte annuo del brand),
                        3) se è speso o deciso — oppure di quanto si sposta. */}
                    <div className="sub">
                      {errata ? (
                        <>
                          <div className="errore">{percent > 100 ? "oltre il 100%" : "sotto zero"}</div>
                          <div className="errore">impossibile</div>
                          <div>su {eur(m.pubblicatoAnno)}</div>
                        </>
                      ) : (
                        <>
                          <div>= {eur(importo)}</div>
                          <div>su {eur(m.pubblicatoAnno)}</div>
                          {toccata(key) ? (
                            <div className={`delta ${importo >= importoSalvato ? "su" : "giu"}`}>
                              {importo >= importoSalvato ? "+" : "−"}
                              {eur(Math.abs(importo - importoSalvato))}
                            </div>
                          ) : (
                            <div className="fonte">{misura ? "speso davvero" : "a budget"}</div>
                          )}
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
          <strong>nasce a zero</strong>: senza budget pubblicitario dell&apos;anno non c&apos;è un 100% da
          distribuire, e le quote non hanno su cosa applicarsi finché non lo scrivi in{" "}
          <strong>Maison</strong>.
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
                <th className="num">Budget pubblicità anno</th>
                <th className="num">Somma quote</th>
                <th className="num">Assegnato</th>
                <th className="num">Da assegnare</th>
                <th className="num">Differenza</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.m.id}>
                  <td>{r.m.nome}</td>
                  <td className="num muted">{eur(r.m.pubblicatoAnno)}</td>
                  <td className={`num ${sfora(r) ? "neg" : ""}`}>{punti(r.pp)}%</td>
                  <td className="num">{eur(r.ora)}</td>
                  <td className={`num ${Math.abs(r.resta) <= TOLLERANZA ? "muted" : r.resta < 0 ? "neg" : ""}`}>
                    {Math.abs(r.resta) <= TOLLERANZA
                      ? "—"
                      : r.resta < 0
                        ? `${eur((r.m.pubblicatoAnno * -r.resta) / 100)} oltre`
                        : eur((r.m.pubblicatoAnno * r.resta) / 100)}
                  </td>
                  <td className={`num ${r.differenza === 0 ? "muted" : r.differenza > 0 ? "neg" : "pos"}`}>
                    {r.differenza === 0 ? "—" : `${r.differenza > 0 ? "+" : "−"}${eur(Math.abs(r.differenza))}`}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale {year}</td>
                <td className="num">{eur(monteAnnuo)}</td>
                {/* Sommare le quote di brand diversi non vuol dire niente: sono
                    percentuali di monti diversi. Qui va l'unica lettura onesta,
                    quanto è assegnato in euro. */}
                <td className="num muted">—</td>
                <td className="num">{eur(totale)}</td>
                <td className={`num ${Math.abs(monteAnnuo - totale) < 1 ? "" : monteAnnuo < totale ? "neg" : ""}`}>
                  {Math.abs(monteAnnuo - totale) < 1
                    ? "—"
                    : monteAnnuo < totale
                      ? `${eur(totale - monteAnnuo)} oltre`
                      : eur(monteAnnuo - totale)}
                </td>
                <td className={`num ${differenza === 0 ? "" : differenza > 0 ? "neg" : "pos"}`}>
                  {differenza === 0 ? "—" : `${differenza > 0 ? "+" : "−"}${eur(Math.abs(differenza))}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="page-caption" style={{ margin: "10px 14px 4px" }}>
          Il <strong>100% di un brand</strong> è il suo budget pubblicitario dell&apos;anno (l&apos;ADV
          «pubblicato» del monitoraggio): le dodici caselle dicono <strong>come si distribuisce fra i
          mesi</strong>, non quanto si spende in rapporto alle vendite. Per questo la somma delle quote non
          può superare 100 — sopra si impegnerebbe pubblicità che non c&apos;è, e il salvataggio è bloccato —
          mentre <strong>sotto il 100 si salva</strong>: quel budget semplicemente non è ancora stato
          assegnato a nessun mese, e la colonna «da assegnare» dice quanto vale.
          <br />
          Nei <strong>mesi già chiusi</strong> la quota non è una decisione ma una <strong>misura</strong>:
          quanto del monte annuo è stato davvero consumato, secondo Marketing.
          {!spesaOk && (
            <>
              {" "}
              <strong>Adesso Marketing non risponde</strong>: i mesi chiusi mostrano la quota decisa a
              budget, non quella consumata.
            </>
          )}
          {brandSenzaCasa.length > 0 && (
            <>
              {" "}
              <strong>
                In Marketing c&apos;è spesa su {brandSenzaCasa.join(", ")}, che qui non corrisponde a nessun
                brand
              </strong>
              : quella pubblicità non è in nessuna scheda.
            </>
          )}{" "}
          I brand che in Marketing non esistono (B2B, Experience) restano sulla quota a budget anche nei mesi
          chiusi. La colonna <strong>differenza</strong> è rispetto a quello che c&apos;è nel database adesso:
          finché non premi Salva vive solo in questa pagina.
        </p>
      </div>

      {sforanti.length > 0 && (
        <div className="avviso-errore" style={{ marginTop: 12 }}>
          <strong>
            {sforanti.length === 1
              ? `${sforanti[0].m.nome} assegna ai mesi aperti più budget pubblicitario di quello che gli resta`
              : `${sforanti.length} brand assegnano ai mesi aperti più budget pubblicitario di quello che gli resta`}
          </strong>
          :{" "}
          {sforanti
            .map((r) => `${r.m.nome} ${punti(r.ppAperti)}% su ${punti(r.disponibile)} disponibili`)
            .join(", ")}
          . Il salvataggio è bloccato — sia quello del brand sia quello generale — finché non rientrano.
        </div>
      )}

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button
          className="btn primary"
          onClick={() => salva()}
          disabled={salvo !== null || !daSalvare || sforanti.length > 0}
        >
          {salvo === "*"
            ? "Salvataggio…"
            : sforanti.length > 0
              ? "Correggi le somme oltre il 100%"
              : !daSalvare
                ? "Niente da salvare"
                : "Salva tutti i brand"}
        </button>
      </div>
    </>
  );
}
