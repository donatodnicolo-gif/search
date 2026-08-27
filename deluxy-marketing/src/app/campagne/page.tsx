import { redirect } from "next/navigation";
import { AncoraggioHash } from "@/components/AncoraggioHash";
import { Icona } from "@/components/Icona";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { Sidebar } from "@/components/Sidebar";
import { VisteSalvate } from "@/components/VisteSalvate";
import { prisma } from "@/lib/db";
import { periodoApp } from "@/lib/periodo-condiviso";
import { destinazionePredefinita } from "@/lib/viste";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_CAMPAGNA,
  formattaEuro,
  roas,
  STATI_CAMPAGNA,
  STATI_CAMPAGNA_IGNORATE,
  STATI_CAMPAGNA_VIVE,
  COLORE_STATO_CAMPAGNA,
  formattaData,
} from "@/lib/dominio";
import { formattaQuota, letturaBudget, usoBudget } from "@/lib/budget-usato";
import { COLORE_VERDETTO, mappaAnalisiPerCampagne } from "@/lib/scheda-analisi";
import { nomeCampagna } from "@/lib/gruppi";
import { categoriaCampagna, iconaCanale, saluteCampagna } from "@/lib/salute";
import { COLORE_CLASSE, ETICHETTA_CLASSE } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ORDINE_BRAND = ["flowers", "gifts", "cake", "cross"];

// Come si ordinano le card dentro la colonna del brand.
//
// ⚠️ «predefinito» non è «nessun ordine»: raggruppa per canale e poi mette il
// budget più alto in cima. Le altre scelte ROMPONO il raggruppamento per
// canale — è voluto, ma va detto in pagina, o una lista che mescola Google e
// Meta sembra sbagliata invece che ordinata come si è chiesto.
const ORDINAMENTI: Record<string, string> = {
  predefinito: "Canale, poi budget",
  spesa: "Spesa nel periodo",
  roas: "ROAS",
  budget: "Budget al giorno",
  nome: "Nome (A-Z)",
  stato: "Stato",
};
const ORDINE_CANALE = ["google_ads", "meta_ads", "tiktok", "email", "sito", "seo", "crm", "social", "altro"];

// Esplora campagne: una colonna per brand, una card per campagna con icona di
// canale e categoria, landing, budget, performance e stato di salute.
export default async function PaginaCampagne({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; canale?: string; brand?: string; q?: string; vista?: string; ord?: string; preset?: string; da?: string; a?: string }>;
}) {
  const p = await searchParams;
  // Pagina aperta nuda e c'è una vista predefinita: si va lì.
  const dove = await destinazionePredefinita("campagne", "/campagne", p);
  if (dove) redirect(dove);
  const { stato, canale, brand, q } = p;
  const ordina = Object.keys(ORDINAMENTI).includes(p.ord ?? "") ? p.ord! : "predefinito";
  // I filtri di adesso, da portarsi dietro fino alla scheda campagna: il link
  // «← Campagne» li rimette. Senza, riportava sempre all'elenco intero e la
  // ricerca appena fatta andava rifatta da capo.
  const filtriOra = new URLSearchParams(
    Object.entries(p).filter(([, v]) => v != null && v !== "") as [string, string][]
  ).toString();
  // Il periodo dell'app, come su dashboard e schede: le card seguono la
  // scelta invece di raccontare sempre gli ultimi 30 giorni. La scelta è
  // condivisa, quindi arrivando da una scheda si continua a guardare lo
  // stesso arco di tempo.
  const periodo = await periodoApp(p);
  const giorni30 = periodo.corrente.da;
  const finePeriodo = periodo.corrente.a;
  const campagne = await prisma.campagna.findMany({
    where: {
      // "Defunta" vuol dire non considerarla mai più: sparisce dall'elenco a
      // meno che non si chieda proprio lei col filtro di stato.
      ...(stato ? { stato } : { stato: { notIn: [...STATI_CAMPAGNA_IGNORATE] } }),
      ...(canale ? { canale } : {}),
      ...(brand ? { brand } : {}),
      ...(q ? { nome: { contains: q } } : {}),
    },
    include: {
      metriche: { where: { data: { gte: giorni30, lt: finePeriodo } } },
      landing: { select: { id: true, url: true, stato: true } },
      // Il DOVE sulla card: il targeting vero letto da Google (vedi la
      // scheda campagna). Qui basta il nome; le escluse si contano nel title.
      localita: { orderBy: [{ esclusa: "asc" }, { nome: "asc" }], select: { nome: true, esclusa: true } },
      _count: { select: { azioni: true } },
    },
  });

  // Le campagne che NON stanno girando, defunte comprese: è l'unico posto
  // dell'app dove le defunte compaiono senza doverle chiedere col filtro,
  // perché è la sezione fatta apposta per guardare indietro.
  //
  // La spesa storica resta la loro: "mai più" vale per l'operativo, non per la
  // contabilità — una campagna morta ha comunque speso soldi veri.
  const spente = await prisma.campagna.findMany({
    where: {
      stato: { notIn: [...STATI_CAMPAGNA_VIVE] },
      ...(canale ? { canale } : {}),
      ...(brand ? { brand } : {}),
      ...(q ? { nome: { contains: q } } : {}),
    },
    include: {
      metriche: { select: { spesa: true, ricavi: true, data: true } },
      _count: { select: { azioni: true } },
    },
    orderBy: [{ stato: "asc" }, { nome: "asc" }],
  });

  const brands = ORDINE_BRAND.filter((b) => campagne.some((c) => c.brand === b));

  // Il verdetto dell'ANALISI più recente per ogni card, in un giro solo —
  // vale per tutti i canali, Meta compreso. Il pallino sulla card è uno
  // sguardo; la scheda intera si apre dal bottone ANALISI della campagna o
  // dalla pagina /analisi (il bottone in testata, coi filtri di adesso).
  const analisiDelle = await mappaAnalisiPerCampagne(campagne);

  return (
    <div className="layout">
      <AncoraggioHash />
      <Sidebar attiva="campagne" canaleAttivo={canale} brandAttivo={brand} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Campagne{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Una colonna per brand. Ogni card mostra il canale e la categoria di prodotto con
              un&apos;icona, la landing di destinazione, il budget e come sta andando: performa,
              nella media, in apprendimento o critica.
            </p>
          </div>
          {/* ⚠️ I quattro bottoni stanno in UN contenitore. Erano quattro figli
              diretti di .page-head, che e' `space-between` e va a capo: sulla
              seconda riga «Crea campagna» finiva all'estrema sinistra e «Crea
              da ciò che funziona» all'estrema destra, 627px di vuoto fra due
              azioni della stessa famiglia. Cosi' invece `space-between` separa
              il titolo dal blocco delle azioni, che e' quello che deve fare. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Le ANALISI depositate su Drive, elaborate in schede: il posto
              dove si vedono TUTTE è /analisi — il bottone porta con sé i
              filtri di adesso (brand e canale, Meta compreso). Il pallino
              sulle card qui sotto è il verdetto della più recente. */}
          <a
            className="btn btn-secondario"
            href={`/analisi${(() => {
              const q2 = new URLSearchParams({ ...(brand ? { brand } : {}), ...(canale ? { canale } : {}) }).toString();
              return q2 ? `?${q2}` : "";
            })()}`}
          >
            Analisi
          </a>
          <a className="btn btn-secondario" href="/campagne/nuova">Censisci esistente</a>
          {/* ⚠️ Il brand che si sta guardando viaggia col link: chi arriva qui
              filtrando Flowers si aspetta di creare una campagna Flowers, e il
              modulo ripartiva sempre da «gifts». Un valore predefinito
              sbagliato che nessuno rilegge è un errore che si scopre quando la
              campagna è già su Google. E dal 26/08 viaggia anche il CANALE:
              chi filtra Meta atterra sul modulo Meta, non su quello Google. */}
          <a
            className="btn btn-secondario"
            href={`/campagne/lancia${(() => {
              const q2 = new URLSearchParams({ ...(brand ? { brand } : {}), ...(canale === "meta_ads" ? { canale: "meta" } : {}) }).toString();
              return q2 ? `?${q2}` : "";
            })()}`}
          >
            Crea campagna
          </a>
          <a className="btn" href="/campagne/crea">Crea da ciò che funziona</a>
          </div>
        </div>

        {canale === "meta_ads" && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>Dal 26/08 le campagne Meta si lanciano da qui.</b> «Crea campagna» apre il
              modulo Meta (obiettivo ODAX, budget CBO/ABO, pubblico, posizionamenti, pixel):
              si approva in Operazioni e l&apos;app crea campagna e ad set <b>in pausa</b> via
              Graph API — l&apos;<b>annuncio</b> si monta in Ads Manager, perché vuole un media
              che l&apos;app non possiede. ⚠️ Prima di ogni scrittura l&apos;app chiede a Meta il
              permesso vero: se la scrittura risulta spenta (token senza{" "}
              <code>ads_management</code> o interruttore <code>META_SCRITTURA</code> mancante),
              un lancio approvato resta in coda col motivo scritto. Una campagna nata in Ads Manager si{" "}
              <a href="/campagne/nuova" style={{ color: "var(--blue)" }}>censisce</a> come prima.
            </span>
          </div>
        )}

        {/* Il periodo dell'app: le card e i totali lo seguono, e la
            scelta resta la stessa passando alle schede. */}
        {/* ⚠️ I filtri con cui si sta guardando viaggiano col periodo: da
            «Campagne — Meta Ads» cambiare periodo riportava a TUTTE le
            campagne. */}
        <SceltaPeriodo
          periodo={periodo}
          da={p.da}
          a={p.a}
          azione="/campagne"
          altriFiltri={new URLSearchParams(
            Object.entries(p).filter(
              ([k, v]) => v != null && v !== "" && k !== "preset" && k !== "da" && k !== "a"
            ) as [string, string][]
          ).toString()}
        />

        <VisteSalvate pagina="campagne" base="/campagne" parametri={p} />

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca una campagna…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="tiktok">TikTok</option>
          </select>
          <select name="ord" defaultValue={ordina}>
            {Object.entries(ORDINAMENTI).map(([k, v]) => (
              <option key={k} value={k}>Ordina: {v}</option>
            ))}
          </select>
          <select name="stato" defaultValue={stato ?? ""}>
            <option value="">Tutti gli stati (tranne le defunte)</option>
            {STATI_CAMPAGNA.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_CAMPAGNA[s]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {/* L'ordinamento a portata di click: nel menù dei filtri c'era
            già, ma richiedeva di premere «Filtra» e non si vedeva quale
            fosse attivo. */}
        <div className="pill-scelta pill-ordina" style={{ marginBottom: 12 }}>
          <span className="cella-sub" style={{ marginRight: 4 }}>Ordina per</span>
          {Object.entries(ORDINAMENTI).map(([k, v]) => {
            const q2 = new URLSearchParams(filtriOra);
            q2.set("ord", k);
            return (
              <a
                key={k}
                className={`pill-opt${ordina === k ? " attuale" : ""}`}
                // #elenco: riordinare ricarica la pagina, e senza àncora si
                // riparte da cima perdendo il segno.
                href={`/campagne?${q2.toString()}#elenco`}
              >
                {v}
              </a>
            );
          })}
        </div>

        {stato === "defunta" && (
          <div className="nota-info">
            <span className="nota-icona">⌁</span>
            <span>
              Stai guardando le campagne <b>defunte</b>: normalmente non compaiono da nessuna parte.
              La spesa che hanno fatto resta comunque nei totali — quei soldi sono usciti davvero.
            </span>
          </div>
        )}

        {campagne.length === 0 ? (
          <div className="vuoto">Nessuna campagna con questi filtri.</div>
        ) : (
          <div className="colonne-brand" id="elenco">
            {brands.map((brand) => {
              const numeri = (c: (typeof campagne)[number]) => {
                const sp = c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
                const ri = c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
                return { sp, r: roas(ri, sp) };
              };
              const del = campagne
                .filter((c) => c.brand === brand)
                .sort((a, b) => {
                  // ⚠️ Ogni ordinamento diverso da «predefinito» ROMPE il
                  // raggruppamento per canale: è voluto (si vuole la classifica,
                  // non le colonne), ma la pagina lo dice — una lista che mescola
                  // Google e Meta sembra sbagliata invece che ordinata come si
                  // è chiesto.
                  if (ordina === "spesa") return numeri(b).sp - numeri(a).sp;
                  if (ordina === "budget") return (b.budgetGiornaliero ?? 0) - (a.budgetGiornaliero ?? 0);
                  if (ordina === "nome") return nomeCampagna(a).localeCompare(nomeCampagna(b), "it");
                  if (ordina === "stato") return a.stato.localeCompare(b.stato, "it") || nomeCampagna(a).localeCompare(nomeCampagna(b), "it");
                  if (ordina === "roas") {
                    // I senza-ROAS in fondo comunque: «nessun dato» non è «il peggiore».
                    const ra = numeri(a).r;
                    const rb = numeri(b).r;
                    if (ra == null && rb == null) return 0;
                    if (ra == null) return 1;
                    if (rb == null) return -1;
                    return rb - ra;
                  }
                  return (
                    ORDINE_CANALE.indexOf(a.canale) - ORDINE_CANALE.indexOf(b.canale) ||
                    (b.budgetGiornaliero ?? 0) - (a.budgetGiornaliero ?? 0)
                  );
                });
              // ⚠️ Il budget somma SOLO chi eroga (`attiva`, `in_apprendimento`),
              // ma il conteggio accanto contava tutto: «8 · 58,50 €/g» su Cake
              // veniva da 6 campagne, non da 8, e una bozza da 20 €/g stava
              // dentro il primo numero e fuori dal secondo. Due numeri accanto
              // che contano insiemi diversi si leggono come se contassero lo
              // stesso: adesso lo dicono.
              const cheSpendono = del.filter((c) => c.stato === "attiva" || c.stato === "in_apprendimento");
              const budgetGiorno = cheSpendono.reduce((s, c) => s + (c.budgetGiornaliero ?? 0), 0);
              let canalePrec = "";
              return (
                <div className="colonna-brand" key={brand}>
                  <div className="colonna-brand-testata">
                    <span className="board-titolo">
                      <span className="sb-dot" style={{ background: COLORE_BRAND[brand], width: 9, height: 9 }} />
                      {ETICHETTA_BRAND[brand]}
                    </span>
                    <span className="board-conta">
                      {del.length}
                      {cheSpendono.length !== del.length && (
                        <span title="Il budget somma solo le campagne che erogano: bozze, in pausa e concluse restano fuori">
                          {" "}({cheSpendono.length} che spendono)
                        </span>
                      )}
                      {" · "}
                      {formattaEuro(budgetGiorno)}/g
                    </span>
                  </div>
                  {del.map((c) => {
                    const spesa = c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
                    const ricavi = c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
                    const r = roas(ricavi, spesa);
                    const uso = usoBudget(c.metriche, c.budgetGiornaliero);
                    const lettura = uso ? letturaBudget(uso) : null;
                    const salute = saluteCampagna(c.stato, r, spesa, c.brand);
                    const categoria = categoriaCampagna(`${c.nome} ${c.landing?.url ?? ""} ${c.obiettivo ?? ""}`);
                    const nuovoCanale = c.canale !== canalePrec;
                    canalePrec = c.canale;
                    return (
                      <div key={c.id}>
                        {nuovoCanale && (
                          <div className="canale-divisore">
                            <Icona nome={iconaCanale(c.canale)} />
                            {ETICHETTA_CANALE[c.canale] ?? c.canale}
                          </div>
                        )}
                        {/* I filtri di adesso viaggiano con il link: la scheda
                            li rimette nel «← Campagne». Senza, si tornava
                            sempre all'elenco intero e la ricerca appena fatta
                            andava rifatta da capo. */}
                        <a
                          className="card-campagna"
                          href={`/campagne/${c.id}${filtriOra ? `?dalElenco=${encodeURIComponent(filtriOra)}` : ""}`}
                        >
                          <div className="card-campagna-alto">
                            <span className="card-campagna-icona" title={categoria.nome}>
                              <Icona nome={categoria.icona} />
                            </span>
                            {/* Il nome nostro comanda a schermo; quello di
                                Google resta il titolo al passaggio del mouse,
                                perché è quello che si cerca in interfaccia. */}
                            <span className="card-campagna-nome" title={c.nomeVisibile ? c.nome : undefined}>
                              {nomeCampagna(c)}
                            </span>
                          </div>
                          <div className="card-campagna-tag">
                            <span className="tag-salute" style={{ color: salute.colore }} title={salute.spiega}>
                              <span className="dot" />
                              {salute.etichetta}
                            </span>
                            {/* Il verdetto dell'ANALISI più recente che parla
                                di questa campagna (o del suo brand+canale).
                                È uno span e non un link: la card è già un <a>,
                                e un <a> dentro un <a> non è HTML — la scheda
                                si apre dal bottone ANALISI della campagna. */}
                            {(() => {
                              const an = analisiDelle.get(c.id);
                              if (!an) return null;
                              return (
                                <span
                                  className="tag-salute"
                                  style={{ color: COLORE_VERDETTO[an.verdetto] }}
                                  title={
                                    an.nominata
                                      ? `${an.titolo} — su questa campagna${an.nota ? `: ${an.nota}` : ""}`
                                      : `${an.titolo} — l'analisi non nomina questa campagna: verdetto dell'insieme`
                                  }
                                >
                                  <span className="dot" />
                                  analisi
                                </span>
                              );
                            })()}
                            <span className="tag-neutro">{categoria.nome}</span>
                            {c.classe !== "standard" && (
                              <span className="tag-salute" style={{ color: COLORE_CLASSE[c.classe] }} title={c.classe === "traino" ? "Campagna protetta (doc 11): modifiche solo con change control" : "Campagna sperimentale"}>
                                <span className="dot" />
                                {c.classe === "traino" ? "🛡 Traino" : ETICHETTA_CLASSE[c.classe]}
                              </span>
                            )}
                          </div>
                          {c.obiettivo && <div className="card-campagna-obiettivo">◎ {c.obiettivo}</div>}
                          {/* Dove è localizzata: le mirate per esteso (oltre
                              3 si compatta), le escluse contate nel title.
                              Se il targeting non è ancora stato letto, la
                              card tace: l'assenza si dichiara sulla scheda. */}
                          {(() => {
                            const mirate = c.localita.filter((l) => !l.esclusa).map((l) => l.nome);
                            const escluse = c.localita.filter((l) => l.esclusa).length;
                            if (c.localita.length === 0) return null;
                            return (
                              <div
                                className="card-campagna-obiettivo"
                                title={`Targeting Google: ${mirate.join(", ") || "nessuna località mirata"}${escluse > 0 ? ` · ${escluse} escluse` : ""}`}
                              >
                                ⌖{" "}
                                {mirate.length === 0
                                  ? "nessuna località mirata"
                                  : mirate.length <= 3
                                    ? mirate.join(" · ")
                                    : `${mirate.slice(0, 2).join(" · ")} e altre ${mirate.length - 2}`}
                                {escluse > 0 && ` — ${escluse} escluse`}
                              </div>
                            );
                          })()}
                          {c.landing && (
                            <div
                              className="card-campagna-landing"
                              style={c.landing.stato === "mismatch" ? { color: "var(--orange)" } : undefined}
                              title={c.landing.url}
                            >
                              ↳ {c.landing.url.replace(/^[^/]+/, "") || "/"}
                              {c.landing.stato === "mismatch" ? " · mismatch" : ""}
                            </div>
                          )}
                          <div className="card-campagna-kpi">
                            <span>
                              <b>{c.budgetGiornaliero != null ? `${formattaEuro(c.budgetGiornaliero)}/g` : "—"}</b>
                              <i>budget</i>
                            </span>
                            {/* Quanto di quel budget usa davvero: dice se il
                                freno sono i soldi (al tetto → alzarli porta
                                volume) o qualcos'altro (molto sotto → alzarli
                                non cambierebbe niente). Il conto e le sue tre
                                scelte stanno in lib/budget-usato.ts; qui si
                                mostra e basta. */}
                            <span title={uso ? `${uso.spiega}. ${lettura!.nota}` : "Serve un budget giornaliero per poterlo dire. Su Meta può stare sull'ad set (CBO) invece che sulla campagna."}>
                              <b style={lettura?.colore ? { color: lettura.colore } : undefined}>
                                {uso ? formattaQuota(uso) : "—"}
                              </b>
                              <i>{uso ? `budget usato · ${lettura!.etichetta}` : "budget usato"}</i>
                            </span>
                            <span>
                              <b>{spesa > 0 ? formattaEuro(spesa) : "—"}</b>
                              {/* L'etichetta segue il periodo scelto: diceva
                                  «30g» anche guardando l'anno. */}
                              <i>spesa {periodo.corrente.etichetta.toLowerCase()}</i>
                            </span>
                            {/* I RICAVI accanto alla spesa. C'erano già nel
                                conto — il ROAS qui a destra è il loro rapporto
                                — ma non a schermo: si vedeva quanto è uscito e
                                un moltiplicatore, non quanto è entrato. Per
                                decidere se alzare un budget serve l'ordine di
                                grandezza dei due numeri, non solo il loro
                                rapporto: 5× su 26 € e 5× su 2.600 € sono la
                                stessa cifra e due situazioni diverse. */}
                            <span>
                              <b>{ricavi > 0 ? formattaEuro(ricavi) : "—"}</b>
                              <i>ricavi {periodo.corrente.etichetta.toLowerCase()}</i>
                            </span>
                            <span>
                              <b style={r != null ? { color: salute.colore } : undefined}>
                                {r != null ? `${r.toFixed(1).replace(".", ",")}×` : "—"}
                              </b>
                              <i>ROAS</i>
                            </span>
                            {c._count.azioni > 0 && (
                              <span>
                                <b>{c._count.azioni}</b>
                                <i>azioni</i>
                              </span>
                            )}
                          </div>
                        </a>
                      </div>
                    );
                  })}
                  {del.length === 0 && <div className="vuoto-mini">Nessuna campagna</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ——— L'archivio: tutto quello che non sta girando ———
            Chiuso di default: è materiale da consultare, non da guardare ogni
            giorno. Ma deve esistere un posto dove trovarlo, altrimenti una
            campagna messa in pausa sei mesi fa non la ritrova più nessuno — e
            con lei la sua spesa, che nei conti c'è ancora. */}
        {spente.length > 0 && (
          <details className="scheda" style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="scheda-titolo" style={{ margin: 0 }}>
                Campagne non attive ({spente.length})
              </span>
              <span className="cella-sub">
                in pausa, concluse, mai partite e defunte · spesa storica{" "}
                {formattaEuro(spente.reduce((t, c) => t + c.metriche.reduce((s2, m) => s2 + (m.spesa ?? 0), 0), 0))}
              </span>
            </summary>

            <p className="cella-sub" style={{ marginTop: 12, marginBottom: 12, whiteSpace: "normal" }}>
              Qui dentro ci sono anche le <b>defunte</b>, che altrove non compaiono mai. La loro
              spesa resta nei totali dell&apos;azienda: «mai più» vale per l&apos;operativo, non per la
              contabilità. Il ROAS è calcolato su <b>tutta</b> la loro vita, non sugli ultimi 30
              giorni — su una campagna spenta quella finestra è vuota per definizione.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Campagna</th>
                    <th>Stato</th>
                    <th>Brand</th>
                    <th className="num">Spesa storica</th>
                    <th className="num">Incasso</th>
                    <th className="num">ROAS</th>
                    <th>Ultimo giorno</th>
                  </tr>
                </thead>
                <tbody>
                  {spente.map((c) => {
                    const sp = c.metriche.reduce((t, m) => t + (m.spesa ?? 0), 0);
                    const ri = c.metriche.reduce((t, m) => t + (m.ricavi ?? 0), 0);
                    const r = roas(ri, sp);
                    const ultimo = c.metriche.reduce<Date | null>(
                      (max, m) => (!max || m.data > max ? m.data : max),
                      null
                    );
                    return (
                      <tr key={c.id}>
                        <td style={{ maxWidth: 320 }}>
                          <a className="cella-nome" href={`/campagne/${c.id}`} title={c.nomeVisibile ? c.nome : undefined}>
                            {nomeCampagna(c)}
                          </a>
                          {c._count.azioni > 0 && (
                            <div className="cella-sub">{c._count.azioni} azioni collegate</div>
                          )}
                        </td>
                        <td>
                          <span className="tag-salute" style={{ color: COLORE_STATO_CAMPAGNA[c.stato] }}>
                            <span className="dot" />
                            {ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato}
                          </span>
                        </td>
                        <td className="cella-muta">{ETICHETTA_BRAND[c.brand] ?? c.brand}</td>
                        <td className="num">{sp > 0 ? formattaEuro(sp) : "—"}</td>
                        <td className="num">{ri > 0 ? formattaEuro(ri) : "—"}</td>
                        <td className="num">{r != null ? `${r.toFixed(1).replace(".", ",")}×` : "—"}</td>
                        <td className="cella-muta">{ultimo ? formattaData(ultimo) : "mai partita"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

      </main>
    </div>
  );
}
