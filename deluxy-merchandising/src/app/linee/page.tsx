import { Sidebar } from "@/components/Sidebar";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { elencoLinee } from "@/lib/classificazione";
import { euro } from "@/lib/dominio";
import { calcolaGruppi, type Gruppo } from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// Le linee di prodotto: la famiglia commerciale trasversale alle stagioni. A
// differenza di fornitore e categoria dal negozio, la linea la **decidiamo noi**
// in /classificazione — quindi qui si vede anche quanto lavoro manca, cioè
// quanti prodotti non ne hanno ancora una.
export default async function LineePage({
  searchParams,
}: {
  searchParams: Promise<{ ordina?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  const ordina = sp.ordina ?? "venduto";

  const where = { ...filtroProdotti(brand) } as Record<string, unknown>;
  const [gruppi, linee] = await Promise.all([
    calcolaGruppi({ where, brand, per: "linea", ordina }),
    elencoLinee(),
  ]);

  const prodottiTotali = gruppi.reduce((s, g) => s + g.prodotti, 0);
  const ricavoTotale = gruppi.reduce((s, g) => s + g.ricavo, 0);
  const senzaLinea = gruppi.find((g) => g.etichetta === "— senza linea —");

  const link = (o: string) => (o === "venduto" ? "/linee" : `/linee?ordina=${o}`);
  const linkGruppo = (g: Gruppo) => `/anagrafica?${new URLSearchParams(g.filtro).toString()}`;

  return (
    <div className="layout">
      <Sidebar attiva="linee" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Linee{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Le famiglie commerciali decise da noi, con quanto pesa ciascuna. Le linee si creano e si
              descrivono in <a href="/classificazione">Categorie, linee, collezioni</a>; da ogni linea si entra
              nei suoi prodotti.
            </p>
          </div>
        </div>

        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {linee.length} {linee.length === 1 ? "linea definita" : "linee definite"} · {prodottiTotali} prodotti ·
          venduto 90gg {euro(ricavoTotale)}
          {senzaLinea ? (
            <>
              {" "}
              · <strong>{senzaLinea.prodotti}</strong> ancora senza linea
            </>
          ) : null}
        </p>

        {gruppi.length === 0 ? (
          <div className="vuoto">Nessun prodotto in questo ambito.</div>
        ) : (
          <TabellaGruppi
            gruppi={gruppi}
            titoloColonna="Linea"
            ordina={ordina}
            linkOrdine={link}
            linkGruppo={linkGruppo}
          />
        )}
      </main>
    </div>
  );
}
