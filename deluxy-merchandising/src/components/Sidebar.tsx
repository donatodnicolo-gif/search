import { prisma } from "@/lib/db";
import { brandCorrente } from "@/lib/brand";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

// **Il menu dice il mestiere, non l'inventario.**
//
// Prima: sette sezioni, una ventina di voci, un contatore accanto a quasi
// tutte e l'elenco di ogni collezione maison in fondo — una seconda copia
// della pagina /collezioni dentro il menu, ricalcolata a ogni pagina. Per
// trovare una voce si leggeva tutto.
//
// Ora: quattro gesti (guardare le vendite, lavorare il catalogo, mettere in
// scena, il negozio) più le **lenti** secondarie, che nascono ripiegate. I
// numeri restano solo dove sono **lavoro da fare** (sviluppo, da pubblicare):
// un contatore che dice quanti prodotti esistono è arredamento, non
// informazione — e ogni numero in meno è una query in meno su ogni pagina.
export async function Sidebar({
  attiva,
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
    | "best-seller"
    | "classifiche"
    | "assortimento"
    | "riordini"
    | "trend-ai"
    | "visual"
    | "shopify"
    | "impostazioni";
}) {
  const brand = await brandCorrente();

  // Un giro solo, due numeri soli: quelli che chiedono un'azione. Il filtro
  // d'ambito è lo stesso di `filtroProdotti` («prodotti venduti su quel
  // canale»), qui scritto come EXISTS sul venduto.
  const conti = await prisma.$queryRaw<{ inSviluppo: number; daPubblicare: number }[]>`
    WITH pr AS (
      SELECT prod.fase, prod."shopifyStato"
      FROM "merchandising"."Prodotto" prod
      WHERE (${brand}::text IS NULL OR EXISTS (
        SELECT 1 FROM "merchandising"."Vendita" v
        WHERE v."prodottoId" = prod.id AND v.canale = ${brand}::text))
    )
    SELECT
      (SELECT count(*) FROM pr WHERE fase IN ('concept','prototipo','approvato'))::int AS "inSviluppo",
      (SELECT count(*) FROM pr WHERE "shopifyStato" <> 'pubblicato' AND fase <> 'archiviato')::int AS "daPubblicare"`;
  const nInSviluppo = conti[0]?.inSviluppo ?? 0;
  const daPubblicare = conti[0]?.daPubblicare ?? 0;

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
      {count != null && count > 0 && <span className="sb-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <nav>
        {/* Il cruscotto sta da solo in testa: è la porta, non una sezione. */}
        {voce("cruscotto", "/", "home", "Cruscotto")}

        <SbSezione titolo="Vendite">
          {/* In testa: è la domanda che ci si fa più spesso, "cosa vende adesso". */}
          {voce("best-seller", "/best-seller", "classifiche", "I più venduti")}
          {voce("vendite", "/vendite", "vendite", "Andamento & trend")}
          {voce("classifiche", "/classifiche", "classifiche", "Classifiche")}
          {voce("assortimento", "/assortimento", "collezioni", "Assortimento")}
          {voce("trend-ai", "/trend-ai", "ai", "Lettura AI")}
        </SbSezione>

        <SbSezione titolo="Catalogo">
          {voce("prodotti", "/prodotti", "prodotti", "Prodotti")}
          {voce("collezioni", "/collezioni", "collezioni", "Collezioni")}
          {voce("multi-prodotto", "/multi-prodotto", "prodotti", "Multi prodotto")}
          {voce("sviluppo", "/sviluppo", "sviluppo", "Sviluppo", nInSviluppo)}
          {voce("costi", "/costi", "costi", "Costi & margini")}
          {voce("anagrafica", "/anagrafica", "anagrafica", "Anagrafica completa")}
        </SbSezione>

        {/* Le lenti sono modi di guardare lo stesso catalogo: utili, non
            quotidiane. Nascono ripiegate — il menu di default resta corto. */}
        <SbSezione titolo="Lenti sul catalogo" chiusa>
          {voce("fornitori", "/fornitori", "prodotti", "Per fornitore")}
          {voce("categorie", "/categorie", "collezioni", "Per categoria")}
          {voce("linee", "/linee", "collezioni", "Per linea")}
          {voce("fasce", "/fasce", "costi", "Per fascia di prezzo")}
          {voce("griglie", "/griglie", "classifiche", "Griglie")}
          {voce("classificazione", "/classificazione", "impostazioni", "Imposta categorie e linee")}
        </SbSezione>

        <SbSezione titolo="Vetrina">
          {voce("visual", "/visual", "visual", "Visual merchandising")}
        </SbSezione>

        <SbSezione titolo="Negozio">
          {voce("shopify", "/shopify", "shopify", "Shopify", daPubblicare)}
          {voce("impostazioni", "/impostazioni", "impostazioni", "Negozi & permessi")}
        </SbSezione>
      </nav>
    </aside>
  );
}
