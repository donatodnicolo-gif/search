"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

// Punti percentuali, con al più un decimale: `150 − 100` fa 50, ma `113,4 − 100`
// in virgola mobile fa 13,399999999999999 e a schermo sarebbe illeggibile.
const punti = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 });

type MeseSpesa = {
  month: number;
  vendite: number;
  reale: number | null;
  speso: number | null;
  percent: number;
  pubblicato: number;
};
type MaisonSpese = { id: string; nome: string; mesi: MeseSpesa[] };

export function SpeseEditor({
  year,
  maisons,
  primoMeseAperto,
  vendutoOk,
  spesaOk,
  brandSenzaCasa,
}: {
  year: number;
  maisons: MaisonSpese[];
  // Il primo mese ancora modificabile, deciso dal server: calcolarlo qui con
  // `new Date()` darebbe un valore diverso fra render sul server e idratazione
  // nel browser proprio a cavallo della mezzanotte del primo del mese.
  primoMeseAperto: number;
  // Se Orders ha risposto. Quando non risponde i mesi chiusi restano sul
  // budget e la pagina lo dice, invece di far passare un budget per consuntivo.
  vendutoOk: boolean;
  // Se Marketing ha risposto sulla spesa per brand.
  spesaOk: boolean;
  // Brand che Marketing conosce e che qui non hanno una maison: la loro spesa
  // non è in nessuna scheda, e dirlo evita di leggere il totale come completo.
  brandSenzaCasa: string[];
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
  // Quale salvataggio è in corso: l'id del brand, `"*"` per tutti, `null` per
  // nessuno. Un booleano solo metterebbe «Salvataggio…» su ogni bottone della
  // pagina mentre ne sta lavorando uno.
  const [salvo, setSalvo] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [nuovoBrand, setNuovoBrand] = useState("");
  const [creo, setCreo] = useState(false);
  const [esitoBrand, setEsitoBrand] = useState<string | null>(null);

  const chiuso = (month: number) => month < primoMeseAperto;

  // ---- Su cosa si applica la percentuale: il 100% di quel mese ----
  //
  // Per un mese **futuro** l'unica misura che esiste è il budget. Per un mese
  // **già chiuso** il budget è la previsione di allora, mentre il venduto vero
  // c'è: usare la previsione vorrebbe dire misurare la pubblicità di gennaio su
  // un numero che gennaio ha già smentito. Stessa scelta di `/maison`, dove i
  // mesi passati portano il loro consuntivo.
  //
  // ⚠️ **Il consuntivo per brand è il venduto dei negozi**, quindi copre il D2C
  // e non eventi o B2B: si usa **solo quando c'è** (sopra lo zero). Altrimenti
  // un brand B2B, che sui negozi non vende niente, si vedrebbe azzerare un
  // budget vero — cioè il difetto che questa modifica vuole togliere, al
  // contrario.
  const base = (x: MeseSpesa) =>
    chiuso(x.month) && x.reale !== null && x.reale > 0 ? x.reale : x.vendite;
  const daConsuntivo = (x: MeseSpesa) => chiuso(x.month) && x.reale !== null && x.reale > 0;

  // ---- E per un mese chiuso, la percentuale non è più una decisione ----
  //
  // Su un mese già passato «quanto posso spendere» non è una domanda: i soldi
  // sono usciti. La percentuale che conta è quella **misurata** — spesa vera di
  // Marketing ÷ venduto vero — e l'importo è quello speso davvero. La
  // percentuale a budget resta a database, intatta: qui semplicemente non è più
  // la cosa da guardare.
  //
  // `speso === null` vuol dire **non misurato** (mese aperto, Marketing muto, o
  // brand che in Marketing non esiste — B2B ed Experience non fanno campagne):
  // lì si continua a mostrare il consentito a budget, dichiarandolo.
  const misurato = (x: MeseSpesa) => chiuso(x.month) && x.speso !== null;
  const percentualeReale = (x: MeseSpesa) =>
    misurato(x) && base(x) > 0 ? ((x.speso ?? 0) / base(x)) * 100 : null;

  // L'importo della casella: speso davvero dove è misurato, consentito dove no.
  // Tutti i totali passano di qui, così **il totale somma le sue caselle** —
  // un totale che non torna con quello che si legge sopra è il modo più veloce
  // per non fidarsi più di una pagina.
  const importoMese = (m: MaisonSpese, x: MeseSpesa, percentuale: (key: string) => number) =>
    misurato(x) ? x.speso ?? 0 : (base(x) * percentuale(`${m.id}:${x.month}`)) / 100;

  const valore = (key: string) => modifiche[key] ?? originali[key] ?? 0;
  const toccata = (key: string) => modifiche[key] !== undefined && modifiche[key] !== (originali[key] ?? 0);

  // Una percentuale sopra il 100 vuol dire spendere in pubblicità **più di
  // quanto quel mese vende**: non è un budget aggressivo, è un budget
  // impossibile. `max={100}` sull'input non lo impedisce (frena le frecce, non
  // la tastiera) e l'API prima lo **tagliava in silenzio** a 100 — che è peggio
  // di un errore, perché a schermo restava 150 e a database finiva 100.
  const fuoriScala = (key: string) => {
    const v = valore(key);
    return !Number.isFinite(v) || v < 0 || v > 100;
  };
  // Si controllano **tutti** i mesi aperti, non solo quelli toccati: il
  // salvataggio manda comunque tutto quello che è ancora scrivibile, quindi un
  // valore fuori scala rimasto lì da prima partirebbe insieme agli altri.
  // Ogni sforamento porta con sé **di quanto** sfora e **quanto vale il 100%**
  // di quel mese: «impossibile» senza il metro obbliga a cercarlo altrove.
  const fuoriScalaDettagli = (elenco: MaisonSpese[]) =>
    elenco.flatMap((m) =>
      m.mesi
        .filter((x) => !chiuso(x.month) && fuoriScala(`${m.id}:${x.month}`))
        .map((x) => ({
          maison: m.nome,
          month: x.month,
          percent: valore(`${m.id}:${x.month}`),
          // Il 100% di un mese è, per definizione, tutto quello che quel mese
          // vende: è il tetto della spesa, e va detto in euro.
          cento: base(x),
          punti: valore(`${m.id}:${x.month}`) - 100,
        }))
    );

  // Consentito di una maison con una certa mappa di percentuali: serve due
  // volte per ogni riga (com'è adesso e com'era salvato), quindi una funzione
  // sola invece di due somme che possono divergere.
  const consentito = (m: MaisonSpese, percentuale: (key: string) => number, mesi?: (x: MeseSpesa) => boolean) =>
    m.mesi
      .filter((x) => (mesi ? mesi(x) : true))
      .reduce((s, x) => s + importoMese(m, x, percentuale), 0);

  // La **somma dei punti percentuali** dei dodici mesi. Non è una percentuale —
  // sommare percentuali di basi diverse non dà una percentuale — ma è il numero
  // con cui si controlla a colpo d'occhio quanto si sta distribuendo sull'anno,
  // e di quanto lo si è spostato. Per questo si scrive «p.p.» e non «%», e
  // accanto c'è la media, che invece una lettura percentuale ce l'ha.
  // Nei mesi misurati contano i punti **veri**, non quelli decisi allora: la
  // somma diventa «quanto ho davvero usato + quanto ho pianificato».
  const puntiTotali = (m: MaisonSpese, percentuale: (key: string) => number) =>
    m.mesi.reduce(
      (s, x) => s + (misurato(x) ? percentualeReale(x) ?? 0 : percentuale(`${m.id}:${x.month}`)),
      0
    );

  const righe = useMemo(
    () =>
      maisons.map((m) => {
        const ora = consentito(m, valore);
        const salvato = consentito(m, (k) => originali[k] ?? 0);
        const pp = puntiTotali(m, valore);
        const ppSalvati = puntiTotali(m, (k) => originali[k] ?? 0);
        // Quanto di quel totale è **già speso** e quanto è ancora una
        // decisione: sommarli senza distinguerli farebbe leggere come budget
        // dei soldi che sono già usciti.
        const speso = m.mesi.filter(misurato).reduce((s, x) => s + (x.speso ?? 0), 0);
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
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maisons, modifiche, originali]
  );

  const totale = righe.reduce((s, r) => s + r.ora, 0);
  const totaleSalvato = righe.reduce((s, r) => s + r.salvato, 0);
  const differenza = totale - totaleSalvato;

  const totaleSpeso = righe.reduce((s, r) => s + r.speso, 0);
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
  const erroriTotali = fuoriScalaDettagli(maisons);

  // Quali brand hanno qualcosa da salvare e quali sono bloccati da un valore
  // impossibile: servono al bottone di ogni scheda e a quello finale.
  const daSalvarePerMaison = (m: MaisonSpese) =>
    chiaviToccate.some((k) => k.startsWith(`${m.id}:`));
  const erroriPerMaison = (m: MaisonSpese) => fuoriScalaDettagli([m]);

  // `quali` vuoto = tutti. Salvare un brand per volta è il gesto naturale
  // («sistemo Deluxy.it e lo metto via»), ma il salvataggio resta uno solo:
  // due percorsi diversi verso la stessa PUT divergono al primo cambiamento.
  async function salva(quali?: MaisonSpese[]) {
    const elenco = quali ?? maisons;
    const errori = fuoriScalaDettagli(elenco);
    if (errori.length > 0) {
      setEsito("Ci sono percentuali oltre il 100%: correggile prima di salvare.");
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
      // Il server rifiuta i mesi chiusi anche se il form non li manda: se ne ha
      // scartato qualcuno vuol dire che questa scheda era aperta da prima che
      // il mese si chiudesse, e dirlo evita di credere di aver salvato.
      const scartati: number[] = Array.isArray(body?.mesiChiusiIgnorati) ? body.mesiChiusiIgnorati : [];
      const rifiutate: number = Number(body?.percentualiRifiutate ?? 0);
      const dove = quali && quali.length === 1 ? `di ${quali[0].nome}` : "";
      setEsito(
        [
          `Percentuali ${dove} salvate.`.replace("  ", " "),
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
          <div className="kpi-label">Pubblicità {year}, tutti i brand</div>
          <div className="kpi-value">{eur(totale)}</div>
          <div className="kpi-sub">
            {totaleSpeso > 0
              ? `${eur(totaleSpeso)} già spesi + ${eur(totale - totaleSpeso)} ancora consentiti`
              : "si aggiorna con le % qui sotto"}
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
        const erroriQui = erroriPerMaison(m);
        const modificatoQui = daSalvarePerMaison(m);
        return (
          <div className="card" key={m.id}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>{m.nome}</h2>
                <p className="page-caption">
                  {riga.speso > 0 ? (
                    <>
                      Speso davvero <strong>{eur(riga.speso)}</strong> (
                      {riga.mesiMisurati.length > 0
                        ? `${MESI[riga.mesiMisurati[0] - 1]}–${MESI[riga.mesiMisurati[riga.mesiMisurati.length - 1] - 1]}`
                        : "mesi chiusi"}
                      ) · consentito {eur(riga.ora - riga.speso)} sul resto dell&apos;anno
                    </>
                  ) : (
                    <>Consentito {eur(riga.ora)}</>
                  )}{" "}
                  · pubblicato {eur(totPubblicato)}
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
                {/* La somma dei punti percentuali dei dodici mesi: quanto si sta
                    distribuendo sull'anno, in un numero solo. Sta accanto alla
                    media perché la somma da sola non si sa su cosa leggerla. */}
                <p className="page-caption" style={{ marginTop: 2 }}>
                  Somma delle percentuali: <strong>{punti(riga.pp)} p.p.</strong> su {m.mesi.length} mesi ·
                  media {punti(riga.pp / (m.mesi.length || 1))}%
                  {riga.ppDiff !== 0 && (
                    <>
                      {" · "}
                      <strong className={`delta ${riga.ppDiff > 0 ? "su" : "giu"}`}>
                        {riga.ppDiff > 0 ? "+" : "−"}
                        {punti(Math.abs(riga.ppDiff))} p.p.
                      </strong>{" "}
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
                disabled={salvo !== null || !modificatoQui || erroriQui.length > 0}
                title={
                  erroriQui.length > 0
                    ? "C'è una percentuale oltre il 100%: correggila prima di salvare."
                    : !modificatoQui
                      ? "Niente da salvare su questo brand."
                      : `Salva solo le percentuali di ${m.nome}.`
                }
              >
                {salvo === m.id ? "Salvataggio…" : `Salva ${m.nome}`}
              </button>
            </div>

            {erroriQui.length > 0 && (
              <div className="avviso-errore" style={{ marginBottom: 12 }}>
                <strong>
                  {erroriQui.length === 1 ? "Una percentuale supera" : `${erroriQui.length} percentuali superano`} il
                  100%
                </strong>
                : vorrebbe dire spendere in pubblicità <strong>più di quanto il mese vende</strong>.
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {erroriQui.map((e) => (
                    <li key={e.month}>
                      <strong>{MESI[e.month - 1]}</strong>: {punti(e.percent)}% —{" "}
                      {e.punti > 0 ? (
                        <>
                          <strong>{punti(e.punti)} punti oltre il 100%</strong>, e per quel mese il{" "}
                          <strong>100% è {eur(e.cento)}</strong> (tetto della spesa){" "}
                          {e.cento > 0 && <>· a {punti(e.percent)}% farebbe {eur((e.cento * e.percent) / 100)}</>}
                        </>
                      ) : (
                        <strong>sotto zero</strong>
                      )}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 8 }}>
                  Il salvataggio di questo brand resta bloccato finché non torna dentro lo 0–100%.
                </div>
              </div>
            )}
            <div className="mesi-grid">
              {m.mesi.map((x) => {
                const key = `${m.id}:${x.month}`;
                const bloccato = chiuso(x.month);
                // In un mese misurato la casella non mostra più la decisione di
                // allora ma la percentuale **vera**: spesa ÷ venduto. Arrotondata
                // a un decimale solo per essere leggibile — il conto sotto usa
                // l'importo vero, non la percentuale arrotondata.
                const reale = percentualeReale(x);
                const misura = misurato(x);
                const percent = misura && reale !== null ? Math.round(reale * 10) / 10 : valore(key);
                const importo = importoMese(m, x, valore);
                const importoSalvato = importoMese(m, x, (k) => originali[k] ?? 0);
                // Un mese chiuso non si può correggere: segnarlo in rosso
                // additerebbe un errore che nessuno può togliere.
                const errata = !bloccato && fuoriScala(key);
                return (
                  <div className="mese-cell" key={x.month}>
                    {/* L'etichetta resta corta — il mese e poco altro — perché è
                        quella che andando a capo sfalsava la riga. Il metro (su
                        quanto si applica la percentuale, e se è budget o
                        consuntivo) sta sotto l'input, dove lo si legge insieme
                        all'importo. */}
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
                          ? `${MESI[x.month - 1]} è passato: questa è la percentuale vera — ${eur(x.speso ?? 0)} spesi su ${eur(base(x))} venduti, misurati da Marketing e dal registro ordini. La percentuale decisa a budget era ${punti(valore(key))}%.`
                          : bloccato
                            ? `${MESI[x.month - 1]} è un mese passato: il budget ADV non si riscrive dopo che è stato speso.`
                            : errata
                              ? "Fuori dallo 0–100%: la pubblicità di un mese non può superare quello che il mese vende."
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
                        1) quanto fa, 2) su quanto (il 100% del mese), 3) da dove
                        viene quel 100% — oppure, se la casella è stata toccata,
                        di quanto si sposta. */}
                    <div className="sub">
                      {errata ? (
                        <>
                          <div className="errore">
                            {percent > 100 ? `+${punti(percent - 100)} punti` : "sotto zero"}
                          </div>
                          <div className="errore">{percent > 100 ? "oltre il 100%" : "impossibile"}</div>
                          <div>su {eur(base(x))}</div>
                        </>
                      ) : (
                        <>
                          <div>= {eur(importo)}</div>
                          <div>su {eur(base(x))}</div>
                          {toccata(key) ? (
                            <div className={`delta ${importo >= importoSalvato ? "su" : "giu"}`}>
                              {importo >= importoSalvato ? "+" : "−"}
                              {eur(Math.abs(importo - importoSalvato))}
                            </div>
                          ) : (
                            <div className="fonte">
                              {misura ? "speso davvero" : daConsuntivo(x) ? "venduto reale" : "a budget"}
                            </div>
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
                <th className="num">Speso davvero</th>
                <th className="num">Consentito sul resto</th>
                <th className="num">Totale</th>
                <th className="num">Differenza</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.m.id}>
                  <td>{r.m.nome}</td>
                  <td className="num">{r.speso > 0 ? eur(r.speso) : <span className="muted">—</span>}</td>
                  <td className="num">{eur(r.ora - r.speso)}</td>
                  <td className="num">{eur(r.ora)}</td>
                  <td className={`num ${r.differenza === 0 ? "muted" : r.differenza > 0 ? "neg" : "pos"}`}>
                    {r.differenza === 0 ? "—" : `${r.differenza > 0 ? "+" : "−"}${eur(Math.abs(r.differenza))}`}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale {year}</td>
                <td className="num">{eur(totaleSpeso)}</td>
                <td className="num">{eur(totale - totaleSpeso)}</td>
                <td className="num">{eur(totale)}</td>
                <td className={`num ${differenza === 0 ? "" : differenza > 0 ? "neg" : "pos"}`}>
                  {differenza === 0 ? "—" : `${differenza > 0 ? "+" : "−"}${eur(Math.abs(differenza))}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="page-caption" style={{ margin: "10px 14px 4px" }}>
          La colonna <strong>«differenza»</strong> è rispetto a quello che c&apos;è nel database adesso:
          finché non premi Salva vive solo in questa pagina, e ricaricando sparisce — e riguarda solo la
          colonna «consentito sul resto», perché lo speso non si modifica. Ogni brand ha il{" "}
          <strong>suo bottone</strong> nella sua scheda; quello qui sotto salva tutti insieme.
          <br />
          <strong>Cosa c&apos;è nelle caselle</strong>: sui mesi ancora aperti la percentuale che hai
          deciso, applicata al <strong>budget</strong> del mese. Sui mesi già chiusi la percentuale{" "}
          <strong>vera</strong> — quello che Marketing dice sia stato speso diviso quello che i negozi
          hanno venduto davvero — e l&apos;importo speso. Su un mese passato «quanto posso spendere» non è
          una domanda: i soldi sono usciti. Ogni casella dichiara quale dei due sta mostrando (
          <em>speso davvero</em>, <em>venduto reale</em>, <em>a budget</em>).
          {!spesaOk && (
            <>
              {" "}
              <strong>Adesso Marketing non risponde</strong>: i mesi chiusi mostrano il consentito a
              budget, non lo speso.
            </>
          )}
          {brandSenzaCasa.length > 0 && (
            <>
              {" "}
              <strong>
                In Marketing c&apos;è spesa su {brandSenzaCasa.join(", ")}, che qui non corrisponde a nessun
                brand
              </strong>
              : quella pubblicità non è in nessuna scheda e non è in questo totale.
            </>
          )}{" "}
          I brand che in Marketing non esistono (B2B, Experience) restano sul consentito a budget anche
          nei mesi chiusi.
          {!vendutoOk && (
            <>
              {" "}
              <strong>Adesso però Orders non risponde</strong>: i mesi chiusi stanno tutti sul budget, e dove
              il budget è a zero il consentito risulta zero.
            </>
          )}{" "}
          Il budget ADV che usano <strong>Piattaforme</strong> e il <strong>P&amp;L</strong> resta invece
          sulle vendite a budget anche per i mesi chiusi: i due numeri possono non coincidere, ed è scritto
          apposta finché la regola non si porta anche lì. Dentro il totale ci sono{" "}
          <strong>{eur(totaleChiusi)}</strong> di mesi chiusi
          {primoMeseAperto > 1 ? ` (Gen–${MESI[primoMeseAperto - 2]})` : ""}, che non si possono più muovere:
          la differenza qui sopra riguarda solo {MESI[primoMeseAperto - 1]}–Dic.
        </p>
      </div>

      {erroriTotali.length > 0 && (
        <div className="avviso-errore" style={{ marginTop: 12 }}>
          <strong>
            {erroriTotali.length === 1
              ? "Una percentuale è fuori dallo 0–100%"
              : `${erroriTotali.length} percentuali sono fuori dallo 0–100%`}
          </strong>
          : una spesa pubblicitaria sopra il 100% delle vendite del mese non è un budget aggressivo, è un
          budget <strong>impossibile</strong> — il <strong>100%</strong> di un mese è tutto quello che quel
          mese vende, e quello è il tetto.{" "}
          {erroriTotali
            .filter((e) => e.punti > 0)
            .map((e) => `${e.maison} ${MESI[e.month - 1]}: +${punti(e.punti)} punti (100% = ${eur(e.cento)})`)
            .join(" · ")}
          . Il salvataggio è bloccato — sia quello del brand sia quello generale — finché i valori non
          rientrano. Le caselle interessate sono in rosso.
        </div>
      )}

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button
          className="btn primary"
          onClick={() => salva()}
          disabled={salvo !== null || !daSalvare || erroriTotali.length > 0}
        >
          {salvo === "*"
            ? "Salvataggio…"
            : erroriTotali.length > 0
              ? "Correggi le percentuali impossibili"
              : !daSalvare
                ? "Niente da salvare"
                : "Salva tutti i brand"}
        </button>
      </div>
    </>
  );
}
