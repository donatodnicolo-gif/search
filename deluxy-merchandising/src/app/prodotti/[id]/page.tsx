import { notFound } from "next/navigation";
import { DalNegozio } from "@/components/DalNegozio";
import { RiquadroSeo } from "@/components/RiquadroSeo";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { Badge } from "@/components/Badge";
import { tipologiaRisposta } from "@/lib/risposta-bisogno";
import { BarraMargine } from "@/components/BarraMargine";
import { prisma } from "@/lib/db";
import { elencoCategorie } from "@/lib/classificazione";
import { AnteprimaSito } from "@/components/AnteprimaSito";
import { salvaSezioneProdottoAzione } from "@/lib/azioni-sezione-prodotto";
import { sezioniDelSito } from "@/lib/descrizione-shopify";
import { linkAdmin, linkSito } from "@/lib/link-shopify";
import { CampoNegozioModificabile } from "@/components/CampoNegozio";
import { CAMPI_PRODOTTO } from "@/lib/campi-negozio";
import { aggiornaProdotto, aggiungiVariante, cambiaFase, eliminaVariante, ripristinaImmagine, segnaShopify } from "@/lib/azioni";
import { separaAzione } from "@/lib/azioni-riconciliazione";
import { cambiaComponenteAzione } from "@/lib/azioni-composti";
import { conti, riga } from "@/lib/composti";
import { costruisciPayloadShopify, shopifyConfigurato } from "@/lib/shopify";
import {
  calcolaMargine,
  CATEGORIE,
  COLORE_FASE,
  COLORE_SHOPIFY,
  ETICHETTA_CATEGORIA,
  ETICHETTA_FASE,
  ETICHETTA_SHOPIFY,
  etichettaCategoria,
  euro,
  FASI_PLM,
  iso,
  percentuale,
  prezzoVariante,
  STATI_SHOPIFY,
} from "@/lib/dominio";
import { dataOraIt, isoRoma } from "@/lib/fuso";

export const dynamic = "force-dynamic";

const TABS = [
  ["panoramica", "Panoramica"],
  ["sviluppo", "Sviluppo"],
  ["costi", "Costi & margini"],
  ["visual", "Visual"],
  ["shopify", "Shopify"],
] as const;

export default async function ProdottoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; esito?: string; messaggio?: string; seoConferma?: string; modifica?: string; seoModifica?: string }>;
}) {
  const { id } = await params;
  const { tab: tabRaw, esito, messaggio, seoConferma, modifica, seoModifica } = await searchParams;
  const tab = TABS.some(([t]) => t === tabRaw) ? tabRaw! : "panoramica";

  const [prodotto, collezioni, sezioniDefinite, negoziTutti, categorieVere] = await Promise.all([
    prisma.prodotto.findUnique({
      where: { id },
      include: {
        collezione: true,
        fornitore: true,
        varianti: { orderBy: [{ ordine: "asc" }, { creataIl: "asc" }] },
        unitoA: { select: { id: true, nome: true } },
        componenti: { orderBy: { creatoIl: "asc" }, include: { componente: true } },
        usatoIn: { include: { composto: { select: { id: true, nome: true, codice: true } } } },
        assorbiti: { select: { id: true, nome: true, codice: true, unitoIl: true } },
        tappe: { orderBy: { creataIl: "desc" } },
        vetrine: { include: { vetrina: true }, orderBy: { posizione: "asc" } },
        // ⭐ 10/09/2026 (utente): «fai vedere di quale collezione fa parte».
        // L'appartenenza si importa già da Shopify (56.820 righe, un cron per
        // negozio) ma non si vedeva da nessuna parte: un dato che si scrive e
        // non si rilegge tanto vale non averlo.
        collezioniShopify: {
          select: { id: true, collezione: { select: { titolo: true, negozio: true, tipo: true, handle: true } } },
        },
        pubblicazioni: { orderBy: { negozio: "asc" } },
        // Le foto che il prodotto ha avuto: le ultime dieci bastano a ritrovare
        // quella giusta e non fanno pesare la pagina quando la storia è lunga.
        storicoImmagini: { orderBy: { cambiataIl: "desc" }, take: 10 },
      },
    }),
    prisma.collezione.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // ⭐ 09/09/2026 (utente): «fai vedere le anteprime di prodotto anche su
    // scheda dettaglio». Servono le sezioni previste (danno nomi e ORDINE delle
    // tab) e i due plus di ogni sito (le righe 2 e 3 dei punti in cima).
    prisma.sezioneCategoria.findMany({
      where: { attiva: true },
      orderBy: [{ ordine: "asc" }],
      select: { categoria: true, negozio: true, nome: true, tipo: true, ordine: true },
    }),
    prisma.negozioShopify.findMany({ select: { nome: true, dominio: true, plusUno: true, plusDue: true } }),
    elencoCategorie(),
  ]);
  if (!prodotto) notFound();

  // Su **quale** negozio vive questo prodotto: lo si sa dalle collezioni a cui
  // appartiene — è l'unico legame che l'app ha fra un prodotto e un negozio.
  const suNegozio = await prisma.prodottoInCollezioneShopify.findFirst({
    where: { prodottoId: id },
    select: { collezione: { select: { negozio: true } } },
  });
  const negozioDelProdotto = suNegozio
    ? await prisma.negozioShopify.findFirst({
        where: { nome: suNegozio.collezione.negozio },
        select: { dominio: true, permessi: true, attivo: true },
      })
    : null;
  const puoScrivereSulNegozio =
    !!negozioDelProdotto?.attivo && (negozioDelProdotto?.permessi ?? "").includes("write_products");
  const valoreCampo: Record<string, string | null> = {
    nome: prodotto.nome,
    descrizione: prodotto.descrizione,
    tipoShopify: prodotto.tipoShopify,
    vendorShopify: prodotto.vendorShopify,
  };
  const urlAdmin = linkAdmin(negozioDelProdotto?.dominio, prodotto.shopifyId, "prodotto");
  const urlSito = linkSito(negozioDelProdotto?.dominio, prodotto.handleShopify, "prodotto");

  // Per un prodotto composto il costo non è il suo campo, è la somma dei
  // componenti: si rifà a ogni apertura, così non invecchia mai.
  const contiComposto = conti(prodotto.componenti.map((x) => riga(x.componente, x.quantita)));
  const m = calcolaMargine(prodotto.costoProduzione, prodotto.prezzoVendita);
  const target = prodotto.collezione?.margineTarget ?? null;
  const salva = aggiornaProdotto.bind(null, id);

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        {/* «Il ritorno al punto esatto» (Libro v1.5 §2): la history conserva
            i filtri dell'elenco; l'URL nudo è solo il ripiego da link diretto. */}
        <TornaIndietro fallback="/prodotti" label="Prodotti" />

        <div className="prodotto-hero">
          <div className="prodotto-foto">
            {prodotto.immagine ? <img src={prodotto.immagine} alt={prodotto.nome} /> : "❀"}
          </div>
          <div className="prodotto-intesta">
            <div className="prodotto-codice">{prodotto.codice}</div>
            <div className="prodotto-nome">
              {prodotto.nome}{" "}
              <a className="btn btn-secondario small" href={`/prodotti/${id}/modifica`} style={{ verticalAlign: "middle", marginLeft: 10 }} title="Lo stesso modulo del nuovo prodotto: scheda, foto, campi del negozio, varianti, pubblicazione">
                ✎ Modifica col modulo
              </a>
              {/* ⭐ 08/09/2026: «duplica» accanto a «modifica», che è il punto in cui
                  l'utente l'ha chiesta. Porta al modulo precompilato: SKU nuovi e
                  «(Duplica)» davanti al titolo; l'originale non si tocca. */}
              <a className="btn btn-secondario small" href={`/prodotti/${id}/duplica`} style={{ verticalAlign: "middle", marginLeft: 6 }} title="Crea un prodotto nuovo con gli stessi dati: SKU rigenerati, «(Duplica)» davanti al titolo. L'originale non cambia">
                ⧉ Duplica
              </a>
            </div>
            <div className="prodotto-badges">
              <Badge testo={ETICHETTA_FASE[prodotto.fase]} colore={COLORE_FASE[prodotto.fase]} />
              <Badge testo={etichettaCategoria(prodotto.categoria)} colore="var(--text-tertiary)" />
              <Badge testo={ETICHETTA_SHOPIFY[prodotto.shopifyStato]} colore={COLORE_SHOPIFY[prodotto.shopifyStato]} />
              {/* ⭐ 07/09/2026: su QUALI negozi sta, uno per uno (dal modulo o dall'import). */}
              {prodotto.pubblicazioni
                .filter((r) => r.shopifyId || r.errore)
                .map((r) => {
                  const stato = r.origine === "tolto" ? "tolto" : r.statoShopify === "ACTIVE" ? "attivo" : r.statoShopify === "DRAFT" ? "bozza" : r.statoShopify === "ARCHIVED" ? "archiviato" : r.errore ? "rifiutato" : "—";
                  // ⚠️ I token semantici si chiamano --green/--red (DS §2.1). Con --success e
                  // --danger, che non esistono, il pallino cadeva sul nero del testo: un
                  // negozio che aveva RIFIUTATO il prodotto si vedeva identico a uno dove
                  // è attivo (misurato l'08/09/2026: rgb(29,29,31) su entrambi).
                  const colore = stato === "attivo" ? "var(--green)" : stato === "rifiutato" ? "var(--red)" : "var(--grey)";
                  return <Badge key={r.negozio} testo={`${r.negozio} · ${stato}`} colore={colore} title={r.errore ?? r.handle ?? r.shopifyId ?? undefined} />;
                })}
              {(() => {
                const tr = tipologiaRisposta(prodotto.ggDispMin);
                return tr ? (
                  <Badge testo={tr.etichetta} colore={tr.colore} title={`Risposta al bisogno · ${tr.spiega}`} />
                ) : null;
              })()}
              {prodotto.collezione && (
                <a className="badge" style={{ color: "var(--blue)" }} href={`/collezioni/${prodotto.collezioneId}`}>
                  {prodotto.collezione.nome}
                </a>
              )}
            </div>
            {/* I campi del negozio — titolo, descrizione, foto, prezzo — si
                correggono **su Shopify**: qui verrebbero riscritti al primo
                import. Da qui ci si arriva in un clic, invece di cercare il
                prodotto fra i 4.610. */}
            {(urlAdmin || urlSito) && (
              <div className="riga-azione" style={{ marginTop: 10 }}>
                {urlAdmin && (
                  <a className="btn btn-secondario" href={urlAdmin} target="_blank" rel="noreferrer">
                    Modifica su Shopify ↗
                  </a>
                )}
                {urlSito && (
                  <a className="btn btn-secondario" href={urlSito} target="_blank" rel="noreferrer">
                    Vedi online ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Il banner mostra il MESSAGGIO, col tono dell'esito: prima stampava
            la parola «ok» e gli errori arrivavano vestiti di verde. */}
        {(messaggio || esito) && (
          <div className={esito === "errore" ? "avviso avviso-errore" : "avviso avviso-ok"}>
            {messaggio || esito}
          </div>
        )}

        {/* ---------- Riconciliazione ----------
            Due schede che sono lo stesso prodotto: qui si dice quali, e il
            venduto smette di contarsi due volte. Sta in alto perché finché due
            schede sono separate, tutto quello che si legge sotto è diviso a
            metà. */}
        <div className="scheda">
          <div className="scheda-titolo">Riconciliazione</div>
          {prodotto.unitoA ? (
            <>
              <p className="page-sub" style={{ marginTop: 0 }}>
                Questa scheda è <strong>unita a</strong>{" "}
                <a href={`/prodotti/${prodotto.unitoA.id}`}>{prodotto.unitoA.nome}</a>
                {prodotto.unitoIl ? ` dal ${iso(prodotto.unitoIl)}` : ""}: il suo venduto è stato spostato lì e
                questa resta fuori dalle analisi. Non è stato cancellato niente.
              </p>
              <form action={separaAzione.bind(null, prodotto.id)}>
                <button className="btn btn-secondario" type="submit">
                  Separa: rimetti qui il suo venduto
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="page-sub" style={{ marginTop: 0 }}>
                {prodotto.assorbiti.length > 0 ? (
                  <>
                    Ha assorbito {prodotto.assorbiti.length}{" "}
                    {prodotto.assorbiti.length === 1 ? "scheda" : "schede"}:{" "}
                    {prodotto.assorbiti.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ", "}
                        <a href={`/prodotti/${a.id}`}>{a.nome}</a>
                      </span>
                    ))}
                    . Il loro venduto è contato qui.
                  </>
                ) : (
                  <>
                    Se lo stesso prodotto esiste come più schede — capita coi titoli arrivati dal venduto di
                    negozi diversi — qui si uniscono, e le classifiche smettono di dividere in due lo stesso
                    prodotto.
                  </>
                )}
              </p>
              <a className="btn btn-secondario" href={`/prodotti/${prodotto.id}/riconcilia`}>
                Cerca schede da unire a questa
              </a>
            </>
          )}
        </div>

        {/* ---------- Composizione ----------
            Se il prodotto è fatto di altri prodotti, il suo costo è la somma
            dei loro: si legge qui, e non si riscrive. Se invece è un pezzo di
            altri composti, si dice dove finisce — serve a sapere chi si tocca
            cambiandogli il costo. */}
        {(prodotto.componenti.length > 0 || prodotto.usatoIn.length > 0) && (
          <div className="scheda">
            <div className="scheda-titolo">Composizione</div>
            {prodotto.componenti.length > 0 && (
              <>
                <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Componente</th>
                        <th className="num">Costo unitario</th>
                        <th className="num">Listino unitario</th>
                        <th className="num">Quantità</th>
                        <th className="num">Costo riga</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {/* «La riga si apre col click» (Libro v1.6 §8): tutta la
                          riga porta al componente; il campo quantità e Salva
                          restano loro (stanno sopra il link steso). */}
                      {contiComposto.righe.map((r) => (
                        <tr key={r.componente.id} className="riga-cliccabile">
                          <td>
                            <a href={`/prodotti/${r.componente.id}`} className="cella-nome link-riga">
                              {r.componente.nome}
                            </a>
                            <div className="cella-sub">{r.componente.codice}</div>
                          </td>
                          <td className="num" style={{ color: r.costoRiga === null ? "var(--orange)" : undefined }}>
                            {r.componente.costoProduzione > 0 ? euro(r.componente.costoProduzione) : "non lo sappiamo"}
                          </td>
                          <td className="num">
                            {r.componente.prezzoVendita > 0 ? euro(r.componente.prezzoVendita) : "—"}
                          </td>
                          <td className="num">
                            <form action={cambiaComponenteAzione.bind(null, prodotto.id, r.componente.id)}>
                              <input
                                name="quantita"
                                type="number"
                                min="0"
                                max="999"
                                defaultValue={r.quantita}
                                style={{ width: 70 }}
                                aria-label={`Quantità di ${r.componente.nome}`}
                              />
                              <button className="btn small" type="submit">
                                Salva
                              </button>
                            </form>
                          </td>
                          <td className="num">{r.costoRiga === null ? "—" : euro(r.costoRiga)}</td>
                          <td className="cella-sub">0 = togli</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <span className="cella-nome">Totale</span>
                          <div className="cella-sub">{contiComposto.pezzi} pezzi</div>
                        </td>
                        <td />
                        <td />
                        <td />
                        <td className="num">
                          <strong>{contiComposto.senzaCosto === contiComposto.righe.length ? "non lo sappiamo" : euro(contiComposto.costo)}</strong>
                          {!contiComposto.costoCompleto && (
                            <div className="cella-sub" style={{ color: "var(--orange)" }}>
                              parziale
                            </div>
                          )}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="page-sub">
                  {contiComposto.costoCompleto ? (
                    <>
                      Costo dai componenti <strong>{euro(contiComposto.costo)}</strong> · comprando i pezzi
                      separati si spenderebbero <strong>{euro(contiComposto.sommaListini)}</strong> · prezzo di
                      questo prodotto {prodotto.prezzoVendita > 0 ? <strong>{euro(prodotto.prezzoVendita)}</strong> : "da decidere"}.
                    </>
                  ) : (
                    <>
                      {contiComposto.senzaCosto}{" "}
                      {contiComposto.senzaCosto === 1 ? "componente non ha" : "componenti non hanno"} un costo:
                      il totale è <strong>parziale</strong> e il margine di questo prodotto non è calcolabile.
                    </>
                  )}
                </p>
              </>
            )}
            {prodotto.usatoIn.length > 0 && (
              <p className="page-sub" style={{ marginBottom: 0 }}>
                Questo prodotto è un pezzo di{" "}
                {prodotto.usatoIn.map((u, i) => (
                  <span key={u.composto.id}>
                    {i > 0 && ", "}
                    <a href={`/prodotti/${u.composto.id}`}>{u.composto.nome}</a> (×{u.quantita})
                  </span>
                ))}
                : cambiandogli il costo cambia anche il loro.
              </p>
            )}
            <div style={{ marginTop: 12 }}>
              <a className="btn btn-secondario" href="/multi-prodotto">
                Componi un altro prodotto
              </a>
            </div>
          </div>
        )}

        <div className="tabs">
          {TABS.map(([t, label]) => (
            <a key={t} className={`tab${tab === t ? " attivo" : ""}`} href={`?tab=${t}`}>{label}</a>
          ))}
        </div>

        {/* ---------- Fase (visibile in Panoramica e Sviluppo) ---------- */}
        {(tab === "panoramica" || tab === "sviluppo") && (
          <div className="scheda">
            <div className="scheda-titolo">Fase del ciclo di vita</div>
            <div className="pill-scelta">
              {FASI_PLM.map((f) => {
                const attuale = prodotto.fase === f;
                return (
                  <form action={cambiaFase.bind(null, id, f)} key={f}>
                    <button type="submit" className={`pill-opt${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: attuale ? undefined : COLORE_FASE[f] }}>
                      <span className="dot" style={{ background: COLORE_FASE[f] }} />
                      {ETICHETTA_FASE[f]}
                    </button>
                  </form>
                );
              })}
            </div>
            {/* La finestra di pubblicazione (04/09/2026): da quando e fino a
                quando sta sul negozio. Il giro delle 04:05 accende e spegne
                sul negozio i prodotti collegati a Shopify. */}
            <form action={salva} className="modulo" style={{ marginTop: 14 }}>
              <div className="campo-modulo">
                <label htmlFor="pubblicatoDal">Pubblico dal</label>
                <input id="pubblicatoDal" name="pubblicatoDal" type="date" defaultValue={prodotto.pubblicatoDal ? isoRoma(prodotto.pubblicatoDal) : ""} />
              </div>
              <div className="campo-modulo">
                <label htmlFor="pubblicatoFinoAl">Fino al</label>
                <input id="pubblicatoFinoAl" name="pubblicatoFinoAl" type="date" defaultValue={prodotto.pubblicatoFinoAl ? isoRoma(prodotto.pubblicatoFinoAl) : ""} />
              </div>
              <div className="campo-modulo largo" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <button type="submit" className="btn btn-secondario small">Salva le date</button>
                <span className="cella-sub">
                  Vuote = da subito, per sempre. Si vedono nel <a href="/sviluppo/calendario">calendario delle pubblicazioni</a>.
                  {!prodotto.shopifyId && " Questo prodotto non è collegato a Shopify: le date restano un programma."}
                </span>
              </div>
            </form>
          </div>
        )}

        {/* ---------- Panoramica ---------- */}
        {tab === "panoramica" && (
          <form action={salva}>
            <div className="scheda">
              <div className="scheda-titolo">Anagrafica</div>
              <div className="modulo">
                <div className="campo-modulo largo">
                  <label>Nome</label>
                  <input name="nome" defaultValue={prodotto.nome} />
                </div>
                <div className="campo-modulo">
                  <label>Collezione</label>
                  <select name="collezioneId" defaultValue={prodotto.collezioneId ?? ""}>
                    <option value="">— Nessuna —</option>
                    {collezioni.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo">
                  <label>Categoria</label>
                  <select name="categoria" defaultValue={prodotto.categoria}>
                    {/* ⚠️⚠️ 10/09/2026 — qui c'era `CATEGORIE` di `dominio.ts`:
                        una tassonomia VECCHIA (Bouquet, Pianta, Home fragrance)
                        che non contiene le categorie di oggi. Il prodotto aveva
                        TORTE_DOLCI, quel valore non era fra le opzioni, e la
                        tendina mostrava la prima della lista: «Bouquet».
                        Salvando, la categoria vera sarebbe stata sostituita da
                        una sbagliata senza che nessuno l'avesse scelta.
                        Le categorie vere stanno nella tabella. */}
                    {categorieVere.map((c) => (
                      <option key={c.chiave} value={c.chiave}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo largo">
                  <label>Descrizione</label>
                  <textarea name="descrizione" rows={3} defaultValue={prodotto.descrizione ?? ""} />
                </div>
              </div>
              <div className="azioni-modulo">
                <button type="submit" className="btn">Salva</button>
              </div>
            </div>
          </form>
        )}

        {/* ---------- Di quali collezioni fa parte (10/09/2026) ---------- */}
        {tab === "panoramica" && prodotto.collezioniShopify.length > 0 && (() => {
          const perNegozio = new Map<string, { titolo: string; tipo: string; handle: string | null }[]>();
          for (const x of prodotto.collezioniShopify) {
            const c = x.collezione;
            perNegozio.set(c.negozio, [...(perNegozio.get(c.negozio) ?? []), { titolo: c.titolo, tipo: c.tipo, handle: c.handle }]);
          }
          return (
            <div className="scheda">
              <div className="scheda-titolo">Collezioni · {prodotto.collezioniShopify.length}</div>
              <p className="cella-sub" style={{ marginBottom: 10 }}>
                Dove il negozio tiene questo prodotto. Si legge da Shopify a ogni import: qui non si cambia —
                le <b>automatiche</b> le decide la regola del negozio, le <b>manuali</b> si scelgono nel modulo del prodotto.
              </p>
              {[...perNegozio.entries()].sort().map(([negozio, righe]) => {
                const n = negoziTutti.find((x) => x.nome === negozio);
                return (
                  <div key={negozio} className="collezioni-negozio">
                    <span className="collezioni-sito">{negozio}</span>
                    <div className="pill-scelta">
                      {righe
                        .slice()
                        .sort((a, b) => a.titolo.localeCompare(b.titolo, "it"))
                        .map((c) => (
                          <span key={c.titolo} className="pill-opt" title={c.tipo === "manuale" ? "Collezione manuale" : "Collezione automatica: chi ci entra lo decide la regola del negozio"}>
                            {c.titolo}
                            <span className="collezioni-tipo">{c.tipo === "manuale" ? "manuale" : "auto"}</span>
                            {c.handle && n && (
                              <a href={`https://${n.dominio}/collections/${c.handle}`} target="_blank" rel="noreferrer" title="Apri la collezione sul sito">↗</a>
                            )}
                          </span>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ---------- Come si vede sui siti (09/09/2026) ----------
            L'anteprima che c'è nel modulo, anche qui: chi apre la scheda per
            capire com'è messo un prodotto non deve entrare in modifica per
            vederlo. La matitina porta al modulo, perché i campi stanno là —
            due posti dove scrivere la stessa cosa sarebbero due verità. */}
        {tab === "panoramica" && (() => {
          const scheda = (prodotto.sezioniScheda && typeof prodotto.sezioniScheda === "object" && !Array.isArray(prodotto.sezioniScheda)
            ? (prodotto.sezioniScheda as Record<string, Record<string, string>>)
            : {});
          // I siti da mostrare: dove il prodotto è pubblicato, quelli per cui
          // qualcuno ha già scritto delle sezioni, **e il negozio a cui il
          // prodotto appartiene**.
          //
          // ⚠️ Senza l'ultimo, l'anteprima spariva proprio sui prodotti che ne
          // hanno più bisogno: un «concept» non è pubblicato da nessuna parte e
          // non ha ancora sezioni compilate, quindi i primi due elenchi sono
          // vuoti — ed è lì che serve vedere come verrà. Trovato dall'utente su
          // «Macarons Luxury - Fiocchi di Neve» (concept, Business Deluxy).
          const siti = [...new Set([
            ...prodotto.pubblicazioni.filter((r) => r.shopifyId).map((r) => r.negozio),
            ...Object.keys(scheda),
            ...(prodotto.negozioNome ? [prodotto.negozioNome] : []),
          ])];
          if (!siti.length) return null;
          return (
            <div className="scheda">
              <div className="scheda-titolo">Come si vede sui siti</div>
              <p className="cella-sub" style={{ marginBottom: 10 }}>
                I tre punti in cima e le tab, nell&apos;ordine in cui escono sul negozio — l&apos;ordine si decide in{" "}
                <a href="/sezioni">Sezioni della scheda</a>.
              </p>
              {siti.map((sito) => {
                const previste = sezioniDelSito(sezioniDefinite, prodotto.categoria, sito);
                const valori = scheda[sito] ?? {};
                const n = negoziTutti.find((x) => x.nome === sito);
                const riga = prodotto.pubblicazioni.find((r) => r.negozio === sito);
                // Prima le previste nel loro ordine, poi quelle che il prodotto
                // ha ma che non sono più previste: è la stessa regola della
                // composizione, e senza la coda un testo scritto sotto una
                // sezione poi tolta sparirebbe dall'anteprima pur essendo online.
                const nomiPrevisti = new Set(previste.map((x) => x.nome));
                const elenco = [
                  ...previste.map((x) => ({ nome: x.nome, valore: valori[x.nome] ?? "", campoId: "" })),
                  ...Object.entries(valori)
                    .filter(([nome]) => !nomiPrevisti.has(nome))
                    .map(([nome, valore]) => ({ nome, valore, campoId: "" })),
                ];
                return (
                  <AnteprimaSito
                    key={sito}
                    sito={sito}
                    punti={[prodotto.plusProdotto ?? "", n?.plusUno ?? "", n?.plusDue ?? ""]}
                    descrizione={prodotto.descrizione ?? ""}
                    sezioni={elenco}
                    urlOnline={riga?.handle && n ? `https://${n.dominio}/products/${riga.handle}` : null}
                    azioneModifica={salvaSezioneProdottoAzione}
                    prodottoId={id}
                  />
                );
              })}
            </div>
          );
        })()}

        {/* **Il SEO sta fra le informazioni del prodotto** (chiesto dall'utente):
            è come il prodotto si presenta su Google, non un dettaglio tecnico da
            cercare in un'altra scheda. Sta qui e **solo** qui — lasciarlo anche
            sotto Shopify vorrebbe dire due form che scrivono lo stesso campo. */}
        {tab === "panoramica" && (
          <RiquadroSeo
            tipo="prodotto"
            id={id}
            daNegozio={{ titolo: prodotto.seoTitoloShopify, descrizione: prodotto.seoDescrizioneShopify }}
            nostro={{ titolo: prodotto.seoTitolo, descrizione: prodotto.seoDescrizione }}
            sincronia={{ modificatoIl: prodotto.seoModificatoIl, spintoIl: prodotto.seoSpintoIl }}
            percorso={`/prodotti/${id}`}
            conferma={seoConferma === "1"}
            inModifica={seoModifica === "1"}
          />
        )}

        {/* **Le foto di prima** (richiesta dell'utente, 08/09/2026: «salva i cambi
            di immagine così da poterle ripristinare nel tempo»). Compare solo se
            una storia c'è: un riquadro che dice «nessun cambio» sarebbe l'ennesima
            card vuota davanti al contenuto vero. */}
        {tab === "panoramica" && prodotto.storicoImmagini.length > 0 && (
          <div className="scheda">
            <div className="scheda-titolo">Foto di prima · {prodotto.storicoImmagini.length}</div>
            <p className="page-sub" style={{ marginBottom: 12 }}>
              La foto della scheda si riallinea al negozio a ogni import, e con quattro negozi lo stesso prodotto può averne una
              diversa su ciascuno. Qui restano quelle che aveva: si rimettono con un clic.
            </p>
            <div className="storico-foto">
              {prodotto.storicoImmagini.map((s) => (
                <form key={s.id} action={ripristinaImmagine.bind(null, prodotto.id, s.url)} className="storico-foto-voce">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" loading="lazy" />
                  <div className="cella-sub">
                    {dataOraIt(s.cambiataIl)}
                    <br />
                    {s.origine === "import" ? `sostituita dall'import${s.negozio ? ` di ${s.negozio}` : ""}` : s.origine === "ripristino" ? "ripristinata" : `cambiata dal ${s.origine}`}
                  </div>
                  <button type="submit" className="btn btn-secondario small" disabled={s.url === prodotto.immagine}>
                    {s.url === prodotto.immagine ? "È questa" : "Rimetti questa"}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}

        {/* Tutto quello che il negozio dice di questo prodotto: i metafield. */}
        {tab === "panoramica" && <DalNegozio p={prodotto} />}

        {/* ---------- Sviluppo (PLM) ---------- */}
        {tab === "sviluppo" && (
          <div className="due-colonne">
            <form action={salva}>
              <div className="scheda">
                <div className="scheda-titolo">Scheda creativa</div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Brief</label>
                    <textarea name="brief" rows={3} defaultValue={prodotto.brief ?? ""} />
                  </div>
                  <div className="campo-modulo">
                    <label>Materiali / fiori</label>
                    <input name="materiali" defaultValue={prodotto.materiali ?? ""} />
                  </div>
                  <div className="campo-modulo">
                    <label>Palette</label>
                    <input name="palette" defaultValue={prodotto.palette ?? ""} />
                  </div>
                  <div className="campo-modulo largo">
                    <label>Note di sviluppo</label>
                    <textarea name="noteSviluppo" rows={3} defaultValue={prodotto.noteSviluppo ?? ""} />
                  </div>
                </div>
                <div className="azioni-modulo">
                  <button type="submit" className="btn">Salva</button>
                </div>
              </div>
            </form>
            <div className="scheda">
              <div className="scheda-titolo">Storico delle fasi</div>
              {prodotto.tappe.length === 0 ? (
                <div className="vuoto-mini">Nessun passaggio registrato.</div>
              ) : (
                <ul className="storia">
                  {prodotto.tappe.map((t) => (
                    <li key={t.id}>
                      <span className="storia-data">{iso(t.creataIl)}</span>
                      <span>{ETICHETTA_FASE[t.da] ?? t.da}</span>
                      <span className="storia-freccia">→</span>
                      <span>{ETICHETTA_FASE[t.a] ?? t.a}</span>
                      {t.nota && <span className="storia-nota">{t.nota}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {prodotto.fornitore && (
                <p className="page-sub" style={{ marginTop: 14 }}>
                  Fornitore: <b>{prodotto.fornitore.nome}</b>{prodotto.fornitore.citta ? ` · ${prodotto.fornitore.citta}` : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---------- Costi & margini ---------- */}
        {tab === "costi" && (
          <>
            <div className="due-colonne">
              <form action={salva}>
                <div className="scheda">
                  <div className="scheda-titolo">Costo e prezzo (base)</div>
                  <div className="modulo">
                    <div className="campo-modulo">
                      <label>Costo di produzione (€)</label>
                      <input name="costoProduzione" type="number" step="0.01" min="0" defaultValue={prodotto.costoProduzione} />
                    </div>
                    <div className="campo-modulo">
                      <label>Prezzo di vendita (€)</label>
                      <input name="prezzoVendita" type="number" step="0.01" min="0" defaultValue={prodotto.prezzoVendita} />
                    </div>
                  </div>
                  <div className="azioni-modulo">
                    <button type="submit" className="btn">Salva</button>
                  </div>
                </div>
              </form>
              <div className="scheda">
                <div className="scheda-titolo">Marginalità</div>
                <div className="griglia-campi">
                  <div className="campo"><dt>Costo</dt><dd>{euro(m.costo)}</dd></div>
                  <div className="campo"><dt>Prezzo</dt><dd>{euro(m.prezzo)}</dd></div>
                  <div className="campo"><dt>Guadagno unitario</dt><dd>{euro(m.guadagno)}</dd></div>
                  <div className="campo"><dt>Mark-up</dt><dd>{percentuale(m.ricaricoPct)}</dd></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="scheda-titolo" style={{ marginBottom: 8 }}>Margine sul venduto{target != null ? ` · target ${target}%` : ""}</div>
                  <BarraMargine marginePct={m.marginePct} target={target} />
                </div>
              </div>
            </div>

            <div className="scheda">
              <div className="scheda-titolo">Varianti</div>
              {prodotto.varianti.length > 0 && (
                <div className="tabella-wrap" style={{ marginBottom: 14 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Variante</th><th>SKU</th><th className="num">Prezzo</th><th className="num">Costo</th>
                        <th>Margine</th><th className="num">Giacenza</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {prodotto.varianti.map((v) => {
                        const pv = prezzoVariante(prodotto, v);
                        const mv = calcolaMargine(pv.costo, pv.prezzo);
                        return (
                          <tr key={v.id}>
                            <td className="cella-nome">{v.nome}</td>
                            <td className="cella-muta">{v.sku ?? "—"}</td>
                            <td className="num">{euro(pv.prezzo)}</td>
                            <td className="num">{euro(pv.costo)}</td>
                            <td>{percentuale(mv.marginePct)}</td>
                            <td className="num">{v.giacenza}</td>
                            <td className="num">
                              <form action={eliminaVariante.bind(null, v.id, id)}>
                                <button className="icon-btn" title="Elimina variante" type="submit">✕</button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <form action={aggiungiVariante.bind(null, id)}>
                <div className="modulo" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
                  <div className="campo-modulo"><label>Nome</label><input name="nome" placeholder="Deluxe" required /></div>
                  <div className="campo-modulo"><label>SKU</label><input name="sku" placeholder="opz." /></div>
                  <div className="campo-modulo"><label>Δ prezzo (€)</label><input name="deltaPrezzo" type="number" step="0.01" defaultValue="0" /></div>
                  <div className="campo-modulo"><label>Δ costo (€)</label><input name="deltaCosto" type="number" step="0.01" defaultValue="0" /></div>
                  <div className="campo-modulo"><label>Giacenza</label><input name="giacenza" type="number" step="1" defaultValue="0" /></div>
                </div>
                <div className="azioni-modulo">
                  <button type="submit" className="btn btn-secondario">Aggiungi variante</button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* ---------- Visual ---------- */}
        {tab === "visual" && (
          <div className="due-colonne">
            <form action={salva}>
              <div className="scheda">
                <div className="scheda-titolo">Immagine e priorità di esposizione</div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Immagine (URL)</label>
                    <input name="immagine" defaultValue={prodotto.immagine ?? ""} placeholder="https://…" />
                  </div>
                  <div className="campo-modulo">
                    <label>Priorità (0–10)</label>
                    <input name="priorita" type="number" min="0" max="10" step="1" defaultValue={prodotto.priorita} />
                  </div>
                </div>
                <div className="azioni-modulo">
                  <button type="submit" className="btn">Salva</button>
                </div>
              </div>
            </form>
            <div className="scheda">
              <div className="scheda-titolo">Presente negli allestimenti</div>
              {prodotto.vetrine.length === 0 ? (
                <div className="vuoto-mini">Non è in nessuna vetrina o lookbook. <a className="ritorno" style={{ margin: 0 }} href="/visual">Vai a Visual →</a></div>
              ) : (
                <ul className="storia">
                  {prodotto.vetrine.map((vp) => (
                    <li key={vp.id}>
                      <a href={`/visual/${vp.vetrinaId}`} className="cella-nome">{vp.vetrina.nome}</a>
                      <span className="storia-nota">posizione {vp.posizione + 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ---------- Shopify ---------- */}
        {tab === "shopify" && (
          <>
            <div className="nota-info">
              <span className="nota-icona">◆</span>
              <span>
                {shopifyConfigurato()
                  ? "Negozio Shopify collegato. La pubblicazione invierà il payload qui sotto all'Admin API."
                  : "Nessun negozio Shopify collegato (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN non impostati). Puoi comunque preparare e segnare lo stato: il payload è pronto, la scrittura reale sul negozio si attiva collegando le credenziali."}
              </span>
            </div>
            {/* Il SEO **è passato in Panoramica** (17/08/2026, chiesto
                dall'utente): è un'informazione del prodotto, non un dettaglio
                tecnico. Qui resta solo il rimando — due form sullo stesso campo
                sarebbero due punti che possono dire cose diverse. */}
            <p className="page-sub" style={{ marginTop: -6 }}>
              Il <b>SEO</b> di questo prodotto sta fra le informazioni:{" "}
              <a href={`/prodotti/${id}?tab=panoramica`}>aprilo in Panoramica</a>.
            </p>
            <div className="scheda">
              <div className="scheda-titolo">Stato di pubblicazione</div>
              <div className="pill-scelta">
                {STATI_SHOPIFY.map((s) => {
                  const attuale = prodotto.shopifyStato === s;
                  return (
                    <form action={segnaShopify.bind(null, id, s)} key={s}>
                      <button type="submit" className={`pill-opt${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: attuale ? undefined : COLORE_SHOPIFY[s] }}>
                        <span className="dot" style={{ background: COLORE_SHOPIFY[s] }} />
                        {ETICHETTA_SHOPIFY[s]}
                      </button>
                    </form>
                  );
                })}
              </div>
              {prodotto.shopifySyncIl && (
                <p className="page-sub" style={{ marginTop: 12 }}>Ultima sincronizzazione: {iso(prodotto.shopifySyncIl)}{prodotto.shopifyId ? ` · ${prodotto.shopifyId}` : ""}</p>
              )}
            </div>
            <div className="scheda">
              <div className="scheda-titolo">Anteprima payload Shopify</div>
              <pre className="codice-blocco">{JSON.stringify(costruisciPayloadShopify(prodotto), null, 2)}</pre>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
