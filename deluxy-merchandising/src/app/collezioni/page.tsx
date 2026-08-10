import Link from "next/link";
import { cambiaPreferitaCollezione } from "@/lib/azioni-collezioni-shopify";
import { Badge } from "@/components/Badge";
import { BarraQuota } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { importaCollezioniAzione } from "@/lib/azioni-collezioni";
import { brandCorrente } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { elencoNegozi } from "@/lib/negozi";
import { ultimiImportCollezioni } from "@/lib/shopify-collezioni";
import {
  COLORE_STATO_COLLEZIONE_SHOPIFY,
  ETICHETTA_STATO_COLLEZIONE_SHOPIFY,
  ETICHETTA_TIPO_COLLEZIONE,
  nomePosizione,
  posizioniDa,
} from "@/lib/collezioni";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import {
  calcolaMargine,
  COLORE_STATO_COLLEZIONE,
  ETICHETTA_STATO_COLLEZIONE,
  etichettaStagione,
  euro,
  iso,
  percentuale,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";
// L'import di un negozio grande fa migliaia di chiamate: senza questo la
// richiesta viene tagliata a metà strada.
export const maxDuration = 300;

export default async function CollezioniPage({
  searchParams,
}: {
  searchParams: Promise<{
    esito?: string;
    messaggio?: string;
    errore?: string;
    ordina?: string;
    dir?: string;
    cerca?: string;
    negozio?: string;
    solo?: string;
  }>;
}) {
  const sp = await searchParams;
  // Insieme e non in fila: l'elenco dei negozi non dipende dall'ambito, e
  // aspettarlo dopo raddoppiava i giri al database.
  const [brand, negoziTutti] = await Promise.all([brandCorrente(), elencoNegozi()]);

  // Quali negozi corrispondono all'ambito scelto: per la corrispondenza
  // impostata sul negozio («nome nel venduto») o, in mancanza, per nome uguale.
  const negoziDellAmbito = brand
    ? negoziTutti.filter((n) => n.canaleVendite === brand || n.nome === brand).map((n) => n.nome)
    : [];
  const ambitoSenzaNegozio = Boolean(brand) && negoziDellAmbito.length === 0;

  const [collezioni, prodotti, inVendita, daPubblicare, collezioniShopify, ultimiImport] = await Promise.all([
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { creataIl: "desc" }],
      include: {
        _count: { select: { prodotti: true } },
        prodotti: { select: { costoProduzione: true, prezzoVendita: true } },
      },
    }),
    prisma.prodotto.findMany({ select: { costoProduzione: true, prezzoVendita: true } }),
    prisma.prodotto.count({ where: { fase: "in_vendita" } }),
    prisma.prodotto.count({ where: { shopifyStato: { not: "pubblicato" }, fase: { not: "archiviato" } } }),
    // L'ambito è il **canale del venduto** ("deluxy.it", "cakedesign.me"), il
    // negozio qui si chiama "Gifts" o "Cake": filtrare per nome uguale mostrava
    // zero collezioni, che è indistinguibile da «non le hai importate».
    // Si passa dalla corrispondenza impostata sul negozio; se non c'è, si
    // mostrano tutte e la pagina lo dice.
    prisma.collezioneShopify.findMany({
      where: negoziDellAmbito.length > 0 ? { negozio: { in: negoziDellAmbito } } : {},
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      include: {
        _count: { select: { prodotti: true } },
        prodotti: { select: { prodottoId: true } },
        temi: { select: { id: true, nome: true } },
      },
    }),
    ultimiImportCollezioni(),
  ]);
  const negozi = negoziTutti.filter((n) => n.attivo);

  // Il venduto di ogni collezione: una query sola per tutti i prodotti che
  // compaiono in almeno una collezione, poi si somma in memoria.
  const f = finestra(90);
  // Niente `IN (...)` con centinaia di id: si raggruppa il venduto della finestra
  // e si legge solo quello che serve. Una lista di id lunga rende la query più
  // pesante del giro completo, e cresce col catalogo.
  const venditePerProdotto = collezioniShopify.length
    ? await prisma.vendita.groupBy({
        by: ["prodottoId"],
        where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE },
        _sum: { quantita: true, ricavo: true },
      })
    : [];
  const vp = new Map(venditePerProdotto.map((v) => [v.prodottoId as string, v]));
  // L'ordinamento si fa qui e non nel database perché il venduto non è una
  // colonna: è la somma delle vendite dei prodotti della collezione, calcolata
  // sopra. Ordinare in SQL vorrebbe dire non poter ordinare per la colonna che
  // interessa di più.
  const ordina = sp.ordina ?? "venduto";
  const discendente = (sp.dir ?? (ordina === "titolo" || ordina === "negozio" ? "asc" : "desc")) === "desc";
  const conVenduto = collezioniShopify
    .map((c) => {
      const ricavo = c.prodotti.reduce((s, x) => s + (vp.get(x.prodottoId)?._sum.ricavo ?? 0), 0);
      const pezzi = c.prodotti.reduce((s, x) => s + (vp.get(x.prodottoId)?._sum.quantita ?? 0), 0);
      return { c, ricavo, pezzi };
    })
    .sort((a, b) => {
      const testo = (x: string, y: string) => x.localeCompare(y, "it");
      let d = 0;
      switch (ordina) {
        case "titolo":
          d = testo(a.c.titolo, b.c.titolo);
          break;
        case "negozio":
          d = testo(a.c.negozio, b.c.negozio) || testo(a.c.titolo, b.c.titolo);
          break;
        case "tipo":
          d = testo(a.c.tipo, b.c.tipo) || testo(a.c.titolo, b.c.titolo);
          break;
        case "prodotti":
          d = a.c._count.prodotti - b.c._count.prodotti;
          break;
        case "pezzi":
          d = a.pezzi - b.pezzi;
          break;
        case "stato":
          d = testo(a.c.stato, b.c.stato) || testo(a.c.titolo, b.c.titolo);
          break;
        case "uso": {
          // Quante cose la usano: posizioni dichiarate + campagne. Chi non è
          // usata da niente sta in fondo — è la domanda «cosa è appeso a cosa».
          const usoDi = (x: typeof a) => posizioniDa(x.c.posizioni).length + (x.c.inCampagne ? 1 : 0);
          d = usoDi(a) - usoDi(b);
          break;
        }
        default:
          d = a.ricavo - b.ricavo;
      }
      // A parità, il titolo: così l'ordine non balla fra un caricamento e l'altro.
      if (d === 0) d = testo(a.c.titolo, b.c.titolo);
      return discendente ? -d : d;
    });

  // **Prima si ordina, poi si restringe**: ricerca e filtri non cambiano
  // l'ordine scelto, tolgono solo le righe che non c'entrano. La ricerca guarda
  // titolo, handle e temi — i tre nomi con cui una collezione si conosce.
  const cerca = (sp.cerca ?? "").trim().toLowerCase();
  const soloPreferite = sp.solo === "preferite";
  const filtroNegozio = (sp.negozio ?? "").trim();
  const visibili = conVenduto.filter(({ c }) => {
    if (soloPreferite && !c.preferita) return false;
    if (filtroNegozio && c.negozio !== filtroNegozio) return false;
    if (cerca) {
      const dentro = `${c.titolo} ${c.handle} ${c.temi.map((t) => t.nome).join(" ")}`.toLowerCase();
      if (!dentro.includes(cerca)) return false;
    }
    return true;
  });
  const negoziInElenco = [...new Set(collezioniShopify.map(({ negozio }) => negozio))].sort();

  // Link di intestazione: cliccando si ordina, ricliccando si inverte.
  //
  // Il primo clic sceglie il verso che ci si aspetta da quella colonna: i nomi
  // partono dalla A, i numeri dal più grande. Una colonna di testo che parte
  // dalla Z sembra rotta.
  const NUMERICHE = new Set(["prodotti", "venduto", "pezzi"]);
  const linkOrdine = (chiave: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "ordina" && k !== "dir") q.set(k, v);
    q.set("ordina", chiave);
    const versoNaturale = NUMERICHE.has(chiave) ? "desc" : "asc";
    q.set("dir", ordina === chiave ? (discendente ? "asc" : "desc") : versoNaturale);
    return `/collezioni?${q}`;
  };
  const freccia = (chiave: string) => (ordina === chiave ? (discendente ? " ↓" : " ↑") : "");
  // La quota è sul venduto delle collezioni mostrate. Un prodotto in due
  // collezioni pesa in entrambe: le collezioni si sovrappongono per natura, e
  // le percentuali non fanno 100. È così anche su Shopify.
  const ricavoCollezioni = conVenduto.reduce((s, x) => s + x.ricavo, 0);

  // Il margine medio conta solo dove il costo c'è: a costo zero il margine non
  // è 100%, è un costo che nessuno ha inserito.
  const conCosto = prodotti.filter((p) => p.prezzoVendita > 0 && p.costoProduzione > 0);
  const margineMedio =
    conCosto.length > 0
      ? conCosto.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) /
        conCosto.length
      : null;

  function margineCollezione(ps: { costoProduzione: number; prezzoVendita: number }[]): number | null {
    const v = ps.filter((p) => p.prezzoVendita > 0 && p.costoProduzione > 0);
    if (!v.length) return null;
    return v.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) / v.length;
  }

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Collezioni</h1>
            <p className="page-sub">
              Il prodotto organizzato per stagione, come in una maison: dal concept alla vetrina, fino alla
              pubblicazione su Shopify.
            </p>
          </div>
          <div className="riga-azione">
            <a className="btn btn-secondario" href="/collezioni/temi">Temi</a>
            <a className="btn btn-secondario" href="/collezioni/nuova">Nuova collezione</a>
            {/* Un bottone per negozio: l'import di tutti insieme non arrivava
                in fondo col negozio più grande. */}
            {negozi.map((n) => (
              <form action={importaCollezioniAzione.bind(null, n.id)} key={n.id}>
                <button className="btn" type="submit">
                  Importa {n.nome}
                </button>
              </form>
            ))}
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {sp.esito && (
          <div className={sp.esito === "ok" ? "nota-info" : "avviso-errore"}>
            {sp.esito === "ok" && <span className="nota-icona">✓</span>}
            <span>{sp.messaggio || "Import completato."}</span>
          </div>
        )}

        {brand && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Ambito <b>{brand}</b>: le collezioni <b>Shopify</b> qui sotto sono solo quelle del suo negozio.
              Le collezioni <b>della maison</b> restano trasversali — una stessa collezione può vendersi su più
              negozi — quindi quelle si vedono tutte.
            </span>
          </div>
        )}

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{collezioni.length}</div>
            <div className="kpi-etichetta">Collezioni</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{inVendita}</div>
            <div className="kpi-etichetta">Prodotti in vendita</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{margineMedio != null ? percentuale(margineMedio) : "n.d."}</div>
            <div className="kpi-etichetta">
              {margineMedio != null ? `Margine medio su ${conCosto.length} prodotti col costo` : "Margine: nessun costo inserito"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{daPubblicare}</div>
            <div className="kpi-etichetta">Da pubblicare su Shopify</div>
          </div>
        </div>

        {/* Le collezioni vere dei negozi: quelle che il cliente vede sul sito. */}
        <div className="scheda">
          <div className="scheda-titolo">
            Collezioni Shopify {brand ? `— ${brand}` : "(tutti i negozi)"} · {collezioniShopify.length}
          </div>
          {ambitoSenzaNegozio && (
            <div className="nota-info" style={{ marginBottom: 12 }}>
              <span className="nota-icona">◆</span>
              <span>
                Nessun negozio collegato corrisponde all&apos;ambito <b>{brand}</b>: qui i negozi si chiamano{" "}
                {negoziTutti.map((n) => n.nome).join(", ") || "—"}, mentre il venduto arriva da Orders con nomi
                come «{brand}». Imposta la corrispondenza in{" "}
                <Link href="/impostazioni">Negozi &amp; permessi</Link>, campo «nome nel venduto». Intanto
                sotto vedi <b>tutte</b> le collezioni.
              </span>
            </div>
          )}
          {/* **Ricerca e filtri** (chiesti dall'utente): un form GET, così il
              filtro sta nell'indirizzo e si condivide. L'ordinamento scelto
              sopravvive perché viaggia negli stessi parametri. */}
          {collezioniShopify.length > 0 && (
            <form method="get" className="filtri" style={{ marginBottom: 14 }}>
              {sp.ordina && <input type="hidden" name="ordina" value={sp.ordina} />}
              {sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
              <input
                type="search"
                name="cerca"
                defaultValue={sp.cerca ?? ""}
                placeholder="Cerca per titolo, handle o tema…"
                aria-label="Cerca una collezione"
              />
              <select name="negozio" defaultValue={filtroNegozio} aria-label="Negozio">
                <option value="">Tutti i negozi</option>
                {negoziInElenco.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
              <select name="solo" defaultValue={sp.solo ?? ""} aria-label="Solo preferite">
                <option value="">Tutte</option>
                <option value="preferite">★ Solo preferite</option>
              </select>
              <button type="submit" className="btn btn-secondario">Filtra</button>
              {(cerca || filtroNegozio || soloPreferite) && (
                <span className="page-sub" style={{ margin: 0, alignSelf: "center" }}>
                  {visibili.length} su {conVenduto.length} · <Link href="/collezioni">azzera</Link>
                </span>
              )}
            </form>
          )}
          {collezioniShopify.length === 0 ? (
            <p className="page-sub">
              Nessuna collezione importata. Il bottone <b>Importa da Shopify</b> le legge dai negozi collegati
              in <Link href="/impostazioni">Negozi &amp; permessi</Link> e le abbina ai prodotti per SKU.
            </p>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }} title="Preferite">★</th>
                    <th><Link href={linkOrdine("titolo")} className="th-ordina">Collezione{freccia("titolo")}</Link></th>
                    <th><Link href={linkOrdine("negozio")} className="th-ordina">Negozio{freccia("negozio")}</Link></th>
                    <th><Link href={linkOrdine("tipo")} className="th-ordina">Tipo{freccia("tipo")}</Link></th>
                    <th className="num"><Link href={linkOrdine("prodotti")} className="th-ordina">Prodotti{freccia("prodotti")}</Link></th>
                    <th className="num"><Link href={linkOrdine("venduto")} className="th-ordina">Venduto 90gg{freccia("venduto")}</Link></th>
                    <th><Link href={linkOrdine("pezzi")} className="th-ordina">Pezzi e quota{freccia("pezzi")}</Link></th>
                    <th><Link href={linkOrdine("stato")} className="th-ordina">Stato{freccia("stato")}</Link></th>
                    <th><Link href={linkOrdine("uso")} className="th-ordina">Dove è usata{freccia("uso")}</Link></th>
                  </tr>
                </thead>
                <tbody>
                  {visibili.map(({ c, ricavo, pezzi }) => (
                    <tr key={c.id} className="riga-cliccabile">
                      <td style={{ width: 34 }}>
                        {/* La stellina e' un form suo: la riga intera e' un link
                            e il bottone deve vincere sul click della riga. */}
                        <form action={cambiaPreferitaCollezione.bind(null, c.id)} style={{ position: "relative", zIndex: 1 }}>
                          <button
                            type="submit"
                            className="icon-btn"
                            title={c.preferita ? "Togli dalle preferite" : "Metti fra le preferite"}
                            style={{ color: c.preferita ? "var(--gold)" : "var(--text-tertiary)", fontSize: 16 }}
                          >
                            {c.preferita ? "★" : "☆"}
                          </button>
                        </form>
                      </td>
                      <td>
                        <Link href={`/collezioni/shopify/${c.id}`} className="cella-nome link-riga">
                          {c.titolo}
                        </Link>
                        <div className="cella-sub">/{c.handle}</div>
                        {/* I temi a cui è assegnata: raggruppamenti decisi da
                            una persona, non dedotti. Si vedono qui perché è
                            l'elenco da cui si cerca una collezione. */}
                        {c.temi.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4, position: "relative", zIndex: 1 }}>
                            {c.temi.map((t) => (
                              <Link key={t.id} href={`/collezioni/temi/${t.id}`} className="pill-tema">
                                {t.nome}
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="cella-muta">{c.negozio}</td>
                      <td className="cella-muta">{ETICHETTA_TIPO_COLLEZIONE[c.tipo] ?? c.tipo}</td>
                      <td className="num">
                        {c._count.prodotti}
                        <span className="cella-muta"> / {c.prodottiShopify}</span>
                      </td>
                      <td className="num">
                        {euro(ricavo)}
                        <div className="cella-sub">{pezzi} pz</div>
                      </td>
                      <td style={{ width: 120 }}>
                        <BarraQuota quota={ricavoCollezioni > 0 ? ricavo / ricavoCollezioni : 0} />
                      </td>
                      <td>
                        <Badge
                          testo={ETICHETTA_STATO_COLLEZIONE_SHOPIFY[c.stato] ?? c.stato}
                          colore={COLORE_STATO_COLLEZIONE_SHOPIFY[c.stato] ?? "var(--text-tertiary)"}
                        />
                      </td>
                      <td>
                        {/* **Dove è usata, a pillole** (chiesto dall'utente: era
                            un grigino sotto lo stato e non si vedeva). Sono le
                            posizioni dichiarate sulla scheda — vetrina, home,
                            menu… — più le campagne: quello che si romperebbe
                            toccando la collezione. */}
                        {posizioniDa(c.posizioni).length === 0 && !c.inCampagne ? (
                          <span className="cella-sub" title="Si dichiara nella scheda della collezione, riquadro «come la usiamo noi».">
                            —
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {posizioniDa(c.posizioni).map((p) => (
                              <span key={p} className="pill-uso">{nomePosizione(p)}</span>
                            ))}
                            {c.inCampagne && <span className="pill-uso pill-uso-oro">campagne</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ultimiImport.length > 0 && (
            <p className="page-sub" style={{ marginTop: 12 }}>
              Ultimo import —{" "}
              {ultimiImport.map((i, k) => (
                <span key={i.id}>
                  {k > 0 ? " · " : ""}
                  <b>{i.negozio}</b> {iso(i.iniziatoIl)}: {i.messaggio}
                </span>
              ))}
            </p>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>
            «Prodotti qui» sono quelli della collezione che l&apos;app riconosce (abbinati per SKU, poi per
            codice, poi per titolo esatto); «su Shopify» quanti ne contiene davvero. La differenza è la parte
            di quella collezione che qui non esiste — non viene indovinata.
          </p>
        </div>

        <div className="scheda-titolo" style={{ margin: "26px 0 12px" }}>
          Collezioni della maison — nate qui, per stagione
        </div>
        {collezioni.length === 0 ? (
          <div className="vuoto">Nessuna collezione di maison. Crea la prima per iniziare.</div>
        ) : (
          <div className="griglia-collezioni">
            {collezioni.map((c) => {
              const m = margineCollezione(c.prodotti);
              return (
                <a key={c.id} className="card-collezione" href={`/collezioni/${c.id}`}>
                  <div className="card-cover">
                    <span className="card-cover-stagione">{etichettaStagione(c.stagione)}</span>
                  </div>
                  <div className="card-corpo">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span className="card-nome">{c.nome}</span>
                      <Badge testo={ETICHETTA_STATO_COLLEZIONE[c.stato]} colore={COLORE_STATO_COLLEZIONE[c.stato]} />
                    </div>
                    <p className="card-tema">{c.tema ?? c.descrizione ?? "—"}</p>
                    <div className="card-meta">
                      <span className="card-meta-num"><b>{c._count.prodotti}</b> prodotti</span>
                      <span className="card-meta-num">
                        {m != null ? <><b>{percentuale(m)}</b> margine</> : "margine —"}
                      </span>
                      <span className="card-meta-num">{c.dataLancio ? iso(c.dataLancio) : "senza data"}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
