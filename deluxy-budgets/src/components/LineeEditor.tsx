"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MESI } from "@/lib/format";

// Il **budget delle linee di vendita, mese per mese**. Due misure sulla stessa
// griglia — valore in € e nuovi clienti — e si guarda una per volta: dodici
// mesi × due numeri nella stessa riga fanno ventiquattro caselle, e a quel
// punto non si legge più niente. Il selettore in cima cambia la misura, la
// griglia resta la stessa.

type Mese = { month: number; valore: number; clienti: number };
export type LineaBudget = {
  id: string;
  nome: string;
  // `true` quando la linea esiste anche in Scout, che è il master dell'elenco.
  // Una riga a budget senza corrispondenza in Scout non è un errore — può
  // essere una linea chiusa — ma va detto, non lasciato indovinare.
  inScout: boolean;
  attiva: boolean | null;
  mesi: Mese[];
  // Le tipologie di Finance che compongono il consuntivo di questa linea.
  vociFinance: string[];
  // Con quale tipologia di servizio fattura: da lì eredita il margine nel P&L.
  // `null` = non deciso, e allora il margine vale zero.
  tipologiaSlug: string | null;
  // Il fatturato vero mese per mese, **o `null`**. Un `null` non e uno zero:
  // senza collegamento a Finance non sappiamo quanto ha fatturato, e «0 €»
  // direbbe che non ha venduto niente.
  consuntivo: number[] | null;
};

type Misura = "valore" | "clienti";

// ---- Le cifre che si scrivono portano il separatore delle migliaia ----
//
// ⚠️ Un `<input type="number">` **non puo** mostrarlo: il browser accetta solo
// la notazione informatica (`13000`), e qualunque punto lo rende un valore non
// valido. Quindi qui i campi sono `type="text"` con `inputMode`, e la
// formattazione la fa il componente.
//
// ⭐ E si formatta **quando il campo non e a fuoco**, non a ogni tasto: riscrivere
// il testo sotto le dita sposta il cursore a fine riga, e correggere la seconda
// cifra di un numero di sei diventa impossibile. Mentre si scrive si vedono le
// cifre nude, appena si esce compaiono i punti.
//
// ⚠️ `useGrouping: "always"` non è pignoleria: l'italiano di CLDR **non** separa
// i numeri di quattro cifre, quindi `toLocaleString("it-IT")` su 2000 scrive
// «2000» — e qui i budget di quattro cifre sono la maggioranza, cioè proprio
// quelli su cui il separatore era stato chiesto.
const formatta = (v: number, misura: Misura) =>
  v.toLocaleString("it-IT", {
    maximumFractionDigits: misura === "valore" ? 0 : 2,
    useGrouping: "always",
  });

// Convenzione italiana: il **punto separa le migliaia**, la **virgola i
// decimali**. «1.500» sono millecinquecento, non uno virgola cinque — e mezzo
// cliente esiste davvero a database (0,5), quindi la virgola serve.
const leggiNumero = (t: string): number | null => {
  // Via spazi (anche unificatori), euro e punti di migliaia; la virgola
  // diventa il punto decimale che Number() capisce.
  const pulito = t.replace(/[\s\u00A0\u20AC.]/g, "").replace(",", ".");
  // Campo svuotato = zero, che è una scelta legittima (un mese senza budget).
  if (pulito === "") return 0;
  const n = Number(pulito);
  // `null` = «questo non è un numero»: la casella si segna in rosso e il valore
  // non si scrive. Azzerarla in silenzio per un carattere di troppo sarebbe la
  // peggiore delle due.
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function LineeEditor({
  year,
  linee,
  primoMeseAperto,
  lineeScoutSenzaBudget,
  vociFinanceNote,
  consuntivoOk,
  tipologie,
}: {
  year: number;
  linee: LineaBudget[];
  // Deciso dal server: `new Date()` in un componente client dà un valore sul
  // server e un altro nel browser, e a cavallo del primo del mese i due render
  // non coinciderebbero.
  primoMeseAperto: number;
  // Linee che Scout conosce e che qui non hanno una riga di budget: si aprono
  // da qui, invece di aprire il database.
  lineeScoutSenzaBudget: string[];
  // I nomi delle tipologie che Finance conosce: si mostrano a chi deve
  // collegare una linea, perche indovinarli a memoria e il modo piu veloce per
  // scriverne uno che non esiste e restare senza consuntivo senza capire perche.
  vociFinanceNote: string[];
  consuntivoOk: boolean;
  // Le tipologie di servizio col loro margine: una linea ne sceglie una e da
  // quella eredita il margine con cui entra nel conto economico.
  tipologie: { slug: string; nome: string; marginePct: number }[];
}) {
  const router = useRouter();
  const [misura, setMisura] = useState<Misura>("valore");
  const [modifiche, setModifiche] = useState<Record<string, number>>({});
  const [salvo, setSalvo] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [creo, setCreo] = useState<string | null>(null);
  // Quale casella è a fuoco e cosa ci si sta scrivendo dentro, prima che
  // diventi un numero. Serve perché il testo a schermo e il valore salvato non
  // sono più la stessa cosa: «13.000» a riposo, `13000` mentre si digita.
  const [aFuoco, setAFuoco] = useState<string | null>(null);
  const [grezzo, setGrezzo] = useState<string | null>(null);
  const [invalida, setInvalida] = useState<string | null>(null);

  // Il consuntivo del mese, o `null` se la linea non è collegata a Finance.
  const consuntivoDi = (l: LineaBudget, month: number) => l.consuntivo?.[month - 1] ?? null;
  // ⚠️ Il totale del consuntivo somma **solo le linee collegate**: le altre non
  // valgono zero, non si sanno. Per questo accanto al totale si dice quante
  // linee ci sono dentro, invece di lasciar credere che sia il fatturato intero.
  const totConsuntivoMese = (month: number) =>
    linee.reduce((s, l) => s + (consuntivoDi(l, month) ?? 0), 0);
  const collegate = linee.filter((l) => l.consuntivo !== null).length;

  // La mappatura verso le voci di Finance, come testo «A, B, C» per riga.
  const [voci, setVoci] = useState<Record<string, string>>(() =>
    Object.fromEntries(linee.map((l) => [l.id, l.vociFinance.join(", ")]))
  );
  const [salvoVoci, setSalvoVoci] = useState(false);
  // La tipologia scelta per riga, come slug ("" = non decisa).
  const [tip, setTip] = useState<Record<string, string>>(() =>
    Object.fromEntries(linee.map((l) => [l.id, l.tipologiaSlug ?? ""]))
  );
  const senzaTipologia = linee.filter((l) => !l.tipologiaSlug).length;

  const chiuso = (month: number) => month < primoMeseAperto;
  const key = (lineaId: string, month: number, m: Misura) => `${lineaId}:${month}:${m}`;

  // Lo stato tiene **solo le caselle toccate**: i valori salvati restano la
  // base, così dopo un `router.refresh()` i numeri nuovi entrano da soli invece
  // di restare congelati in uno stato inizializzato una volta sola.
  const originali = useMemo(() => {
    const o: Record<string, number> = {};
    for (const l of linee)
      for (const x of l.mesi) {
        o[key(l.id, x.month, "valore")] = x.valore;
        o[key(l.id, x.month, "clienti")] = x.clienti;
      }
    return o;
  }, [linee]);

  const valore = (k: string) => modifiche[k] ?? originali[k] ?? 0;
  const toccata = (k: string) => k in modifiche && modifiche[k] !== (originali[k] ?? 0);

  const totLinea = (l: LineaBudget, m: Misura) =>
    l.mesi.reduce((s, x) => s + valore(key(l.id, x.month, m)), 0);
  const totLineaSalvato = (l: LineaBudget, m: Misura) =>
    l.mesi.reduce((s, x) => s + (originali[key(l.id, x.month, m)] ?? 0), 0);
  const totMese = (month: number, m: Misura) =>
    linee.reduce((s, l) => s + valore(key(l.id, month, m)), 0);

  const totale = linee.reduce((s, l) => s + totLinea(l, misura), 0);
  const totaleSalvato = linee.reduce((s, l) => s + totLineaSalvato(l, misura), 0);
  const differenza = totale - totaleSalvato;

  const chiaviToccate = Object.keys(modifiche).filter(toccata);
  const toccateDi = (lineaId: string) => chiaviToccate.filter((k) => k.startsWith(`${lineaId}:`));

  // Totali e caselle usano lo **stesso** formattatore: con `eur()` la riga
  // totale avrebbe scritto «2000 €» sotto una casella che dice «2.000», e due
  // modi di scrivere lo stesso numero nella stessa tabella si leggono come due
  // numeri diversi.
  const mostra = (v: number) => (misura === "valore" ? `${formatta(v, misura)} €` : formatta(v, misura));

  async function salva(quali: LineaBudget[]) {
    const ids = new Set(quali.map((l) => l.id));
    // Si manda la **coppia intera** (valore + clienti) del mese: l'upsert scrive
    // tutti e due i campi, e mandarne uno solo azzererebbe l'altro. È il tipo di
    // perdita che non fa rumore, perché la misura cancellata è quella che in
    // quel momento non si sta guardando.
    const mesiToccati = new Map<string, Set<number>>();
    for (const k of chiaviToccate) {
      const [lineaId, month] = k.split(":");
      if (!ids.has(lineaId)) continue;
      if (!mesiToccati.has(lineaId)) mesiToccati.set(lineaId, new Set());
      mesiToccati.get(lineaId)!.add(Number(month));
    }
    const entries: { lineaId: string; month: number; valore: number; clienti: number }[] = [];
    for (const [lineaId, mesi] of mesiToccati)
      for (const month of mesi)
        entries.push({
          lineaId,
          month,
          valore: valore(key(lineaId, month, "valore")),
          clienti: valore(key(lineaId, month, "clienti")),
        });
    if (entries.length === 0) return;

    setSalvo(quali.length === 1 ? quali[0].id : "*");
    setEsito(null);
    const res = await fetch("/api/commerciale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, entries }),
    });
    const body = await res.json().catch(() => null);
    setSalvo(null);
    if (!res.ok) {
      setEsito(body?.error ?? "Salvataggio non riuscito, riprova.");
      return;
    }
    // Si ripuliscono **solo le caselle salvate**: azzerare tutto farebbe sparire
    // dallo schermo le modifiche delle altre linee senza che nessuno le abbia
    // scritte da nessuna parte.
    setModifiche((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.has(k.split(":")[0]))));
    const chiusiIgnorati: number[] = body.mesiChiusiIgnorati ?? [];
    setEsito(
      `${body.scritti} ${body.scritti === 1 ? "mese salvato" : "mesi salvati"}` +
        (body.rifiutati > 0 ? ` · ${body.rifiutati} scartati (valori non validi)` : "") +
        // Non dovrebbe capitare — le caselle dei mesi chiusi non esistono più —
        // ma se capita è perché la pagina è vecchia, e allora va detto.
        (chiusiIgnorati.length > 0
          ? ` · ${chiusiIgnorati.map((m) => MESI[m - 1]).join(", ")} non ${
              chiusiIgnorati.length === 1 ? "scritto" : "scritti"
            }: mesi già chiusi`
          : "") +
        "."
    );
    router.refresh();
  }

  async function salvaVoci() {
    setSalvoVoci(true);
    setEsito(null);
    const res = await fetch("/api/commerciale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappature: linee.map((l) => ({
          lineaId: l.id,
          vociFinance: voci[l.id] ?? "",
          tipologiaSlug: tip[l.id] ?? "",
        })),
      }),
    });
    const body = await res.json().catch(() => null);
    setSalvoVoci(false);
    if (!res.ok) {
      setEsito(body?.error ?? "Collegamenti non salvati, riprova.");
      return;
    }
    setEsito("Collegamenti salvati.");
    router.refresh();
  }

  async function apriLinea(nome: string) {
    setCreo(nome);
    setEsito(null);
    const res = await fetch("/api/commerciale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const body = await res.json().catch(() => null);
    setCreo(null);
    if (!res.ok) {
      setEsito(body?.error ?? "Linea non creata, riprova.");
      return;
    }
    setEsito(`«${nome}» ora ha una riga di budget: nasce a zero.`);
    router.refresh();
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Budget per linea, mese per mese</h2>
          <p className="page-caption">
            {misura === "valore" ? (
              <>
                Quanto ci si aspetta di <strong>vendere</strong> su ogni linea, mese per mese. Il totale
                dell&apos;anno è <strong>{mostra(totale)}</strong>.
              </>
            ) : (
              <>
                Quanti <strong>nuovi clienti</strong> (o attivazioni) porta ogni linea, mese per mese. In
                tutto <strong>{mostra(totale)}</strong> sull&apos;anno.
              </>
            )}
            {differenza !== 0 && (
              <>
                {" "}
                <strong className={`delta ${differenza > 0 ? "su" : "giu"}`}>
                  {differenza > 0 ? "+" : "−"}
                  {mostra(Math.abs(differenza))}
                </strong>{" "}
                rispetto a quello che è salvato.
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            <button
              className={misura === "valore" ? "on" : ""}
              onClick={() => setMisura("valore")}
              title="Il valore atteso in euro."
            >
              Valore €
            </button>
            <button
              className={misura === "clienti" ? "on" : ""}
              onClick={() => setMisura("clienti")}
              title="I nuovi clienti o le attivazioni attese."
            >
              Nuovi clienti
            </button>
          </div>
        </div>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table className="tab-mesi">
            <thead>
              <tr>
                <th>Linea</th>
                {MESI.map((m, i) => (
                  <th className="num" key={m} title={chiuso(i + 1) ? `${m} è un mese passato.` : undefined}>
                    {m}
                    {chiuso(i + 1) && (
                      <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>consuntivo</div>
                    )}
                  </th>
                ))}
                <th className="num">Anno</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => {
                const toccate = toccateDi(l.id);
                const diff = totLinea(l, misura) - totLineaSalvato(l, misura);
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                      {l.nome}
                      {!l.inScout && (
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                          non è fra le linee di Scout
                        </div>
                      )}
                      {l.attiva === false && (
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>in standby</div>
                      )}
                    </td>
                    {MESI.map((_, i) => {
                      const month = i + 1;
                      const k = key(l.id, month, misura);
                      const reale = consuntivoDi(l, month);
                      // ⚠️ **Un mese passato non si scrive** (decisione
                      // dell'utente, 23/08/2026). E non si mostra nemmeno come
                      // casella spenta: lì il numero che conta è il consuntivo,
                      // e una casella disabilitata col budget dentro metterebbe
                      // in primo piano proprio quello che non serve più. Il
                      // budget resta scritto **sotto**, piccolo, perché il
                      // confronto è il motivo per cui si guarda un mese chiuso.
                      if (chiuso(month)) {
                        const budget = valore(k);
                        return (
                          <td className="num chiusa" key={month}>
                            <div
                              style={{ fontWeight: 600 }}
                              title={
                                misura !== "valore"
                                  ? `I nuovi clienti non si consuntivano: Finance conosce il fatturato, non le attivazioni.`
                                  : reale === null
                                    ? `${l.nome} non è collegata a nessuna voce di Finance: il consuntivo non è zero, è non misurato.`
                                    : `Fatturato davvero a ${MESI[i]} (imponibile di Finance).`
                              }
                            >
                              {misura !== "valore" ? "—" : reale === null ? "n.d." : formatta(reale, "valore")}
                            </div>
                            {/* Solo il numero: «a budget 13.000» in dodici
                                colonne allargava la tabella oltre lo schermo, e
                                la parola la dicono il titolo e la legenda. */}
                            <div
                              className="muted"
                              style={{ fontSize: 10.5, marginTop: 2, whiteSpace: "nowrap" }}
                              title={budget > 0 ? "Quanto era a budget" : "Nessun budget scritto per questo mese"}
                            >
                              {budget > 0 ? formatta(budget, misura) : "—"}
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td className="num" key={month}>
                          <input
                            type="text"
                            inputMode={misura === "valore" ? "numeric" : "decimal"}
                            value={aFuoco === k ? (grezzo ?? "") : formatta(valore(k), misura)}
                            className={
                              [toccata(k) ? "toccata" : "", invalida === k ? "errata" : ""]
                                .filter(Boolean)
                                .join(" ") || undefined
                            }
                            onFocus={() => {
                              setAFuoco(k);
                              // A fuoco si mostra il numero **nudo**: riscrivere i
                              // punti sotto le dita sposterebbe il cursore a fine
                              // riga a ogni tasto.
                              setGrezzo(valore(k) === 0 ? "" : String(valore(k)).replace(".", ","));
                            }}
                            onBlur={() => {
                              setAFuoco(null);
                              setGrezzo(null);
                              setInvalida(null);
                            }}
                            onChange={(e) => {
                              const t = e.target.value;
                              // Anche qui, non solo in `onFocus`: se per qualche
                              // ragione l'evento di fuoco non arriva, senza
                              // questo la casella continuerebbe a mostrare il
                              // valore formattato mentre ci si scrive dentro, e
                              // il testo sembrerebbe non entrare.
                              setAFuoco(k);
                              setGrezzo(t);
                              const n = leggiNumero(t);
                              // Quello che non è un numero **non si scrive e si
                              // segna in rosso**: azzerare in silenzio una casella
                              // per un carattere di troppo è la peggiore delle due.
                              if (n === null) {
                                setInvalida(k);
                                return;
                              }
                              setInvalida(null);
                              setModifiche((p) => ({ ...p, [k]: n }));
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {mostra(totLinea(l, misura))}
                      {diff !== 0 && (
                        <div className={`delta ${diff > 0 ? "su" : "giu"}`} style={{ fontSize: 11 }}>
                          {diff > 0 ? "+" : "−"}
                          {mostra(Math.abs(diff))}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn secondary small"
                        onClick={() => salva([l])}
                        disabled={salvo !== null || toccate.length === 0}
                        title={
                          toccate.length === 0
                            ? "Niente da salvare su questa linea."
                            : `Salva solo ${l.nome}.`
                        }
                      >
                        {salvo === l.id ? "Salvo…" : "Salva"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale {year}</td>
                {MESI.map((_, i) => (
                  <td className={`num ${chiuso(i + 1) ? "chiusa" : ""}`} key={i}>
                    {chiuso(i + 1) ? (
                      <>
                        <div>
                          {misura !== "valore" ? "—" : `${formatta(totConsuntivoMese(i + 1), "valore")} €`}
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 10.5, marginTop: 2, fontWeight: 400 }}
                          title="Quanto era a budget"
                        >
                          {mostra(totMese(i + 1, misura))}
                        </div>
                      </>
                    ) : (
                      mostra(totMese(i + 1, misura))
                    )}
                  </td>
                ))}
                <td className="num">{mostra(totale)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {/* La legenda del doppio numero. Senza, due cifre incolonnate nella
            stessa casella si leggono come un totale e un dettaglio, che è
            un'altra cosa. */}
        <p className="page-caption" style={{ margin: "10px 14px 4px" }}>
          {primoMeseAperto > 1 && (
            <>
              I mesi da <strong>{MESI[0]}</strong> a <strong>{MESI[primoMeseAperto - 2]}</strong> sono{" "}
              <strong>chiusi e non si scrivono</strong>: portano il{" "}
              <strong>fatturato vero</strong> e sotto, in piccolo, quanto era a budget. Quello che conta
              per un mese passato è cosa è successo, non cosa si era previsto.{" "}
            </>
          )}
          Le caselle bianche sono i mesi che restano: quelle si scrivono.
        </p>
      </div>

      <div className="form-footer">
        <span className="muted">
          {chiaviToccate.length === 0
            ? "Nessuna modifica da salvare."
            : `${chiaviToccate.length} ${chiaviToccate.length === 1 ? "casella modificata" : "caselle modificate"}.`}
          {esito && <> · {esito}</>}
        </span>
        <button
          className="btn primary"
          onClick={() => salva(linee)}
          disabled={salvo !== null || chiaviToccate.length === 0}
        >
          {salvo === "*" ? "Salvataggio…" : "Salva tutte le linee"}
        </button>
      </div>

      {/* ---- Il collegamento a Finance ----
          Senza, il consuntivo dei mesi passati resta «n.d.»: dei nomi a budget
          solo «Affiliazioni» ha un gemello identico in Finance. E il
          collegamento **non si indovina** — «Consegne Corporate» è «Consegne»?
          «Torte e Mono» è «Food Supplier»? — lo dice chi sa come si fattura. */}
      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>Come fattura ogni linea</h2>
        <p className="page-caption" style={{ marginTop: 0 }}>
          Due cose per riga, e servono a due domande diverse. La{" "}
          <strong>tipologia</strong> dice con che margine la linea entra nel{" "}
          <Link href="/pl" style={{ color: "var(--blue)" }}>conto economico</Link>; le{" "}
          <strong>voci di Finance</strong> dicono da dove si legge il suo consuntivo.
          {senzaTipologia > 0 && (
            <>
              {" "}
              <strong style={{ color: "var(--orange)" }}>
                {senzaTipologia} linee sono senza tipologia
              </strong>
              : entrano a <strong>margine zero</strong>, cioè il ricavo si conta e il costo del venduto se
              lo mangia tutto. Non è una stima prudente per caso — è il modo di non spostare l&apos;EBITDA
              con un margine che nessuno ha scelto.
            </>
          )}
        </p>
        <p className="page-caption" style={{ marginTop: 0 }}>
          Sotto ogni mese passato c&apos;è il <strong>fatturato vero</strong>, che arriva dalle tipologie di{" "}
          <strong>Finance</strong>. Il collegamento è per <strong>nome</strong>: lasciandolo vuoto si cerca
          una tipologia che si chiami esattamente come la linea, e se non c&apos;è il consuntivo resta{" "}
          <strong>«n.d.»</strong> — che non vuol dire zero, vuol dire <strong>non misurato</strong>.{" "}
          {consuntivoOk ? (
            <>
              Oggi sono collegate <strong>{collegate} linee su {linee.length}</strong>.
            </>
          ) : (
            <strong style={{ color: "var(--orange)" }}>Finance non sta rispondendo: nessun consuntivo.</strong>
          )}
        </p>
        {vociFinanceNote.length > 0 && (
          <p className="page-caption" style={{ marginTop: 0 }}>
            Le tipologie che Finance conosce: <strong>{vociFinanceNote.join(" · ")}</strong>. Più nomi si
            separano con la virgola — una linea può raccoglierne diverse.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                <th>Fattura come</th>
                <th>Tipologie di Finance</th>
                <th className="num">Consuntivo {MESI[0]}–{MESI[Math.max(0, primoMeseAperto - 2)]}</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{l.nome}</td>
                  <td>
                    <select
                      value={tip[l.id] ?? ""}
                      onChange={(e) => setTip((p) => ({ ...p, [l.id]: e.target.value }))}
                      title="Da questa tipologia la linea eredita il margine con cui entra nel P&L."
                    >
                      <option value="">— non decisa (margine 0%)</option>
                      {tipologie.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.nome} · margine {t.marginePct.toLocaleString("it-IT")}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={voci[l.id] ?? ""}
                      placeholder={`vuoto = cerca «${l.nome}»`}
                      onChange={(e) => setVoci((p) => ({ ...p, [l.id]: e.target.value }))}
                    />
                  </td>
                  <td className="num">
                    {l.consuntivo === null ? (
                      <span className="muted">n.d.</span>
                    ) : (
                      `${formatta(
                        l.consuntivo.reduce((s, v, i) => (chiuso(i + 1) ? s + v : s), 0),
                        "valore"
                      )} €`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-footer">
          <span className="muted">
            Il budget scritto sopra non si tocca: qui si dice solo <strong>come si legge</strong> e{" "}
            <strong>con che margine entra nel conto economico</strong>.
          </span>
          <button className="btn secondary" onClick={salvaVoci} disabled={salvoVoci}>
            {salvoVoci ? "Salvo…" : "Salva i collegamenti"}
          </button>
        </div>
      </div>

      {lineeScoutSenzaBudget.length > 0 && (
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>Linee di Scout senza budget</h2>
          <p className="page-caption" style={{ marginTop: 0 }}>
            Scout le conosce, qui non hanno una riga: finché non ce l&apos;hanno il loro budget non è zero,
            è <strong>assente</strong>, e non compare in nessun totale. Aprendola nasce a zero e la si
            compila qui sopra.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lineeScoutSenzaBudget.map((n) => (
              <button
                key={n}
                className="btn secondary small"
                onClick={() => apriLinea(n)}
                disabled={creo !== null}
              >
                {creo === n ? "Apro…" : `+ ${n}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
