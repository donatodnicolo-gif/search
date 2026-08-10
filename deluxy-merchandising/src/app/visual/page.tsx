import Link from "next/link";
import { FormFiltri } from "@/components/FormFiltri";
import { FreschezzaVenduto } from "@/components/FreschezzaVenduto";
import { Miniatura } from "@/components/Miniatura";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { brandCorrente, negoziDelBrand, etichettaAmbito } from "@/lib/brand";
import { etichettaOrdinamentoShopify, nomePosizione, posizioniDa } from "@/lib/collezioni";
import { euro, percentuale } from "@/lib/dominio";
import { etichettaRegola, FILTRO_IN_SCENA } from "@/lib/ordinamento-vetrina";
import { normalizza } from "@/lib/riconciliazione";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import { etichettaFrequenza, etichettaModo, prossimaVolta } from "@/lib/rotazione";
import { cambiaVetrina } from "@/lib/azioni-collezioni-shopify";
import { TabsVetrina } from "@/components/TabsVetrina";

export const dynamic = "force-dynamic";

// I modi di mettere in fila le collezioni. «Novità» non c'è per un motivo
// dichiarato in pagina: Shopify **non dà una data di creazione** per le
// collezioni, e la nostra `creataIl` è il momento dell'import — ordinarci sopra
// darebbe una classifica che sembra vera e non lo è. «Ultima modifica» invece è
// il `updatedAt` vero del negozio.
/** La più recente fra la modifica sul negozio e quella fatta qui. */
const ultimaModifica = (c: { aggiornataShopifyIl: Date | null; ordineModificatoIl: Date | null }) =>
  Math.max(c.aggiornataShopifyIl?.getTime() ?? 0, c.ordineModificatoIl?.getTime() ?? 0);

const CRITERI = ["venduto", "modifica", "prodotti", "nome", "vetrina", "ordine", "rotazione", "prossimo"] as const;
type Criterio = (typeof CRITERI)[number];

// Le condizioni con cui si restringe l'elenco. Sono le domande che ci si fa
// davanti a 343 collezioni: quali sto curando, quali non ho ancora toccato,
// quali sono rimaste indietro rispetto al negozio.
const FILTRI = [
  { chiave: "vetrina", nome: "Solo in vetrina" },
  { chiave: "no-vetrina", nome: "Non in vetrina" },
  { chiave: "da-sincronizzare", nome: "Da sincronizzare su Shopify" },
  { chiave: "senza-ordine", nome: "Senza regola d'ordine" },
  { chiave: "senza-rotazione", nome: "Senza rotazione" },
  { chiave: "senza-tipologia", nome: "Senza tipologia" },
  { chiave: "manuale", nome: "Chi entra: a mano" },
  { chiave: "automatica", nome: "Chi entra: per regola" },
  { chiave: "fila-a-mano", nome: "Ordine sul negozio: a mano" },
  { chiave: "fila-automatica", nome: "Ordine sul negozio: deciso da Shopify" },
  { chiave: "sospesa", nome: "Sospese" },
  { chiave: "senza-prodotti", nome: "Senza prodotti in vendita" },
] as const;

export default async function VisualPage({
  searchParams,
}: {
  searchParams: Promise<{
    esito?: string;
    messaggio?: string;
    ordina?: string;
    q?: string;
    negozio?: string;
    tipologia?: string;
    filtro?: string;
  }>;
}) {
  const sp = await searchParams;
  // L'ordinamento sta tutto in un parametro: "criterio-verso". Le intestazioni
  // sono scorciatoie — un clic ordina per quella colonna, il successivo inverte.
  const [critRaw, versoRaw] = (sp.ordina ?? "venduto-desc").split("-");
  const criterio: Criterio = (CRITERI as readonly string[]).includes(critRaw) ? (critRaw as Criterio) : "venduto";
  const verso: "asc" | "desc" = versoRaw === "asc" ? "asc" : "desc";

  const brand = await brandCorrente();
  const negozi = await negoziDelBrand(brand); // null = globale, [] = brand senza negozio
  const filtroNegozio = negozi ? { negozio: { in: negozi } } : {};
  const doveColl = { pubblicataShopify: true, ...filtroNegozio };

  const f = finestra(90);
  const [collezioni, totali, pianiBozza, venditePerProdotto, perCollezione] = await Promise.all([
    prisma.collezioneShopify.findMany({
      where: doveColl,
      include: {
        _count: { select: { prodotti: true } },
        tipologia: { select: { id: true, nome: true } },
        regolaOrdine: { select: { nome: true, aggiornataIl: true } },
        rotazione: { select: { nome: true, frequenza: true, ogniQuanti: true, modo: true, attiva: true, ultimaEsecuzioneIl: true } },
      },
    }),
    prisma.collezioneShopify.count({ where: filtroNegozio }),
    prisma.pianoRiordino.count({ where: { stato: "bozza" } }),
    // Il venduto della finestra in un colpo solo: si somma per collezione qui,
    // senza elencare gli id dei prodotti nella query.
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, ...(brand ? { canale: brand } : {}) },
      _sum: { quantita: true, ricavo: true },
    }),
    // **Prodotti in vendita e venduto, per collezione, in una query sola.**
    // Prima la pagina si tirava dietro tutte le appartenenze (33.243 righe dopo
    // l'import del 03/08) per contarle in memoria: 4,7 s. Il conto lo fa il
    // database, che è il suo mestiere. Stessa scelta dei contatori del menu.
    // ⚠️ Lo schema `merchandising` è nominato esplicitamente.
    prisma.$queryRaw<{ collezioneId: string; attivi: number; ricavo: number; pezzi: number }[]>`
      SELECT pc."collezioneId"                                              AS "collezioneId",
             count(*) FILTER (WHERE p."statoShopify" = 'ACTIVE'
                                AND p.fase <> 'archiviato')::int            AS "attivi",
             COALESCE(sum(v.ricavo), 0)::float8                             AS "ricavo",
             COALESCE(sum(v.pezzi), 0)::int                                 AS "pezzi"
      FROM "merchandising"."ProdottoInCollezioneShopify" pc
      JOIN "merchandising"."Prodotto" p ON p.id = pc."prodottoId"
      LEFT JOIN (
        SELECT "prodottoId", sum(ricavo) AS ricavo, sum(quantita) AS pezzi
        FROM "merchandising"."Vendita"
        WHERE data >= ${f.dal} AND data <= ${f.al}
          AND "statoPagamento" IN ('PAID', 'PARTIALLY_PAID')
          AND (${brand}::text IS NULL OR canale = ${brand}::text)
        GROUP BY "prodottoId"
      ) v ON v."prodottoId" = pc."prodottoId"
      GROUP BY pc."collezioneId"`,
  ]);

  const perColl = new Map(perCollezione.map((r) => [r.collezioneId, r]));

  // Il venduto di ogni collezione e la sua **quota**: la quota si legge sul
  // totale delle collezioni in elenco, così le percentuali sommano a quello che
  // si vede e non a un totale invisibile.
  const righe = collezioni.map((c) => {
    // Il venduto conta **tutti** i prodotti, anche gli archiviati: hanno venduto
    // davvero, e toglierli dal fatturato sarebbe falso. Il conteggio dei
    // prodotti invece è quello **in vendita**, perché è la fila da ordinare.
    const agg = perColl.get(c.id);
    const ricavo = agg?.ricavo ?? 0;
    const pezzi = agg?.pezzi ?? 0;
    const attivi = agg?.attivi ?? 0;
    const posizioni = posizioniDa(c.posizioni);
    return {
      c,
      ricavo,
      pezzi,
      attivi,
      fuoriScena: c._count.prodotti - attivi,
      posizioni,
      inVetrina: posizioni.includes("vetrina"),
      // La regola salvata e' stata toccata dopo l'ultima volta che l'ordine di
      // questa collezione e' stato scritto: sta mostrando una fila decisa da
      // una versione che non esiste piu'.
      regolaPiuRecente:
        c.regolaOrdine != null &&
        (c.ordineModificatoIl == null || c.ordineModificatoIl < c.regolaOrdine.aggiornataIl),
      daSincronizzare:
        c.ordineModificatoIl != null && (c.ordineSpintoIl == null || c.ordineModificatoIl > c.ordineSpintoIl),
    };
  });
  // **Il totale è il venduto vero del periodo, non la somma delle collezioni.**
  // Un prodotto sta in molte collezioni: sommandole si conta più volte lo stesso
  // incasso e viene fuori un numero molto più grande del fatturato — che letto di
  // sfuggita sembra il fatturato. La quota si legge quindi come «quanta parte del
  // venduto passa da questa collezione».
  const totaleRicavo = venditePerProdotto.reduce((s, v) => s + (v._sum.ricavo ?? 0), 0);

  // — Ricerca e filtri —
  // Le tendine offrono **solo i valori che esistono davvero** in questo ambito:
  // un menu che propone un negozio senza collezioni fa cercare a vuoto.
  const negoziInElenco = [...new Set(righe.map((r) => r.c.negozio))].sort((a, b) => a.localeCompare(b));
  const tipologieInElenco = [
    ...new Map(righe.filter((r) => r.c.tipologia).map((r) => [r.c.tipologia!.id, r.c.tipologia!.nome])),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  // Il testo si confronta **normalizzato** (via accenti, trattini e maiuscole):
  // cercando "saint honore" si vuole trovare «SAINT-HONORÈ», che è proprio il
  // caso per cui si cerca. Stessa `normalizza()` della riconciliazione — con
  // poche centinaia di righe già in memoria non serve chiederlo al database, e
  // un `contains` sul titolo vero darebbe zero risultati (trappola già pagata).
  const q = (sp.q ?? "").trim();
  const parole = normalizza(q).split(" ").filter(Boolean);
  const filtro = FILTRI.some((f) => f.chiave === sp.filtro) ? sp.filtro : "";

  const passa = (r: (typeof righe)[number]) => {
    if (sp.negozio && r.c.negozio !== sp.negozio) return false;
    if (sp.tipologia && r.c.tipologia?.id !== sp.tipologia) return false;
    if (parole.length > 0) {
      // Tutte le parole devono comparire, in qualunque ordine e in qualunque
      // campo: si cerca «roma san valentino» senza sapere com'è scritto il nome.
      const testo = normalizza(
        `${r.c.titolo} ${r.c.negozio} ${r.c.handle} ${r.c.tipologia?.nome ?? ""} ${r.posizioni.join(" ")}`,
      );
      if (!parole.every((p) => testo.includes(p))) return false;
    }
    switch (filtro) {
      case "vetrina":
        return r.inVetrina;
      case "no-vetrina":
        return !r.inVetrina;
      case "da-sincronizzare":
        return r.daSincronizzare;
      case "senza-ordine":
        return !r.c.regolaOrdinamento;
      case "senza-rotazione":
        return r.c.rotazione == null;
      case "senza-tipologia":
        return r.c.tipologia == null;
      case "manuale":
        return r.c.tipo !== "automatica";
      case "automatica":
        return r.c.tipo === "automatica";
      // L'ordine e' un'altra cosa dal tipo: una collezione «per regola» puo'
      // avere la fila decisa a mano, ed e' il caso piu' frequente (212 su 343).
      case "fila-a-mano":
        return r.c.ordinamento === "MANUAL";
      case "fila-automatica":
        return r.c.ordinamento != null && r.c.ordinamento !== "MANUAL";
      case "sospesa":
        return r.c.stato === "sospesa";
      case "senza-prodotti":
        return r.attivi === 0;
      default:
        return true;
    }
  };

  const inScena = righe.length; // le pubblicate dell'ambito, prima di filtrare
  const filtrate = righe.filter(passa);
  const cercando = q !== "" || filtro !== "" || Boolean(sp.negozio) || Boolean(sp.tipologia);
  const inVetrina = filtrate.filter((r) => r.inVetrina).length;
  // Il venduto che passa dalle collezioni trovate. **Non è la somma delle loro
  // righe**: un prodotto sta in più collezioni e sommandole si conta più volte
  // lo stesso incasso — misurato, 2.874.458 € su un periodo che ne vale 218.637.
  // Si sommano quindi i **prodotti distinti** che stanno in almeno una di esse,
  // e il conto lo fa il database (`DISTINCT`). La base della quota resta il
  // venduto totale del periodo: non cambia perché sto cercando.
  // La query parte **solo quando si sta cercando**: senza filtri la risposta è
  // già `totaleRicavo`, e sarebbe un giro in più su ogni apertura di pagina.
  let ricavoFiltrate = 0;
  if (cercando && filtrate.length > 0) {
    const ids = filtrate.map((r) => r.c.id);
    const [riga] = await prisma.$queryRaw<{ ricavo: number }[]>`
      SELECT COALESCE(sum(v.ricavo), 0)::float8 AS "ricavo"
      FROM (
        SELECT DISTINCT pc."prodottoId" AS pid
        FROM "merchandising"."ProdottoInCollezioneShopify" pc
        WHERE pc."collezioneId" = ANY(${ids})
      ) d
      JOIN (
        SELECT "prodottoId", sum(ricavo) AS ricavo
        FROM "merchandising"."Vendita"
        WHERE data >= ${f.dal} AND data <= ${f.al}
          AND "statoPagamento" IN ('PAID', 'PARTIALLY_PAID')
          AND (${brand}::text IS NULL OR canale = ${brand}::text)
        GROUP BY "prodottoId"
      ) v ON v."prodottoId" = d.pid`;
    ricavoFiltrate = riga?.ricavo ?? 0;
  }

  // Confronto "decrescente" per ogni colonna; il verso lo si inverte dopo, così
  // la regola sta scritta una volta sola. Il pareggio si spezza sempre col nome,
  // altrimenti righe uguali ballano fra un caricamento e l'altro.
  const confronta = (a: (typeof righe)[number], b: (typeof righe)[number]): number => {
    switch (criterio) {
      case "modifica":
        // **L'ultima modifica è la più recente delle due.** `aggiornataShopifyIl`
        // è l'`updatedAt` del negozio, fermo all'ultimo import: curando una
        // vetrina qui — regola applicata, prodotti spostati — quella data non si
        // muove finché l'ordine non si spinge su Shopify, e la collezione appena
        // toccata finiva in fondo all'elenco «ultima modifica» (segnalato
        // dall'utente). Ora conta anche il lavoro fatto qui.
        return ultimaModifica(b.c) - ultimaModifica(a.c);
      case "prodotti":
        return b.attivi - a.attivi;
      case "nome":
        return b.c.titolo.localeCompare(a.c.titolo);
      case "vetrina":
        return Number(b.inVetrina) - Number(a.inVetrina) || b.ricavo - a.ricavo;
      case "ordine":
        return etichettaRegola(b.c.regolaOrdinamento).localeCompare(etichettaRegola(a.c.regolaOrdinamento));
      case "prossimo": {
        // Il giro più vicino in cima; chi non ruota in fondo — "non ne ha" non
        // è una data. desc = "prima i più imminenti", che è la domanda vera.
        const pa = a.c.rotazione ? prossimaVolta(a.c.rotazione)?.getTime() ?? Infinity : Infinity;
        const pb = b.c.rotazione ? prossimaVolta(b.c.rotazione)?.getTime() ?? Infinity : Infinity;
        return pa - pb;
      }
      case "rotazione":
        // Senza rotazione si finisce in fondo: "non ne ha" non è un valore che
        // compete con le frequenze, è l'assenza.
        return (
          (b.c.rotazione ? 1 : 0) - (a.c.rotazione ? 1 : 0) ||
          etichettaFrequenza(b.c.rotazione?.frequenza).localeCompare(etichettaFrequenza(a.c.rotazione?.frequenza))
        );
      default:
        return b.ricavo - a.ricavo;
    }
  };
  filtrate.sort((a, b) => {
    const d = confronta(a, b);
    return (verso === "asc" ? -d : d) || a.c.titolo.localeCompare(b.c.titolo);
  });

  // Link e freccia per l'intestazione di una colonna. **Ordinare non azzera la
  // ricerca**: i filtri restano nell'indirizzo, altrimenti un clic
  // sull'intestazione rimetterebbe davanti tutte e 343 le collezioni.
  const linkCol = (c: Criterio) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sp.negozio) p.set("negozio", sp.negozio);
    if (sp.tipologia) p.set("tipologia", sp.tipologia);
    if (filtro) p.set("filtro", filtro);
    p.set("ordina", `${c}-${criterio === c && verso === "desc" ? "asc" : "desc"}`);
    return `/visual?${p.toString()}`;
  };
  const segno = (c: Criterio) => (criterio !== c ? "" : verso === "asc" ? " ↑" : " ↓");
  const Intestazione = ({ c, testo, num }: { c: Criterio; testo: string; num?: boolean }) => (
    <th className={num ? "num" : undefined}>
      <a href={linkCol(c)} style={{ color: criterio === c ? "var(--text)" : "inherit", textDecoration: "none" }}>
        {testo}
        {segno(c)}
      </a>
    </th>
  );

  const dataIt = (d: Date | null) =>
    d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main">
        <TabsVetrina attiva="visual" />
        <div className="page-head">
          <div>
            <h1 className="page-title">Vetrina{brand ? ` — ${etichettaAmbito(brand)}` : ""}</h1>
            <p className="page-sub">
              Le collezioni <b>pubblicate sul negozio</b>{brand ? <> del brand <b>{etichettaAmbito(brand)}</b></> : ""}: cosa
              sono, quanto vendono e in che ordine si presentano. Da ognuna scegli la regola d&apos;ordine e la mandi a
              Shopify.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn btn-secondario" href="/riordini">
              Ipotesi di ordinativo{pianiBozza > 0 ? ` · ${pianiBozza} in bozza` : ""}
            </Link>
          </div>
        </div>

        {/* Le regole d'ordine «più venduti» e «più fatturato» decidono qui:
            se il venduto è vecchio, la fila lo è altrettanto. */}
        <FreschezzaVenduto />

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {inScena === 0 ? (
          <div className="vuoto">
            <p>Nessuna collezione <b>pubblicata sul negozio</b> da mettere in scena.</p>
            <p className="page-sub" style={{ marginTop: 8 }}>
              {totali === 0
                ? "Non ci sono collezioni importate: importale da "
                : `Ci sono ${totali} collezioni importate ma nessuna risulta pubblicata sul negozio online. Lo stato di pubblicazione si legge rifacendo l'import da `}
              <Link href="/collezioni">Collezioni → Importa da Shopify</Link>.
            </p>
          </div>
        ) : (
          <>
            {/* La ricerca: con centinaia di collezioni scorrere non è un modo di
                trovarle. I valori vivono nell'indirizzo, così una ricerca si
                può mandare a qualcuno o tenere fra i preferiti. */}
            <FormFiltri>
              <input
                type="search"
                name="q"
                placeholder="Cerca una collezione per nome, negozio o tipologia…"
                defaultValue={q}
                style={{ minWidth: 280 }}
              />
              {negoziInElenco.length > 1 && (
                <select name="negozio" defaultValue={sp.negozio ?? ""} aria-label="Negozio">
                  <option value="">Tutti i negozi</option>
                  {negoziInElenco.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
              {tipologieInElenco.length > 0 && (
                <select name="tipologia" defaultValue={sp.tipologia ?? ""} aria-label="Tipologia">
                  <option value="">Tutte le tipologie</option>
                  {tipologieInElenco.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                </select>
              )}
              <select name="filtro" defaultValue={filtro} aria-label="Condizione">
                <option value="">Tutte le collezioni</option>
                {FILTRI.map((f) => (
                  <option key={f.chiave} value={f.chiave}>
                    {f.nome}
                  </option>
                ))}
              </select>
              {/* L'ordinamento scelto sopravvive alla ricerca. */}
              <input type="hidden" name="ordina" value={`${criterio}-${verso}`} />
              <button type="submit" className="btn btn-secondario">Cerca</button>
              {cercando && (
                <Link className="btn btn-secondario" href="/visual">
                  Azzera
                </Link>
              )}
            </FormFiltri>

            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{filtrate.length}</div>
                <div className="kpi-etichetta">{cercando ? "Collezioni trovate" : "Collezioni in scena"}</div>
                <div className="kpi-sotto">
                  {cercando ? `su ${inScena} in scena, ${totali} importate` : `pubblicate su ${totali} importate`}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={{ color: inVetrina ? "var(--gold)" : "var(--text-tertiary)" }}>
                  {inVetrina}
                </div>
                <div className="kpi-etichetta">In vetrina</div>
                <div className="kpi-sotto">
                  {inVetrina === 0 ? "nessuna ancora segnata" : cercando ? "fra quelle trovate" : "segnate da noi"}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{euro(cercando ? ricavoFiltrate : totaleRicavo)}</div>
                <div className="kpi-etichetta">Venduto 90 giorni</div>
                <div className="kpi-sotto">
                  {cercando
                    ? `da queste collezioni, su ${euro(totaleRicavo)} del periodo`
                    : "tutto il venduto del periodo, a buon fine"}
                </div>
              </div>
            </div>

            {filtrate.length === 0 ? (
              <div className="vuoto">
                <p>
                  Nessuna collezione risponde a questa ricerca{q ? <> per «<b>{q}</b>»</> : null}.
                </p>
                <p className="page-sub" style={{ marginTop: 8 }}>
                  In scena ce ne sono {inScena}: <Link href="/visual">togli i filtri</Link> per rivederle tutte. La
                  ricerca guarda <b>nome, negozio, tipologia, posizioni e l&apos;indirizzo sul sito</b> — non i
                  prodotti che la collezione contiene.
                </p>
              </div>
            ) : (
            <div className="scheda">
              <div className="tabella-wrap">
                <table>
                  <thead>
                    <tr>
                      <Intestazione c="vetrina" testo="★" />
                      <Intestazione c="nome" testo="Collezione" />
                      <th>Caratteristiche</th>
                      <Intestazione c="prodotti" testo="In vendita" num />
                      <Intestazione c="venduto" testo="Venduto 90gg" num />
                      <Intestazione c="venduto" testo="Quota" num />
                      <Intestazione c="ordine" testo="Ordine" />
                      <Intestazione c="rotazione" testo="Rotazione" />
                      <Intestazione c="prossimo" testo="Prossimo giro" />
                      <Intestazione c="modifica" testo="Modificata" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtrate.map((r) => (
                      <tr key={r.c.id} className="riga-cliccabile">
                        {/* Il bollino della vetrina si accende e si spegne da qui:
                            vederlo e non poterlo cambiare sarebbe mezza risposta. */}
                        <td>
                          <form action={cambiaVetrina.bind(null, r.c.id)} style={{ position: "relative", zIndex: 1 }}>
                            <button
                              type="submit"
                              className="icon-btn"
                              title={r.inVetrina ? "Togli dalla vetrina" : "Metti in vetrina"}
                              style={{ color: r.inVetrina ? "var(--gold)" : "var(--text-tertiary)", fontSize: 16 }}
                            >
                              {r.inVetrina ? "★" : "☆"}
                            </button>
                          </form>
                        </td>
                        <td>
                          {/* La foto è quella **della collezione** su Shopify,
                              non di un suo prodotto: è l'immagine che il
                              cliente vede in cima alla pagina del sito. */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Miniatura url={r.c.immagine} />
                            <span>
                              <Link href={`/visual/${r.c.id}`} className="cella-nome link-riga">
                                {r.c.titolo}
                              </Link>
                              <div className="cella-sub">{r.c.negozio}</div>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Pill
                              testo={r.inVetrina ? "In vetrina" : "Non in vetrina"}
                              colore={r.inVetrina ? "var(--gold)" : "var(--text-tertiary)"}
                            />
                            <Pill
                              testo={r.c.tipo === "automatica" ? "Entra per regola" : "Entra a mano"}
                              colore={r.c.tipo === "automatica" ? "var(--blue)" : "var(--green)"}
                            />
                            {r.c.ordinamento !== "MANUAL" && (
                              <Pill
                                testo={`Ordine ${etichettaOrdinamentoShopify(r.c.ordinamento)}`}
                                colore="var(--text-tertiary)"
                              />
                            )}
                            {r.c.stato === "sospesa" && <Pill testo="Sospesa" colore="var(--orange)" />}
                            {r.c.tipologia && <Pill testo={r.c.tipologia.nome} colore="var(--purple, #5B4FC7)" />}
                            {r.c.inCampagne && <Pill testo="In campagne" colore="var(--blue)" />}
                            {r.posizioni
                              .filter((p) => p !== "vetrina")
                              .map((p) => (
                                <Pill key={p} testo={nomePosizione(p)} colore="var(--text-tertiary)" />
                              ))}
                            {r.regolaPiuRecente && <Pill testo="Ordine da rifare" colore="var(--orange)" />}
                            {r.daSincronizzare && <Pill testo="Da sincronizzare" colore="var(--orange)" />}
                          </div>
                        </td>
                        <td className="num">
                          {r.attivi}
                          {r.fuoriScena > 0 && <div className="cella-sub">+{r.fuoriScena} archiviati</div>}
                        </td>
                        <td className="num">{r.ricavo > 0 ? euro(r.ricavo) : "—"}</td>
                        <td className="num">
                          {totaleRicavo > 0 && r.ricavo > 0 ? percentuale(r.ricavo / totaleRicavo) : "—"}
                          {r.pezzi > 0 && <div className="cella-sub">{r.pezzi} pz</div>}
                        </td>
                        <td>
                          <span className="cella-sub">{etichettaRegola(r.c.regolaOrdinamento)}</span>
                        </td>
                        <td>
                          {r.c.rotazione ? (
                            <>
                              <Pill
                                testo={etichettaFrequenza(r.c.rotazione.frequenza)}
                                colore={r.c.rotazione.attiva ? "var(--green)" : "var(--text-tertiary)"}
                              />
                              <div className="cella-sub">
                                {r.c.rotazione.nome} · {etichettaModo(r.c.rotazione.modo)}
                                {r.c.rotazione.attiva ? "" : " · in pausa"}
                              </div>
                            </>
                          ) : (
                            <span className="cella-sub">—</span>
                          )}
                        </td>
                        <td>
                          {/* **Quando tocca a questa vetrina.** Il ritmo dice
                              ogni quanto, questa colonna dice **quando**: è la
                              domanda che ci si fa guardando l'elenco (chiesta
                              dall'utente). `prossimaVolta` è la stessa funzione
                              della pagina Rotazioni: mai eseguita = "al prossimo
                              cron", in pausa = non scatta. */}
                          {r.c.rotazione == null ? (
                            <span className="cella-sub">—</span>
                          ) : !r.c.rotazione.attiva ? (
                            <span className="cella-sub">in pausa</span>
                          ) : (
                            (() => {
                              const q = prossimaVolta(r.c.rotazione);
                              if (!q) return <span className="cella-sub">—</span>;
                              const oggi = new Date();
                              const scaduta = q.getTime() <= oggi.getTime();
                              return (
                                <span className="cella-sub" style={scaduta ? { color: "var(--gold-strong)", fontWeight: 600 } : undefined}>
                                  {scaduta ? "al prossimo cron" : q.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                                </span>
                              );
                            })()
                          )}
                        </td>
                        <td>
                          {/* Si mostra la più recente, **dicendo quale**: «qui» è
                              l'ordine curato in app e non ancora spinto, e senza
                              scriverlo sembrerebbe una data del negozio sbagliata. */}
                          {(r.c.ordineModificatoIl?.getTime() ?? 0) > (r.c.aggiornataShopifyIl?.getTime() ?? 0) ? (
                            <span className="cella-sub">
                              {dataIt(r.c.ordineModificatoIl)}
                              <div style={{ fontSize: 11 }}>
                                qui{r.c.ordineSpintoIl == null || r.c.ordineModificatoIl! > r.c.ordineSpintoIl ? ", da mandare al negozio" : ""}
                              </div>
                            </span>
                          ) : (
                            <span className="cella-sub">{dataIt(r.c.aggiornataShopifyIl)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cercando && (
                <p className="page-sub" style={{ marginTop: 12 }}>
                  Stai guardando <b>{filtrate.length}</b> collezioni su {inScena} in scena. La ricerca guarda{" "}
                  <b>nome, negozio, tipologia, posizioni e l&apos;indirizzo sul sito</b> (l&apos;<i>handle</i>: è per
                  questo che «roma» trova anche «Corteggiamento», che su Flowers vive a <code>/romantico</code>), e
                  ignora accenti, trattini e maiuscole. Non cerca <b>dentro</b> i prodotti della collezione.
                </p>
              )}
              <p className="page-sub" style={{ marginTop: 12 }}>
                <b>Clicca un&apos;intestazione per ordinare</b>, riclicca per invertire. Non c&apos;è «novità»: Shopify
                non dà una data di creazione per le collezioni, quindi si ordina per <b>ultima modifica sul negozio</b>,
                che è un dato vero.
              </p>
              <p className="page-sub" style={{ marginTop: 8 }}>
                La quota dice <b>quanta parte del venduto del periodo passa da quella collezione</b> (base: {euro(totaleRicavo)},
                tutto il venduto a buon fine). Un prodotto sta in più collezioni, quindi <b>le quote non sommano a
                100%</b>: sommarle conterebbe più volte lo stesso incasso.
              </p>
            </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Pillola di caratteristica: si legge a colpo d'occhio senza aprire la scheda. */
function Pill({ testo, colore }: { testo: string; colore: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: colore,
        background: `color-mix(in srgb, ${colore} 12%, transparent)`,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {testo}
    </span>
  );
}

