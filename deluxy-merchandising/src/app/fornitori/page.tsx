import { Sidebar } from "@/components/Sidebar";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { euro } from "@/lib/dominio";
import { calcolaGruppi, type ChiaveRaggruppamento, type Gruppo } from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// I fornitori del catalogo. Il fornitore è il «Venditore» di Shopify: lo
// leggiamo dal negozio, non lo decidiamo qui — per quello ci sono categorie e
// linee in /classificazione.
//
// La pagina è l'elenco di chi ci fornisce, con quanto pesa: da ognuno si entra
// nei suoi prodotti in anagrafica, come si fa con le collezioni.
export default async function FornitoriPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; ordina?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  const vista = sp.vista === "categoria" ? "categoria" : "";
  const ordina = sp.ordina ?? "venduto";
  const per: ChiaveRaggruppamento = vista === "categoria" ? "fornitore-tipo" : "fornitore";

  const where = { ...filtroProdotti(brand) } as Record<string, unknown>;
  const gruppi = await calcolaGruppi({ where, brand, per, ordina });

  const conFornitore = gruppi.filter((g) => !g.etichetta.startsWith("—"));
  const prodottiTotali = gruppi.reduce((s, g) => s + g.prodotti, 0);
  const ricavoTotale = gruppi.reduce((s, g) => s + g.ricavo, 0);
  const senzaFornitore = gruppi.find((g) => g.etichetta === "— senza fornitore —");

  const link = (v: string, o: string) => {
    const q = new URLSearchParams();
    if (v) q.set("vista", v);
    if (o !== "venduto") q.set("ordina", o);
    const s = q.toString();
    return s ? `/fornitori?${s}` : "/fornitori";
  };
  const linkGruppo = (g: Gruppo) => {
    const q = new URLSearchParams(g.filtro);
    return `/anagrafica?${q.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="fornitori" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Fornitori{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Chi ci fornisce i prodotti, con quanto pesa ciascuno: è il «Venditore» letto da Shopify, non una
              nostra classificazione. Da ogni fornitore si entra nei suoi prodotti.
            </p>
          </div>
        </div>

        <div className="filtri">
          <a className={`btn ${vista === "" ? "" : "btn-secondario"}`} href={link("", ordina)}>
            Per fornitore
          </a>
          <a className={`btn ${vista === "categoria" ? "" : "btn-secondario"}`} href={link("categoria", ordina)}>
            Fornitore e categoria
          </a>
        </div>

        <p className="page-sub" style={{ margin: "12px 0" }}>
          {conFornitore.length} {vista === "categoria" ? "combinazioni" : "fornitori"} · {prodottiTotali} prodotti ·
          venduto 90gg {euro(ricavoTotale)}
          {senzaFornitore && vista === "" ? (
            <>
              {" "}
              · <strong>{senzaFornitore.prodotti}</strong> prodotti senza fornitore: sono nati dai titoli del
              venduto e nessun negozio li ha ancora riconosciuti.
            </>
          ) : null}
        </p>

        {gruppi.length === 0 ? (
          <div className="vuoto">Nessun prodotto in questo ambito.</div>
        ) : (
          <TabellaGruppi
            gruppi={gruppi}
            titoloColonna="Fornitore"
            ordina={ordina}
            linkOrdine={(o) => link(vista, o)}
            linkGruppo={linkGruppo}
          />
        )}
      </main>
    </div>
  );
}
