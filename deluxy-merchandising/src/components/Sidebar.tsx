import { prisma } from "@/lib/db";
import { brandCorrente } from "@/lib/brand";
import { COLORE_STATO_COLLEZIONE, etichettaStagione } from "@/lib/dominio";
import { elencoFasce } from "@/lib/fasce";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

// Sidebar di navigazione, organizzata per mestiere invece che in un elenco
// unico: prima si guarda come va (Vendite), poi si lavora sul prodotto
// (Prodotto), poi lo si mette in scena (Vetrina & canale). Le voci sono le
// stesse di prima: cambia che si trovano.
//
// I contatori seguono l'ambito scelto in alto: in un brand contano i prodotti
// **venduti su quel brand**, non tutto il catalogo — altrimenti il menu
// racconterebbe una storia diversa dalle pagine.
export async function Sidebar({
  attiva,
  collezioneAttiva,
}: {
  attiva?:
    | "cruscotto"
    | "collezioni"
    | "prodotti"
    | "anagrafica"
    | "fornitori"
    | "categorie"
    | "linee"
    | "fasce"
    | "griglie"
    | "multi-prodotto"
    | "classificazione"
    | "sviluppo"
    | "costi"
    | "vendite"
    | "classifiche"
    | "assortimento"
    | "riordini"
    | "trend-ai"
    | "visual"
    | "shopify"
    | "impostazioni";
  collezioneAttiva?: string;
}) {
  const brand = await brandCorrente();

  // **Un giro solo per tutti i contatori.** Erano nove query separate: la barra
  // sta in ogni pagina, quindi quel costo si pagava ovunque, e con poche
  // connessioni disponibili le query si mettevano in fila l'una dietro l'altra
  // (misurato: 4,7 s contro 0,3 s). I numeri sono identici a prima — verificato
  // confrontando le due versioni su globale e su un brand.
  //
  // Il filtro d'ambito è lo stesso di `filtroProdotti`: «prodotti venduti su
  // quel canale», qui scritto come EXISTS sul venduto.
  const [conti, collezioni, nFasce] = await Promise.all([
    prisma.$queryRaw<
      {
        collezioniMaison: number;
        collezioniShopify: number;
        prodotti: number;
        inSviluppo: number;
        daPubblicare: number;
        fornitori: number;
        tipi: number;
        linee: number;
        composti: number;
      }[]
    >`
      WITH pr AS (
        SELECT prod.id, prod.fase, prod."shopifyStato", prod."vendorShopify", prod."tipoShopify"
        FROM "merchandising"."Prodotto" prod
        WHERE (${brand}::text IS NULL OR EXISTS (
          SELECT 1 FROM "merchandising"."Vendita" v
          WHERE v."prodottoId" = prod.id AND v.canale = ${brand}::text))
      )
      SELECT
        (SELECT count(*) FROM "merchandising"."Collezione")::int AS "collezioniMaison",
        (SELECT count(*) FROM "merchandising"."CollezioneShopify")::int AS "collezioniShopify",
        (SELECT count(*) FROM pr)::int AS "prodotti",
        (SELECT count(*) FROM pr WHERE fase IN ('concept','prototipo','approvato'))::int AS "inSviluppo",
        (SELECT count(*) FROM pr WHERE "shopifyStato" <> 'pubblicato' AND fase <> 'archiviato')::int AS "daPubblicare",
        (SELECT count(DISTINCT "vendorShopify") FROM pr WHERE "vendorShopify" IS NOT NULL)::int AS "fornitori",
        (SELECT count(DISTINCT "tipoShopify") FROM pr WHERE "tipoShopify" IS NOT NULL)::int AS "tipi",
        (SELECT count(*) FROM "merchandising"."LineaProdotto" WHERE attiva)::int AS "linee",
        (SELECT count(*) FROM "merchandising"."Prodotto" x WHERE EXISTS (
          SELECT 1 FROM "merchandising"."ComponenteProdotto" cp WHERE cp."compostoId" = x.id))::int AS "composti"`,
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { creataIl: "desc" }],
      include: { _count: { select: { prodotti: true } } },
    }),
    // elencoFasce() e non un count: alla primissima apertura scrive le fasce di
    // partenza, così il menu non mostra «0» su un listino che esiste.
    elencoFasce().then((f) => f.length),
  ]);

  const conta = conti[0];
  const nCollezioniMaison = conta?.collezioniMaison ?? 0;
  const nCollezioniShopify = conta?.collezioniShopify ?? 0;
  const nProdotti = conta?.prodotti ?? 0;
  const nInSviluppo = conta?.inSviluppo ?? 0;
  const daPubblicare = conta?.daPubblicare ?? 0;
  // Il contatore conta le voci **esistenti**: i prodotti senza fornitore non
  // diventano un fornitore in più.
  const nFornitori = conta?.fornitori ?? 0;
  const nTipi = conta?.tipi ?? 0;
  const nLinee = conta?.linee ?? 0;
  const nComposti = conta?.composti ?? 0;

  const voce = (
    id: NonNullable<typeof attiva>,
    href: string,
    icona: string,
    nome: string,
    count?: number
  ) => (
    <a className={`sb-item${attiva === id ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && <span className="sb-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <nav>
        <SbSezione titolo="Panoramica">
          {voce("cruscotto", "/", "home", "Cruscotto")}
        </SbSezione>

        <SbSezione titolo="Vendite">
          {voce("vendite", "/vendite", "vendite", "Andamento & trend")}
          {voce("classifiche", "/classifiche", "classifiche", "Classifiche")}
          {voce("assortimento", "/assortimento", "collezioni", "Categorie & collezioni")}
          {voce("trend-ai", "/trend-ai", "ai", "Lettura AI")}
        </SbSezione>

        <SbSezione titolo="Prodotto">
          {voce("collezioni", "/collezioni", "collezioni", "Collezioni", nCollezioniMaison + nCollezioniShopify)}
          {voce("prodotti", "/prodotti", "prodotti", "Prodotti", nProdotti)}
          {/* I composti sono prodotti a tutti gli effetti: stanno subito sotto
              i prodotti, non in una sezione a parte. */}
          {voce("multi-prodotto", "/multi-prodotto", "prodotti", "Multi prodotto", nComposti || undefined)}
          {voce("anagrafica", "/anagrafica", "anagrafica", "Anagrafica completa")}
          {voce("sviluppo", "/sviluppo", "sviluppo", "Sviluppo", nInSviluppo)}
          {voce("costi", "/costi", "costi", "Costi & margini")}
        </SbSezione>

        {/* Il catalogo visto per insieme (fornitore, categoria, linea, fascia) e
            le griglie che incrociano due lenti: è lo stesso mestiere. In fondo la
            pagina dove quelle lenti si impostano. */}
        <SbSezione titolo="Il catalogo per insieme">
          {voce("fornitori", "/fornitori", "prodotti", "Per fornitore", nFornitori)}
          {voce("categorie", "/categorie", "collezioni", "Per categoria", nTipi)}
          {voce("linee", "/linee", "collezioni", "Per linea", nLinee)}
          {voce("fasce", "/fasce", "costi", "Per fascia di prezzo", nFasce)}
          {voce("griglie", "/griglie", "classifiche", "Griglie")}
          {voce("classificazione", "/classificazione", "impostazioni", "Imposta categorie e linee")}
        </SbSezione>

        {/* La vetrina è il visual merchandising e basta. Shopify e i negozi
            sono configurazione: stanno in Impostazioni. L'ipotesi di
            ordinativo non è più una voce di menu: si apre da Visual
            merchandising, dove si decide cosa mettere in scena. */}
        <SbSezione titolo="Vetrina">
          {voce("visual", "/visual", "visual", "Visual merchandising")}
        </SbSezione>

        <SbSezione titolo="Impostazioni">
          {voce("shopify", "/shopify", "shopify", "Shopify", daPubblicare || undefined)}
          {voce("impostazioni", "/impostazioni", "impostazioni", "Negozi & permessi")}
        </SbSezione>

        <SbSezione titolo="Collezioni">
          {collezioni.map((c) => (
            <a
              key={c.id}
              className={`sb-item${collezioneAttiva === c.id ? " attiva" : ""}`}
              href={`/collezioni/${c.id}`}
            >
              <span className="sb-icona">
                <span className="sb-dot" style={{ background: COLORE_STATO_COLLEZIONE[c.stato] }} />
              </span>
              <span className="sb-nome" title={`${c.nome} · ${etichettaStagione(c.stagione)}`}>{c.nome}</span>
              <span className="sb-count">{c._count.prodotti}</span>
            </a>
          ))}
          {collezioni.length === 0 && <div className="vuoto-mini">Nessuna collezione</div>}
        </SbSezione>
      </nav>
    </aside>
  );
}
