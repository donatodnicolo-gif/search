import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { etichettaRegola, FILTRO_IN_SCENA, isRegola, ordinaProdotti, parseRegole, type RegolaOrdinamento } from "@/lib/ordinamento-vetrina";
import { SelettoreRegole } from "@/components/SelettoreRegole";
import { REGOLE } from "@/lib/ordinamento-vetrina";
import { etichettaPassi, parsePassi } from "@/lib/regole-ordine";
import { applicaRegolaSalvataAzione, creaRegolaDaCollezione } from "@/lib/azioni-regole-ordine";
import {
  applicaRegolaOrdinamento,
  spostaInCollezione,
  spingiOrdineSuShopify,
  rimuoviProdottoDaCollezione,
} from "@/lib/azioni-vetrina-shopify";

export const dynamic = "force-dynamic";

const MAX_RIGHE = 300;
const NOMI_METRICHE = Object.fromEntries(REGOLE.map((r) => [r.chiave, r.nome]));
const MAX_ANTEPRIMA = 60;

export default async function CurazioneCollezionePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ esito?: string; messaggio?: string; regola?: string | string[]; rimuovi?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const c = await prisma.collezioneShopify.findUnique({
    where: { id },
    include: {
      tipologia: { select: { nome: true, regolaOrdinamento: true } },
      regolaOrdine: { select: { id: true, nome: true, passi: true } },
      prodotti: {
        orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
        include: {
          prodotto: {
            select: {
              id: true,
              nome: true,
              codice: true,
              immagine: true,
              prezzoVendita: true,
              costoProduzione: true,
              creatoIl: true,
              fase: true,
              statoShopify: true,
            },
          },
        },
      },
    },
  });
  if (!c) notFound();

  // Il push funziona solo se il negozio ha un token con write_products: lo si
  // legge dalla verifica salvata in Impostazioni, senza chiamare Shopify qui.
  // Il dominio serve per il link alla collezione **sul sito**.
  const [negozio, regoleSalvate] = await Promise.all([
    prisma.negozioShopify.findFirst({
      where: { nome: c.negozio },
      select: { permessi: true, attivo: true, dominio: true },
    }),
    prisma.regolaOrdine.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  // L'indirizzo della collezione sul negozio online. Si passa dal dominio
  // myshopify: è quello che conosciamo sempre, e Shopify manda da solo al
  // dominio vero del sito. Inventare qui il dominio pubblico vorrebbe dire
  // sbagliarlo per i negozi che non l'hanno impostato.
  const linkNegozio = negozio?.dominio ? `https://${negozio.dominio}/collections/${c.handle}` : null;

  // **Anteprima dell'ordine.** Le regole scelte arrivano nell'indirizzo (il form
  // è in GET): così si guarda come verrebbe *senza scrivere niente*, si cambia
  // idea quante volte si vuole, e si applica solo alla conferma. Stessa idea
  // della bozza di /multi-prodotto: finché non confermi, non esiste.
  const grezze = sp.regola == null ? [] : Array.isArray(sp.regola) ? sp.regola : [sp.regola];
  const inAnteprima = grezze.length > 0;
  const regoleAnteprima = grezze.filter((r): r is RegolaOrdinamento => isRegola(r) && r !== "manuale");
  const puoScrivere = !!negozio?.attivo && (negozio?.permessi ?? "").includes("write_products");
  const manuale = c.tipo === "manuale";
  const daSincronizzare =
    c.ordineModificatoIl != null && (c.ordineSpintoIl == null || c.ordineModificatoIl > c.ordineSpintoIl);

  // **In scena solo quello che il cliente vede.** La collezione sul negozio
  // contiene anche prodotti archiviati o in bozza: restano legati qui — è la
  // verità di Shopify — ma non entrano nella fila, perché ordinare prodotti
  // invisibili vuol dire decidere l'ordine di una vetrina che non esiste.
  const inScena = c.prodotti.filter(
    (vp) => vp.prodotto.statoShopify === "ACTIVE" && vp.prodotto.fase !== "archiviato",
  );
  const fuoriScena = c.prodotti.length - inScena.length;

  const righe = inScena.slice(0, MAX_RIGHE);
  const restano = inScena.length - righe.length;

  // Dov'è adesso ogni prodotto: serve a dire, nell'anteprima, chi sale e chi
  // scende. Un ordine nuovo senza il confronto è solo un altro elenco.
  const posizioneAttuale = new Map(inScena.map((vp, i) => [vp.prodottoId, i]));
  const anteprima = inAnteprima
    ? (
        await ordinaProdotti(
          inScena.map((vp) => ({
            prodottoId: vp.prodottoId,
            posizione: vp.posizione,
            nome: vp.prodotto.nome,
            prezzoVendita: vp.prodotto.prezzoVendita,
            costoProduzione: vp.prodotto.costoProduzione,
            creatoIl: vp.prodotto.creatoIl,
            codice: vp.prodotto.codice,
            immagine: vp.prodotto.immagine,
          })),
          regoleAnteprima
        )
      ).map((p, i) => ({ ...p, da: posizioneAttuale.get(p.prodottoId) ?? i, a: i }))
    : [];
  const quantiSiMuovono = anteprima.filter((p) => p.da !== p.a).length;

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 920 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">
              {c.negozio} · {c.tipo === "automatica" ? "collezione automatica" : "collezione manuale"}
              {c.pubblicataShopify ? " · pubblicata" : ""}
            </div>
            <h1 className="page-title">{c.titolo}</h1>
            <p className="page-sub">
              <b>{inScena.length}</b> prodotti in vendita
              {fuoriScena > 0 && (
                <>
                  {" "}
                  · {fuoriScena} archiviati o in bozza sul negozio, <b>fuori dalla fila</b> (il cliente non li vede)
                </>
              )}{" "}
              · ordine attuale: <b>{etichettaRegola(c.regolaOrdinamento)}</b>
              {c.tipologia && (
                <>
                  {" "}· tipologia <b>{c.tipologia.nome}</b> (regola standing {etichettaRegola(c.tipologia.regolaOrdinamento)}) ·{" "}
                  <a href="/visual/tipologie">gestisci</a>
                </>
              )}
            </p>
          </div>
          {/* La collezione com'è **sul sito**: serve a confrontare quello che si
              decide qui con quello che vede davvero il cliente. */}
          {linkNegozio && (
            <a className="btn btn-secondario" href={linkNegozio} target="_blank" rel="noreferrer">
              Apri sul sito ↗
            </a>
          )}
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {/* Regola d'ordine: prima si **guarda** come verrebbe, poi si applica. */}
        <div className="scheda">
          <div className="scheda-titolo">Regola d&apos;ordine</div>
          <form method="get" style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <SelettoreRegole valore={inAnteprima ? regoleAnteprima.join(",") : c.regolaOrdinamento} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-secondario">Vedi come verrebbe</button>
            </div>
          </form>
          <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Guardare non cambia niente: l&apos;ordine si scrive solo quando confermi.
          </p>
        </div>

        {/* **Regola salvata**: quella scritta una volta e riusata, che sa
            ragionare anche per categoria, prezzo, tag e risposta al bisogno.
            Sta in un riquadro suo perché è una scelta diversa dalle metriche
            rapide qui sopra — e sceglierne una **stacca** l'altra, altrimenti
            due ordini impostati insieme non si saprebbe quale vince. */}
        <div className="scheda">
          <div className="scheda-titolo">Regola salvata</div>
          {regoleSalvate.length === 0 ? (
            <p className="page-sub" style={{ marginTop: 0 }}>
              Nessuna regola salvata ancora. La prima si scrive da qui: dai un nome all&apos;ordine che hai davanti e
              diventa una regola riusabile su altre collezioni.
            </p>
          ) : (
            <>
              <form
                action={applicaRegolaSalvataAzione.bind(null, id)}
                style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
              >
                <select name="regolaOrdineId" defaultValue={c.regolaOrdineId ?? ""} aria-label="Regola salvata">
                  <option value="" disabled>Scegli una regola…</option>
                  {regoleSalvate.map((x) => (
                    <option key={x.id} value={x.id}>{x.nome}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primario">Applica</button>
                <a className="btn btn-secondario" href="/visual/regole">Gestisci le regole</a>
              </form>
              <p className="page-sub" style={{ marginTop: 10 }}>
                {c.regolaOrdine ? (
                  <>
                    In uso: <b>{c.regolaOrdine.nome}</b> — {etichettaPassi(parsePassi(c.regolaOrdine.passi), NOMI_METRICHE)}.
                    Correggendo la regola si rifanno <b>tutte</b> le collezioni che la usano: è il motivo per cui si salva.
                  </>
                ) : (
                  <>Applicare una regola salvata scrive subito l&apos;ordine, come «applica quest&apos;ordine».</>
                )}
              </p>
            </>
          )}

          {/* **La regola nasce qui.** È dove si sta guardando la fila: si prova
              con le metriche rapide finché convince, e a quel punto le si dà un
              nome. Ricominciare da una pagina vuota vorrebbe dire rifare da capo
              il ragionamento appena fatto. */}
          <CreaRegolaDaQui id={id} regole={inAnteprima ? regoleAnteprima : parseRegole(c.regolaOrdinamento)} />
        </div>

        {/* L'anteprima: l'ordine ipotizzato, con chi sale e chi scende. */}
        {inAnteprima && (
          <div className="scheda" style={{ borderColor: "var(--gold)" }}>
            <div className="scheda-titolo">
              Anteprima ·{" "}
              {regoleAnteprima.length === 0 ? "nessuna regola scelta" : etichettaRegola(regoleAnteprima.join(","))}
            </div>
            {regoleAnteprima.length === 0 ? (
              <div className="vuoto-mini">
                Non hai scelto nessuna regola: l&apos;ordine resterebbe quello curato a mano, com&apos;è adesso.
              </div>
            ) : anteprima.length === 0 ? (
              // Con zero prodotti «nessuno cambierebbe posto» sarebbe vero e
              // inutile: il motivo è che non c'è niente da ordinare.
              <div className="vuoto-mini">
                Questa collezione non ha prodotti conosciuti qui: non c&apos;è niente da mettere in ordine. Rilancia
                l&apos;import da <a href="/collezioni">Collezioni</a>.
              </div>
            ) : (
              <>
                <p className="page-sub" style={{ marginTop: 0 }}>
                  <b>Non è ancora applicato.</b> Così verrebbe:{" "}
                  {quantiSiMuovono === 0 ? (
                    <>nessun prodotto cambierebbe posto — l&apos;ordine è già questo.</>
                  ) : (
                    <>
                      <b>{quantiSiMuovono}</b> prodotti su {anteprima.length} cambierebbero posto.
                    </>
                  )}
                </p>
                <div className="tabella-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Prodotto</th>
                        <th className="num">Prezzo</th>
                        <th>Si muove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anteprima.slice(0, MAX_ANTEPRIMA).map((p) => {
                        const salto = p.da - p.a; // positivo = sale
                        return (
                          <tr key={p.prodottoId}>
                            <td className="num">{p.a + 1}</td>
                            <td>
                              <a href={`/prodotti/${p.prodottoId}`} className="cella-nome">{p.nome}</a>
                              <div className="cella-sub">{p.codice}</div>
                            </td>
                            <td className="num">{p.prezzoVendita > 0 ? euro(p.prezzoVendita) : "—"}</td>
                            <td>
                              {salto === 0 ? (
                                <span className="cella-sub">resta {p.da + 1}º</span>
                              ) : (
                                <span style={{ color: salto > 0 ? "var(--green)" : "var(--orange)", fontWeight: 600 }}>
                                  {salto > 0 ? "↑" : "↓"} {Math.abs(salto)}
                                  <span className="cella-sub" style={{ fontWeight: 400 }}> (era {p.da + 1}º)</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {anteprima.length > MAX_ANTEPRIMA && (
                  <p className="page-sub" style={{ marginTop: 10 }}>
                    Mostrati i primi {MAX_ANTEPRIMA} di {anteprima.length}: applicando, l&apos;ordine vale per tutti.
                  </p>
                )}
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
              <form action={applicaRegolaOrdinamento.bind(null, id)}>
                {regoleAnteprima.map((r) => (
                  <input key={r} type="hidden" name="regola" value={r} />
                ))}
                <button type="submit" className="btn" disabled={regoleAnteprima.length === 0}>
                  Applica quest&apos;ordine
                </button>
              </form>
              <a className="btn btn-secondario" href={`/visual/${id}`}>Annulla anteprima</a>
            </div>
          </div>
        )}

        {/* Push su Shopify: guardato per collezione manuale + token con write_products. */}
        <div className="scheda">
          <div className="scheda-titolo">Ordine su Shopify</div>
          <p className="page-sub" style={{ marginTop: 0 }}>
            {daSincronizzare ? (
              <b>C'è un ordine curato non ancora inviato al negozio.</b>
            ) : c.ordineSpintoIl ? (
              "L'ordine curato qui è già stato inviato al negozio."
            ) : (
              "L'ordine non è ancora stato inviato al negozio."
            )}
          </p>
          {!manuale && (
            <p className="page-sub" style={{ marginTop: 0, color: "var(--orange)" }}>
              È una collezione <b>automatica</b>: su Shopify i prodotti li ordina la regola della smart collection, non
              si può imporre un ordine a mano. Qui puoi comunque studiarne l'ordine.
            </p>
          )}
          {manuale && !puoScrivere && (
            <p className="page-sub" style={{ marginTop: 0, color: "var(--orange)" }}>
              Per inviare l'ordine serve un token con <b>write_products</b> collegato al negozio «{c.negozio}»: si
              imposta in <a href="/impostazioni">Negozi &amp; permessi</a>.
            </p>
          )}
          <form action={spingiOrdineSuShopify.bind(null, id)}>
            <button type="submit" className="btn" disabled={!manuale || !puoScrivere}>
              Invia l'ordine a Shopify
            </button>
          </form>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Sequenza dei prodotti</div>
          {/* Tre stati vuoti diversi, e vanno detti diversi: nessun prodotto
              legato, oppure prodotti legati ma tutti fuori vendita. «Nessun
              prodotto» sul secondo caso manderebbe a rifare un import che non
              cambierebbe niente. */}
          {inScena.length === 0 ? (
            <div className="vuoto-mini">
              {c.prodotti.length === 0
                ? "Nessun prodotto conosciuto in questa collezione. Rilancia l'import da Collezioni."
                : `Tutti i ${c.prodotti.length} prodotti di questa collezione sono archiviati o in bozza sul negozio: il cliente non ne vede nessuno, quindi non c'è una fila da mettere in ordine.`}
            </div>
          ) : (
            <>
              <div className="vetrina-lista">
                {righe.map((vp, i) => (
                  <div className="vetrina-riga" key={vp.id}>
                    <span className="vetrina-pos">{i + 1}</span>
                    <span className="vetrina-mini">
                      {vp.prodotto.immagine ? <img src={vp.prodotto.immagine} alt="" /> : "❀"}
                    </span>
                    <span className="vetrina-info">
                      <a href={`/prodotti/${vp.prodottoId}`} className="cella-nome">{vp.prodotto.nome}</a>
                      <div className="cella-sub">
                        <StatoNegozio stato={vp.prodotto.statoShopify} />
                        {" "}{vp.prodotto.codice}
                        {vp.prodotto.prezzoVendita > 0 ? ` · ${euro(vp.prodotto.prezzoVendita)}` : ""}
                      </div>
                    </span>
                    <span className="vetrina-azioni">
                      {/* **Togliere scrive sul negozio vero**, quindi si conferma
                          prima: il × porta a uno stato di conferma nell'indirizzo,
                          non esegue. Stessa idea dell'anteprima dell'ordine —
                          finché non confermi, non succede niente. */}
                      {sp.rimuovi === vp.prodottoId ? (
                        <>
                          <form action={rimuoviProdottoDaCollezione.bind(null, id, vp.prodottoId)}>
                            <button className="btn btn-secondario" type="submit" style={{ fontSize: 12, padding: "3px 10px" }}>
                              Sì, togli
                            </button>
                          </form>
                          <a className="icon-btn" href={`/visual/${id}`} title="Annulla">↩</a>
                        </>
                      ) : (
                        <>
                          <form action={spostaInCollezione.bind(null, id, vp.prodottoId, "su")}>
                            <button className="icon-btn" title="Sposta su" type="submit" disabled={i === 0}>↑</button>
                          </form>
                          <form action={spostaInCollezione.bind(null, id, vp.prodottoId, "giu")}>
                            <button className="icon-btn" title="Sposta giù" type="submit" disabled={i === righe.length - 1}>↓</button>
                          </form>
                          {manuale && (
                            <a
                              className="icon-btn"
                              href={`/visual/${id}?rimuovi=${vp.prodottoId}`}
                              title="Togli dalla collezione (sul negozio)"
                            >
                              ×
                            </a>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {restano > 0 && (
                <p className="page-sub" style={{ marginTop: 12 }}>
                  Mostrati i primi {MAX_RIGHE}; altri {restano} prodotti non sono in elenco ma l'ordine inviato a
                  Shopify li comprende tutti.
                </p>
              )}
            </>
          )}
        </div>

        {/* **I fuori scena si vedono, non si nascondono.** Sapere che una
            collezione si porta dietro 182 prodotti archiviati è
            un'informazione: nascondendoli sembrerebbe che non ci siano, e non
            si capirebbe perché il negozio ne dichiara molti di più. Stanno
            fuori dalla fila, non fuori dalla vista. */}
        {fuoriScena > 0 && (
          <div className="scheda">
            <div className="scheda-titolo">Non in vendita sul negozio ({fuoriScena})</div>
            <p className="page-sub" style={{ marginTop: -4, marginBottom: 12 }}>
              Sono nella collezione su Shopify ma il cliente non li vede: <b>non entrano nell&apos;ordine</b> e non
              vengono mandati al negozio. Per rimetterli in vetrina si riattivano <b>su Shopify</b>, non da qui.
            </p>
            <div className="vetrina-lista">
              {c.prodotti
                .filter((vp) => !inScena.includes(vp))
                .slice(0, 40)
                .map((vp) => (
                  <div className="vetrina-riga" key={vp.id} style={{ opacity: 0.65 }}>
                    <span className="vetrina-pos">—</span>
                    <span className="vetrina-mini">
                      {vp.prodotto.immagine ? <img src={vp.prodotto.immagine} alt="" /> : "❀"}
                    </span>
                    <span className="vetrina-info">
                      <a href={`/prodotti/${vp.prodottoId}`} className="cella-nome">{vp.prodotto.nome}</a>
                      <div className="cella-sub">
                        <StatoNegozio stato={vp.prodotto.statoShopify} />
                        {" "}{vp.prodotto.codice}
                      </div>
                    </span>
                  </div>
                ))}
            </div>
            {fuoriScena > 40 && (
              <p className="page-sub" style={{ marginTop: 12 }}>
                Mostrati i primi 40 di {fuoriScena}.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Lo stato del prodotto **sul negozio**, letto a ogni import. Si scrive accanto
 * al codice perché è la prima cosa da sapere guardando una fila: un prodotto
 * archiviato in vetrina non ci va, per quanto qui risulti «in vendita».
 * `null` = non lo sappiamo (mai visto su un negozio), e si dice invece di
 * inventare «attivo».
 */
function StatoNegozio({ stato }: { stato: string | null }) {
  const m: Record<string, { testo: string; colore: string }> = {
    ACTIVE: { testo: "Attivo", colore: "var(--green)" },
    DRAFT: { testo: "Bozza", colore: "var(--orange)" },
    ARCHIVED: { testo: "Archiviato", colore: "var(--text-tertiary)" },
  };
  const v = stato ? m[stato] : null;
  const testo = v?.testo ?? "Stato ignoto";
  const colore = v?.colore ?? "var(--text-tertiary)";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.2,
        textTransform: "uppercase",
        color: colore,
        background: `color-mix(in srgb, ${colore} 12%, transparent)`,
        padding: "1px 6px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {testo}
    </span>
  );
}

/**
 * «Salva questo ordine come regola»: prende le metriche che si stanno guardando
 * — quelle in anteprima, o quelle già applicate alla collezione — e le porta
 * dentro una regola nuova, che poi si finisce di scrivere sulla sua scheda
 * (dove ci sono i passi per attributo: categoria, prezzo, tag…).
 *
 * Le metriche viaggiano in campi nascosti `regola`, la **stessa convenzione**
 * del selettore rapido: così la lettura lato server è una sola (`regoleDaForm`).
 */
function CreaRegolaDaQui({ id, regole }: { id: string; regole: RegolaOrdinamento[] }) {
  return (
    <form
      action={creaRegolaDaCollezione.bind(null, id)}
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}
    >
      {regole.map((r) => (
        <input key={r} type="hidden" name="regola" value={r} />
      ))}
      <input name="nome" placeholder="Nome della regola (es. Vetrina di Natale)" required style={{ minWidth: 280 }} />
      <button type="submit" className="btn btn-secondario">Salva quest&apos;ordine come regola</button>
      <span className="page-sub" style={{ margin: 0 }}>
        {regole.length > 0 ? (
          <>Parte da <b>{etichettaRegola(regole.join(","))}</b>, poi ci aggiungi i passi per categoria, prezzo o tag.</>
        ) : (
          <>Nessuna metrica scelta: la regola nasce vuota e <b>non tocca l&apos;ordine di adesso</b>.</>
        )}
      </span>
    </form>
  );
}
