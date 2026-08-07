import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { etichettaRegola, FILTRO_IN_SCENA, isRegola, ordinaPerPassi, ordinaProdotti, parseRegole, type RegolaOrdinamento } from "@/lib/ordinamento-vetrina";
import { SelettoreRegole } from "@/components/SelettoreRegole";
import { CostruttorePassi } from "@/components/CostruttorePassi";
import { FilaProdotti, StatoNegozio } from "@/components/FilaProdotti";
import { vociPassi } from "@/lib/voci-passi";
import { linkAdmin } from "@/lib/link-shopify";
import { etichettaOrdinamentoShopify, ordineAMano } from "@/lib/collezioni";
import { REGOLE } from "@/lib/ordinamento-vetrina";
import { corrisponde, etichettaPassi, filtroSuggerimenti, parsePassi } from "@/lib/regole-ordine";
import {
  applicaRegolaSalvataAzione,
  creaRegolaDaCollezione,
  estendiRegolaAllaCollezione,
  impostaAggiuntaAutomatica,
} from "@/lib/azioni-regole-ordine";
import { iscriviCollezioneARotazione } from "@/lib/azioni-rotazione";
import { etichettaFrequenza, etichettaModo, prossimaVolta } from "@/lib/rotazione";
import { salvaProdottiPerRiga } from "@/lib/azioni-collezioni-shopify";
import {
  applicaRegolaOrdinamento,
  spostaInCollezione,
  spingiOrdineSuShopify,
  rimuoviProdottoDaCollezione,
  aggiungiProdottiACollezione,
} from "@/lib/azioni-vetrina-shopify";

export const dynamic = "force-dynamic";

const MAX_RIGHE = 300;
const NOMI_METRICHE = Object.fromEntries(REGOLE.map((r) => [r.chiave, r.nome]));
const MAX_ANTEPRIMA = 60;
// Il campione di catalogo su cui il costruttore delle condizioni fa i conti nel
// browser: mandarne quattromila per un numero che cambia a ogni spunta non vale
// il peso della pagina. Il taglio e' dichiarato a schermo.
const MAX_CATALOGO = 900;

export default async function CurazioneCollezionePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    esito?: string;
    messaggio?: string;
    regola?: string | string[];
    vista?: string;
    modo?: string;
    aggiungi?: string;
    cerca?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const c = await prisma.collezioneShopify.findUnique({
    where: { id },
    include: {
      tipologia: { select: { nome: true, regolaOrdinamento: true } },
      regolaOrdine: { select: { id: true, nome: true, passi: true } },
      rotazione: {
        select: { id: true, nome: true, frequenza: true, modo: true, passo: true, attiva: true, spingiSuShopify: true, ultimaEsecuzioneIl: true },
      },
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
              // Servono all'anteprima della cella, che gira nel browser.
              categoria: true,
              tipoShopify: true,
              vendorShopify: true,
              lineaId: true,
              tagShopify: true,
              ggDispMin: true,
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
  const [negozio, regoleSalvate, rotazioni] = await Promise.all([
    prisma.negozioShopify.findFirst({
      where: { nome: c.negozio },
      select: { permessi: true, attivo: true, dominio: true },
    }),
    prisma.regolaOrdine.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.regolaRotazione.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, frequenza: true, modo: true, attiva: true },
    }),
  ]);
  // I valori per le condizioni si leggono **solo se serve**: senza una regola
  // salvata assegnata il costruttore non si mostra, e sarebbero query a vuoto.
  const voci = c.regolaOrdineId ? await vociPassi() : null;

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
  // **Due cose diverse, e per un pezzo erano una sola.** `tipo` dice **chi
  // entra** nella collezione (a mano o per regola); `ordinamento` dice **in che
  // ordine** si presentano sul negozio. Una smart collection con sortOrder
  // MANUAL si riordina benissimo — sono 212 su 343, e prima le rifiutavamo tutte.
  const membriAMano = c.tipo === "manuale";
  const filaAMano = ordineAMano(c.ordinamento);
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

  // — Prodotti da aggiungere —
  // Il pannello si apre da un parametro, così resta aperto anche dopo una
  // ricerca. I **suggerimenti** sono i prodotti che la regola porterebbe in cima
  // e che in collezione non ci sono ancora: è l'unico elenco che risponde a
  // «cosa ci manca» invece di mostrare tutto il catalogo.
  const aGriglia = sp.vista === "griglia";
  // **Un riquadro, due modi.** Di default si apre quello in uso: se la
  // collezione ha una regola con condizioni si mostra quella, altrimenti
  // l'opzione rapida. Erano due schede alte una sotto l'altra, e l'ordine dei
  // prodotti finiva sotto la piega.
  const modoCondizioni = sp.modo ? sp.modo === "condizioni" : c.regolaOrdineId != null;
  // **Le condizioni si scrivono sul catalogo, non sulla collezione.** Il
  // costruttore mostra i valori disponibili e quanti prodotti prenderebbero: se
  // il conto lo si fa sui prodotti già dentro, con una collezione da cinque si
  // vedono cinque tag e sembra che non ci sia niente da scegliere — segnalato
  // dall'utente («ma io non ho ancora scelto nulla»). Il catalogo è il
  // vocabolario; quanti ne tocca *qui dentro* è il secondo numero, accanto.
  const [perAnteprima, totaleInVendita] =
    modoCondizioni && c.regolaOrdine
      ? await Promise.all([
          prisma.prodotto.findMany({
            where: FILTRO_IN_SCENA,
            take: MAX_CATALOGO,
            orderBy: { nome: "asc" },
            select: {
              id: true, nome: true, immagine: true, prezzoVendita: true, categoria: true,
              tipoShopify: true, vendorShopify: true, lineaId: true, tagShopify: true, ggDispMin: true,
              // Servono alle metriche della fila (margine, novita'): senza, l'ordine
              // vero non si potrebbe calcolare.
              costoProduzione: true, creatoIl: true,
            },
          }),
          prisma.prodotto.count({ where: FILTRO_IN_SCENA }),
        ])
      : [[], 0];

  // **L'anteprima e' della collezione, non del catalogo.** Qui la domanda e'
  // «come uscira' *questa* vetrina», e la risposta si legge sui prodotti che ci
  // sono davvero: la fila calcolata sul campione del catalogo rispondeva a
  // un'altra domanda — cosa prenderebbe la regola in giro per il negozio — utile
  // per l'aggiunta automatica, non per guardare la vetrina.
  //
  // Con l'aggiunta automatica accesa si contano anche **quelli che entrerebbero**:
  // fra un attimo saranno dentro, mostrarla senza di loro vorrebbe dire far
  // vedere una vetrina che non esistera' mai.
  const passiSalvati = c.regolaOrdine ? parsePassi(c.regolaOrdine.passi) : [];
  const idsDentro = new Set(inScena.map((vp) => vp.prodottoId));
  const entranti =
    c.aggiuntaAutomatica && passiSalvati.length > 0
      ? perAnteprima.filter((p) => !idsDentro.has(p.id) && passiSalvati.some((x) => x.t !== "metrica" && corrisponde(p, x)))
      : [];
  const filaRegola =
    passiSalvati.length > 0
      ? await ordinaPerPassi(
          [
            ...inScena.map((vp) => ({ ...vp.prodotto, id: vp.prodottoId, prodottoId: vp.prodottoId, posizione: vp.posizione })),
            ...entranti.map((p) => ({ ...p, prodottoId: p.id, costoProduzione: 0, creatoIl: new Date() })),
          ],
          passiSalvati,
        )
      : [];


  const pannelloAperto = sp.aggiungi === "1";
  const cerca = (sp.cerca ?? "").trim();
  const filtroRegola = c.regolaOrdine ? filtroSuggerimenti(parsePassi(c.regolaOrdine.passi)) : null;
  const candidati = pannelloAperto
    ? await prisma.prodotto.findMany({
        where: {
          id: { notIn: c.prodotti.map((vp) => vp.prodottoId) },
          ...FILTRO_IN_SCENA,
          ...(cerca
            ? {
                OR: [
                  { nome: { contains: cerca, mode: "insensitive" as const } },
                  { codice: { contains: cerca, mode: "insensitive" as const } },
                ],
              }
            : (filtroRegola ?? {})),
        },
        orderBy: { nome: "asc" },
        take: 60,
        select: { id: true, nome: true, codice: true, immagine: true, prezzoVendita: true, tipoShopify: true },
      })
    : [];
  const suffisso = aGriglia ? "&vista=griglia" : "";

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 920 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">
              {c.negozio} · {c.tipo === "automatica" ? "chi entra: per regola" : "chi entra: a mano"} ·{" "}
              ordine sul negozio: {etichettaOrdinamentoShopify(c.ordinamento)}
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
          <div className="riga-azione">
            {/* **Modificare dentro l'app**: titolo, descrizione e SEO si
                correggono nella scheda della collezione, e da qui non ci si
                arrivava. Il bottone del negozio resta per i campi che Shopify
                possiede e che qui non si toccano. */}
            <a className="btn btn-secondario" href={`/collezioni/shopify/${id}`}>
              Modifica nell&apos;app
            </a>
            {linkAdmin(negozio?.dominio, c.shopifyId, "collezione") && (
              <a
                className="btn btn-secondario"
                href={linkAdmin(negozio?.dominio, c.shopifyId, "collezione")!}
                target="_blank"
                rel="noreferrer"
              >
                Modifica su Shopify ↗
              </a>
            )}
            {linkNegozio && (
              <a className="btn btn-secondario" href={linkNegozio} target="_blank" rel="noreferrer">
                Vedi online ↗
              </a>
            )}
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {/* **Un riquadro solo, con due modi.** Erano due schede alte una sotto
            l'altra per una scelta sola, e l'ordine dei prodotti finiva sotto la
            piega. Sono alternative — sceglierne una **stacca** l'altra — quindi
            si mostra quella in uso e l'altra si raggiunge con un clic. */}
        <div className="scheda" id="regola">
          <div className="riga-titolo">
            <div className="scheda-titolo" style={{ margin: 0 }}>Come si ordina questa vetrina</div>
            <div className="riga-azione">
              <a
                className="btn btn-secondario"
                href={`/visual/${id}?modo=rapido${aGriglia ? "&vista=griglia" : ""}#regola`}
                aria-current={modoCondizioni ? undefined : "true"}
              >
                Opzione rapida
              </a>
              <a
                className="btn btn-secondario"
                href={`/visual/${id}?modo=condizioni${aGriglia ? "&vista=griglia" : ""}#regola`}
                aria-current={modoCondizioni ? "true" : undefined}
              >
                Condizioni
              </a>
            </div>
          </div>

          {!modoCondizioni && (
            <>
              <p className="page-sub" style={{ marginTop: -4 }}>
                Mette in fila <b>tutti</b> i prodotti secondo un numero — venduto, margine, prezzo, novità. Per
                ragionare per <b>categoria, prezzo, tag o tempi di consegna</b> passa a <b>Condizioni</b>.
              </p>
              <form method="get" style={{ display: "grid", gap: 10, maxWidth: 420 }}>
                {aGriglia && <input type="hidden" name="vista" value="griglia" />}
                <SelettoreRegole valore={inAnteprima ? regoleAnteprima.join(",") : c.regolaOrdinamento} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-secondario">Vedi come verrebbe</button>
                </div>
              </form>
              <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                Guardare non cambia niente: l&apos;ordine si scrive solo quando confermi.
              </p>
            </>
          )}

          {modoCondizioni && (
          <>
          <p className="page-sub" style={{ marginTop: -4 }}>
            Una regola è una <b>sequenza di passi in priorità</b>. Un passo è una <b>cella</b>: le condizioni scelte
            insieme valgono <b>tutte</b> — «Fiori <i>e</i> urgenti» — e <b>portano in cima chi corrisponde</b> senza
            togliere nessuno dalla fila.
          </p>
          {regoleSalvate.length === 0 ? (
            <p className="page-sub" style={{ marginTop: 0 }}>
              <b>Non c&apos;è ancora nessuna regola.</b> Dagliene un nome qui sotto: nasce, viene applicata a questa
              collezione, e <b>subito sotto compaiono le condizioni</b> da impostare.
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
          {!c.regolaOrdine && (
            <CreaRegolaDaQui id={id} regole={inAnteprima ? regoleAnteprima : parseRegole(c.regolaOrdinamento)} />
          )}
          </>
          )}
        </div>

        {/* **Le condizioni si scrivono davanti alla fila che devono cambiare.**
            È lo stesso costruttore della pagina della regola — non una copia —
            e ogni modifica riapplica subito la regola a *questa* collezione, così
            si vede l'effetto invece di doverlo immaginare. */}
        {modoCondizioni && c.regolaOrdine && voci && (
          <div className="scheda">
            <div className="riga-titolo">
              <div className="scheda-titolo" style={{ margin: 0 }}>Condizioni di «{c.regolaOrdine.nome}»</div>
              <form action={estendiRegolaAllaCollezione.bind(null, id)}>
                <button type="submit" className="btn btn-secondario" title="Riordina tutta la collezione con questa regola: chi la regola non prende va dietro, dal più venduto in giù.">
                  Estendi alla collezione
                </button>
              </form>
              <a className="btn btn-secondario" href={`/visual/regole/${c.regolaOrdine.id}`}>
                Scheda della regola
              </a>
            </div>
            <p className="page-sub" style={{ marginTop: -4 }}>
              Ogni modifica si applica <b>subito qui</b>; le <b>altre</b> collezioni che usano questa regola si rifanno
              con «Riapplica» dalla scheda della regola. Con <b>Estendi alla collezione</b> si riordinano anche i
              prodotti che <b>nessun passo prende</b>: vanno dietro, <b>dal più venduto in giù</b>.
            </p>
            {/* **La regola porta dentro i prodotti, non solo li ordina.** Spento di
                default: far entrare prodotti in una vetrina e' una decisione, non
                un effetto collaterale dell'ordinamento. */}
            <form action={impostaAggiuntaAutomatica.bind(null, id)} className="interruttore-regola">
              <input type="hidden" name="aggiuntaAutomatica" value={c.aggiuntaAutomatica ? "0" : "1"} />
              <span>
                <b>Aggiungi automaticamente prodotti alla collezione</b>
                <div className="cella-sub">
                  {c.aggiuntaAutomatica ? (
                    <>
                      Acceso: i prodotti che le condizioni prendono <b>entrano</b> nella collezione — su Shopify e qui —
                      ogni volta che la regola si applica. Quelli messi da una persona restano, segnati{" "}
                      <b>«Prodotto manuale»</b>. Nessuno esce mai da solo.
                    </>
                  ) : (
                    <>
                      Spento: la regola <b>ordina soltanto</b> chi è già dentro. Accendendolo, i prodotti che le
                      condizioni prendono entrano anche nella collezione.
                    </>
                  )}
                </div>
              </span>
              <button type="submit" className={c.aggiuntaAutomatica ? "btn btn-secondario" : "btn btn-primario"}>
                {c.aggiuntaAutomatica ? "Spegni" : "Accendi"}
              </button>
            </form>

            <CostruttorePassi
              regolaId={c.regolaOrdine.id}
              passi={parsePassi(c.regolaOrdine.passi)}
              voci={voci}
              tornaA={id}
              perAnteprima={perAnteprima}
              suCosa={`in vendita su ${totaleInVendita}`}
              campione={perAnteprima.length < totaleInVendita}
              fila={filaRegola}
              quantiEntrano={entranti.length}
              suChe={`«${c.titolo}»`}
              idsCollezione={inScena.map((vp) => vp.prodottoId)}
              nomeCollezione={c.titolo}
            />
          </div>
        )}

        {/* **Si rinfresca da sola.** Una vetrina ferma smette di essere guardata:
            qui si dice ogni quanto l'ordine si rifà senza che nessuno lo chieda.
            Il ritmo si decide una volta in /visual/rotazioni e vale per tutte le
            collezioni iscritte — qui si sceglie solo se questa è fra quelle. */}
        <div className="scheda">
          <div className="riga-titolo">
            <div className="scheda-titolo" style={{ margin: 0 }}>Si rinfresca da sola</div>
            <a className="btn btn-secondario" href="/visual/rotazioni">Ritmi e storico</a>
          </div>
          {rotazioni.length === 0 ? (
            <p className="page-sub" style={{ marginTop: -4, marginBottom: 0 }}>
              Nessun ritmo impostato. Si crea in <a href="/visual/rotazioni">Rotazioni</a>: si sceglie ogni quanto
              (giorno, settimana, mese) e cosa fa — <b>rinfrescare</b> l&apos;ordine coi dati aggiornati, o{" "}
              <b>ruotare</b> i primi in fondo perché tocchi a tutti.
            </p>
          ) : (
            <>
              <p className="page-sub" style={{ marginTop: -4 }}>
                Una vetrina ferma smette di essere guardata. Iscrivendola, l&apos;ordine si rifà da solo al ritmo
                scelto — <b>adesso non cambia niente</b>: vale da qui in avanti.
              </p>
              <form
                action={iscriviCollezioneARotazione.bind(null, id)}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <select name="rotazioneId" defaultValue={c.rotazioneId ?? ""} style={{ minWidth: 260 }}>
                  <option value="">— non si rinfresca da sola —</option>
                  {rotazioni.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome} · {etichettaFrequenza(r.frequenza)} · {etichettaModo(r.modo)}
                      {r.attiva ? "" : " (in pausa)"}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primario">Salva il ritmo</button>
              </form>
              {c.rotazione && (
                <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                  Adesso segue <b>{c.rotazione.nome}</b>: {etichettaFrequenza(c.rotazione.frequenza).toLowerCase()},{" "}
                  {etichettaModo(c.rotazione.modo).toLowerCase()}
                  {c.rotazione.modo === "ruota" ? ` di ${c.rotazione.passo}` : ""}.{" "}
                  {c.rotazione.attiva ? (
                    <>
                      Prossimo giro{" "}
                      <b>{(prossimaVolta(c.rotazione)?.toLocaleDateString("it-IT") ?? "—")}</b>.
                    </>
                  ) : (
                    <b>La regola è in pausa: non scatterà.</b>
                  )}{" "}
                  {c.rotazione.spingiSuShopify ? (
                    <>L&apos;ordine rifatto viene <b>mandato anche a Shopify</b>.</>
                  ) : (
                    <>L&apos;ordine si rifà <b>solo qui</b>: su Shopify ci va quando lo mandi tu.</>
                  )}
                </p>
              )}
            </>
          )}
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
          {!filaAMano && (
            <p className="page-sub" style={{ marginTop: 0, color: "var(--orange)" }}>
              Sul negozio questa collezione si ordina <b>{etichettaOrdinamentoShopify(c.ordinamento)}</b>. Inviando la
              fila curata qui, l&apos;ordine passa a <b>manuale</b>: da quel momento <b>non si risistema più da sola</b>.
              {c.tipo === "automatica" && " Chi ci sta dentro continua a deciderlo la regola: quella non si tocca."}
            </p>
          )}
          {!puoScrivere && (
            <p className="page-sub" style={{ marginTop: 0, color: "var(--orange)" }}>
              Per inviare l'ordine serve un token con <b>write_products</b> collegato al negozio «{c.negozio}»: si
              imposta in <a href="/impostazioni">Negozi &amp; permessi</a>.
            </p>
          )}
          <form action={spingiOrdineSuShopify.bind(null, id)}>
            <button type="submit" className="btn" disabled={!puoScrivere}>
              Invia l'ordine a Shopify
            </button>
          </form>
        </div>

        {/* **Quanti prodotti per riga.** Su Shopify non esiste un campo per la
            disposizione: la decide il tema. Si scrive come metafield
            `custom.prodotti_per_riga`, che e' l'unico posto per-collezione dove
            il valore puo' stare — e vale **solo se il tema lo legge**. Detto in
            pagina, perche' promettere un effetto che dipende dal tema sarebbe
            una bugia. */}
        <div className="scheda">
          <div className="scheda-titolo">Prodotti per riga</div>
          <form
            action={salvaProdottiPerRiga.bind(null, id)}
            style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
          >
            <select name="prodottiPerRiga" defaultValue={c.prodottiPerRiga?.toString() ?? ""} aria-label="Prodotti per riga">
              <option value="">— non impostato —</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n} per riga</option>
              ))}
            </select>
            <button type="submit" className="btn btn-primario">Salva e manda al negozio</button>
          </form>
          <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Si scrive nel metafield <code>custom.prodotti_per_riga</code> della collezione.{" "}
            {c.prodottiPerRigaSpintoIl ? (
              <>Mandato al negozio il {c.prodottiPerRigaSpintoIl.toLocaleDateString("it-IT")}.</>
            ) : (
              <>Non e' ancora stato mandato.</>
            )}{" "}
            <b>Cambia la pagina solo se il tema legge quel metafield</b>: Shopify non ha un campo suo per la
            disposizione, e il valore da solo non sposta niente.
          </p>
        </div>
        {/* **Il pannello per aggiungere prodotti.** Si sceglie guardando le
            immagini, perché è così che si costruisce una vetrina; e la prima
            cosa che propone non è il catalogo intero ma quello che **le
            condizioni della regola** porterebbero in cima e qui non c'è. */}
        {pannelloAperto && (
          <div className="scheda" style={{ borderColor: "var(--gold)" }}>
            <div className="riga-titolo">
              <div className="scheda-titolo" style={{ margin: 0 }}>Aggiungi prodotti alla collezione</div>
              <a className="btn btn-secondario" href={`/visual/${id}${aGriglia ? "?vista=griglia" : ""}`}>Chiudi</a>
            </div>
            <p className="page-sub">
              {cerca ? (
                <>Risultati per «<b>{cerca}</b>».</>
              ) : filtroRegola ? (
                <>
                  <b>Suggeriti dalle condizioni di «{c.regolaOrdine!.nome}»</b>: i prodotti che la regola porterebbe in
                  cima e che qui non ci sono ancora. Le condizioni valgono <b>in alternativa</b> — basta che ne
                  soddisfino una.
                </>
              ) : (
                <>
                  Nessun suggerimento: questa collezione non ha una regola con condizioni, quindi non c&apos;è un
                  criterio per proporre cosa manca. Cerca per nome o codice qui sotto.
                </>
              )}{" "}
              Entrano <b>in fondo</b> alla fila e vengono aggiunti <b>sul negozio</b>.
            </p>
            <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <input type="hidden" name="aggiungi" value="1" />
              {aGriglia && <input type="hidden" name="vista" value="griglia" />}
              <input type="search" name="cerca" defaultValue={cerca} placeholder="Cerca per nome o codice…" style={{ minWidth: 280 }} />
              <button type="submit" className="btn btn-secondario">Cerca</button>
              {cerca && (
                <a className="btn btn-secondario" href={`/visual/${id}?aggiungi=1${suffisso}`}>Torna ai suggerimenti</a>
              )}
            </form>
            {candidati.length === 0 ? (
              <div className="vuoto-mini">
                {cerca
                  ? `Nessun prodotto in vendita risponde a «${cerca}» fuori da questa collezione.`
                  : "Nessun prodotto da proporre."}
              </div>
            ) : (
              <form action={aggiungiProdottiACollezione.bind(null, id)}>
                <div className="griglia-scelta">
                  {candidati.map((p) => (
                    <label className="card-scelta" key={p.id}>
                      <span className="foto">{p.immagine ? <img src={p.immagine} alt="" /> : "❀"}</span>
                      <span style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <input type="checkbox" name="aggiungi" value={p.id} style={{ marginTop: 2 }} />
                        <span style={{ minWidth: 0 }}>
                          <span className="cella-nome" style={{ fontSize: 12.5 }}>{p.nome}</span>
                          <span className="cella-sub" style={{ display: "block" }}>
                            {p.tipoShopify ?? "—"}
                            {p.prezzoVendita > 0 ? ` · ${euro(p.prezzoVendita)}` : ""}
                          </span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                  <button type="submit" className="btn btn-primario">Aggiungi i selezionati</button>
                  <span className="page-sub" style={{ margin: 0 }}>
                    Mostrati i primi {candidati.length}: se non trovi quello che cerchi, restringi con la ricerca.
                  </span>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="scheda">
          <div className="riga-titolo">
            <div className="scheda-titolo" style={{ margin: 0 }}>Sequenza dei prodotti</div>
            <div className="riga-azione">
              {/* Elenco o griglia: la stessa fila, le stesse azioni. Una vetrina
                  si giudica guardandola, non leggendo sessanta nomi in colonna. */}
              <a className="btn btn-secondario" href={`/visual/${id}`} aria-current={aGriglia ? undefined : "true"}>
                Elenco
              </a>
              <a className="btn btn-secondario" href={`/visual/${id}?vista=griglia`} aria-current={aGriglia ? "true" : undefined}>
                Griglia
              </a>
              {membriAMano && (
                <a className="btn btn-primario" href={`/visual/${id}?aggiungi=1${suffisso}`}>+ Aggiungi prodotti</a>
              )}
            </div>
          </div>
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
              <FilaProdotti collezioneId={id} righe={righe} segnaManuali={c.aggiuntaAutomatica} membriAMano={membriAMano} totale={inScena.length} vista={aGriglia ? "griglia" : "elenco"} />
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
 * «Crea la regola e imposta le condizioni»: prende le metriche che si stanno
 * guardando — quelle in anteprima, o quelle già applicate alla collezione — e le
 * porta dentro una regola nuova, che poi si finisce di scrivere qui sotto, con
 * le condizioni per categoria, prezzo, tag e tempi di consegna.
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
      <input name="nome" placeholder="Nome della regola (es. Vetrina di Natale)" required style={{ minWidth: 300 }} />
      <button type="submit" className="btn btn-primario">Crea la regola e imposta le condizioni</button>
      <span className="page-sub" style={{ margin: 0 }}>
        {regole.length > 0 ? (
          <>
            Parte da <b>{etichettaRegola(regole.join(","))}</b> — la metrica scelta qui sopra — e poi ci aggiungi le
            condizioni.
          </>
        ) : (
          <>Nasce senza passi e <b>non tocca l&apos;ordine di adesso</b>: le condizioni si aggiungono subito dopo.</>
        )}
      </span>
    </form>
  );
}
