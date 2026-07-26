import { prisma } from "@/lib/db";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { COLORE_STATO_COLLEZIONE, etichettaStagione } from "@/lib/dominio";
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
    | "sviluppo"
    | "costi"
    | "vendite"
    | "classifiche"
    | "riordini"
    | "trend-ai"
    | "visual"
    | "shopify";
  collezioneAttiva?: string;
}) {
  const brand = await brandCorrente();
  const doveProdotti = filtroProdotti(brand);

  const [nCollezioni, nProdotti, nInSviluppo, daPubblicare, pianiAperti, collezioni] = await Promise.all([
    prisma.collezione.count(),
    prisma.prodotto.count({ where: doveProdotti }),
    prisma.prodotto.count({
      where: { ...doveProdotti, fase: { in: ["concept", "prototipo", "approvato"] } },
    }),
    prisma.prodotto.count({
      where: { ...doveProdotti, shopifyStato: { not: "pubblicato" }, fase: { not: "archiviato" } },
    }),
    prisma.pianoRiordino.count({ where: { stato: "bozza" } }),
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { creataIl: "desc" }],
      include: { _count: { select: { prodotti: true } } },
    }),
  ]);

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
          {voce("riordini", "/riordini", "riordini", "Ipotesi di ordinativo", pianiAperti || undefined)}
          {voce("trend-ai", "/trend-ai", "ai", "Lettura AI")}
        </SbSezione>

        <SbSezione titolo="Prodotto">
          {voce("collezioni", "/collezioni", "collezioni", "Collezioni", nCollezioni)}
          {voce("prodotti", "/prodotti", "prodotti", "Prodotti", nProdotti)}
          {voce("sviluppo", "/sviluppo", "sviluppo", "Sviluppo", nInSviluppo)}
          {voce("costi", "/costi", "costi", "Costi & margini")}
        </SbSezione>

        <SbSezione titolo="Vetrina & canale">
          {voce("visual", "/visual", "visual", "Visual merchandising")}
          {voce("shopify", "/shopify", "shopify", "Shopify", daPubblicare || undefined)}
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
