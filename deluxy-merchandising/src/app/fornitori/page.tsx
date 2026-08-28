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
  searchParams: Promise<{ vista?: string; ordina?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  const vista = sp.vista === "categoria" ? "categoria" : "";
  const ordina = sp.ordina ?? "venduto";
  const cerca = (sp.q ?? "").trim();
  const per: ChiaveRaggruppamento = vista === "categoria" ? "fornitore-tipo" : "fornitore";

  const where = { ...filtroProdotti(brand) } as Record<string, unknown>;
  const gruppi = await calcolaGruppi({ where, brand, per, ordina });

  // La ricerca (Libro UX&UI v1.9 §8-bis): sul nome del fornitore, in memoria —
  // i gruppi sono già calcolati e sono decine, non migliaia. I totali qui sotto
  // restano sull'insieme intero: la ricerca restringe la tabella, non i conti.
  // Niente scorciatoie di periodo: è un registro anagrafico, il venduto ha già
  // la sua finestra fissa (90 giorni).
  const visibili = cerca
    ? gruppi.filter((g) => g.etichetta.toLowerCase().includes(cerca.toLowerCase()))
    : gruppi;

  const conFornitore = gruppi.filter((g) => !g.etichetta.startsWith("—"));
  const prodottiTotali = gruppi.reduce((s, g) => s + g.prodotti, 0);
  const ricavoTotale = gruppi.reduce((s, g) => s + g.ricavo, 0);
  const senzaFornitore = gruppi.find((g) => g.etichetta === "— senza fornitore —");

  const link = (v: string, o: string, conRicerca = true) => {
    const q = new URLSearchParams();
    if (v) q.set("vista", v);
    if (o !== "venduto") q.set("ordina", o);
    if (cerca && conRicerca) q.set("q", cerca);
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

        {/* La ricerca (Libro v1.9 §8-bis): form GET, così il filtro sta
            nell'indirizzo. Vista e ordinamento viaggiano nascosti e non si
            perdono al submit. */}
        <form method="get" className="filtri">
          {vista && <input type="hidden" name="vista" value={vista} />}
          {ordina !== "venduto" && <input type="hidden" name="ordina" value={ordina} />}
          <input
            type="search"
            name="q"
            defaultValue={cerca}
            placeholder="Cerca un fornitore…"
            aria-label="Cerca un fornitore"
          />
          <button className="btn btn-secondario" type="submit">Cerca</button>
          {cerca && (
            <span className="page-sub" style={{ margin: 0, alignSelf: "center" }}>
              {visibili.length} su {gruppi.length} · <a href={link(vista, ordina, false)}>azzera</a>
            </span>
          )}
        </form>

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

        {visibili.length === 0 ? (
          <div className="vuoto">
            {cerca ? "Nessun fornitore per questa ricerca." : "Nessun prodotto in questo ambito."}
          </div>
        ) : (
          <TabellaGruppi
            gruppi={visibili}
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
