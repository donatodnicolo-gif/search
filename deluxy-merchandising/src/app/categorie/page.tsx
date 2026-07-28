import { Sidebar } from "@/components/Sidebar";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { euro } from "@/lib/dominio";
import { calcolaGruppi, nomeRaggruppamento, type ChiaveRaggruppamento, type Gruppo } from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// Il catalogo per categoria. Ce ne sono due, e non vanno mescolate: quella
// **dal negozio** è il «Tipo» che Shopify ci restituisce, quella **interna** la
// decidiamo noi in /classificazione. Tenerle su due viste separate è il modo per
// vedere quanto le due si somigliano — e quanto lavoro di classificazione manca.
const VISTE: { chiave: ChiaveRaggruppamento; nome: string; spiega: string }[] = [
  {
    chiave: "tipo",
    nome: "Dal negozio",
    spiega:
      "Il «Tipo» del riquadro «Organizzazione del prodotto» di Shopify: lo leggiamo, non lo decidiamo. Chi non ha un tipo non è ancora stato riconosciuto su nessun negozio.",
  },
  {
    chiave: "categoria",
    nome: "Interna",
    spiega:
      "La categoria decisa da noi in Categorie, linee, collezioni. È quella che comanda nelle analisi: finché un prodotto è «Da classificare», nelle viste per categoria sta lì.",
  },
];
// Le **linee** hanno la loro pagina (/linee) e le **fasce di prezzo** la loro
// (/fasce): qui restano le due letture della categoria, che sono quelle che
// vale la pena confrontare fra loro.

export default async function CategoriePage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; ordina?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  const vista = VISTE.find((v) => v.chiave === sp.vista) ?? VISTE[0];
  const ordina = sp.ordina ?? "venduto";

  const where = { ...filtroProdotti(brand) } as Record<string, unknown>;
  const gruppi = await calcolaGruppi({ where, brand, per: vista.chiave, ordina });

  const pieni = gruppi.filter((g) => !g.etichetta.startsWith("—"));
  const prodottiTotali = gruppi.reduce((s, g) => s + g.prodotti, 0);
  const ricavoTotale = gruppi.reduce((s, g) => s + g.ricavo, 0);

  const link = (v: string, o: string) => {
    const q = new URLSearchParams();
    if (v !== VISTE[0].chiave) q.set("vista", v);
    if (o !== "venduto") q.set("ordina", o);
    const s = q.toString();
    return s ? `/categorie?${s}` : "/categorie";
  };
  const linkGruppo = (g: Gruppo) => `/anagrafica?${new URLSearchParams(g.filtro).toString()}`;

  return (
    <div className="layout">
      <Sidebar attiva="categorie" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Categorie{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Il catalogo raccolto per categoria, con quanto pesa ciascuna. Da ogni categoria si entra nei suoi
              prodotti.
            </p>
          </div>
        </div>

        <div className="filtri">
          {VISTE.map((v) => (
            <a
              key={v.chiave}
              className={`btn ${v.chiave === vista.chiave ? "" : "btn-secondario"}`}
              href={link(v.chiave, ordina)}
            >
              {v.nome}
            </a>
          ))}
        </div>

        <p className="page-sub" style={{ margin: "12px 0" }}>
          {vista.spiega}
        </p>
        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {/* Si contano le voci **esistenti**: il gruppo «— senza … —» non è una
              categoria, è la misura di quanto lavoro manca. Dirlo evita di
              leggere «0 voci» come «nessun prodotto». */}
          {pieni.length} {pieni.length === 1 ? "voce esistente" : "voci esistenti"} · {prodottiTotali} prodotti ·
          venduto 90gg {euro(ricavoTotale)}
          {pieni.length === 0 && " · nessuna ancora assegnata: stanno tutti nel gruppo qui sotto"}
        </p>

        {gruppi.length === 0 ? (
          <div className="vuoto">Nessun prodotto in questo ambito.</div>
        ) : (
          <TabellaGruppi
            gruppi={gruppi}
            titoloColonna={nomeRaggruppamento(vista.chiave) ?? "Categoria"}
            ordina={ordina}
            linkOrdine={(o) => link(vista.chiave, o)}
            linkGruppo={linkGruppo}
          />
        )}
      </main>
    </div>
  );
}
