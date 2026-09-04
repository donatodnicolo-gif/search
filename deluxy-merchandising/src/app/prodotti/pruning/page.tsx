import Link from "next/link";
import { Miniatura } from "@/components/Miniatura";
import { Sidebar } from "@/components/Sidebar";
import { archiviaSulNegozio, proponiPruning, ritiraPruning } from "@/lib/azioni-pruning";
import { brandCorrente, negoziDelBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { dataIt } from "@/lib/fuso";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";

export const dynamic = "force-dynamic";

// **Pruning** (chiesto dall'utente il 04/09/2026): la sezione dove il
// merchandiser **propone** i prodotti da spegnere sul negozio, e dove le
// proposte si guardano e — con conferma — si eseguono.
//
// I candidati sono i prodotti **attivi sul negozio** ordinati dal venduto
// più fermo: prima chi non ha venduto niente negli ultimi 180 giorni, poi chi
// ha venduto meno. È un ordine, non un verdetto: il perché lo scrive chi
// propone, nel motivo. La lista è tagliata a 150 righe e lo dice.
const GIORNI = 180;
const LIMITE = 150;

export default async function PruningPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string; archivia?: string; cerca?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  const negoziAmbito = await negoziDelBrand(brand);
  const f = finestra(GIORNI);

  const doveAttivi = {
    statoShopify: "ACTIVE",
    fase: { not: "archiviato" },
    esclusoDaAnalisi: false,
    unitoAId: null,
    ...(negoziAmbito ? { collezioniShopify: { some: { collezione: { negozio: { in: negoziAmbito } } } } } : {}),
  };

  const [attivi, venduto, proposte] = await Promise.all([
    prisma.prodotto.findMany({
      where: doveAttivi,
      select: {
        id: true,
        nome: true,
        codice: true,
        immagine: true,
        prezzoVendita: true,
        pubblicatoIlShopify: true,
        tipoShopify: true,
        pruningPropostoIl: true,
      },
    }),
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, prodottoId: { not: null } },
      _sum: { quantita: true, ricavo: true },
      _max: { data: true },
    }),
    prisma.prodotto.findMany({
      where: { pruningPropostoIl: { not: null }, pruningArchiviatoIl: null },
      orderBy: { pruningPropostoIl: "desc" },
      select: { id: true, nome: true, codice: true, immagine: true, pruningPropostoIl: true, pruningMotivo: true, shopifyId: true, statoShopify: true },
    }),
  ]);

  const vendutoDi = new Map(venduto.map((v) => [v.prodottoId as string, v]));
  const cerca = (sp.cerca ?? "").trim().toLowerCase();
  const candidati = attivi
    .filter((p) => !p.pruningPropostoIl)
    .filter((p) => !cerca || p.nome.toLowerCase().includes(cerca) || p.codice.toLowerCase().includes(cerca))
    .map((p) => {
      const v = vendutoDi.get(p.id);
      return {
        ...p,
        pezzi: v?._sum.quantita ?? 0,
        ricavo: v?._sum.ricavo ?? 0,
        ultima: v?._max.data ?? null,
      };
    })
    .sort((a, b) => a.pezzi - b.pezzi || a.ricavo - b.ricavo || a.nome.localeCompare(b.nome));
  const mostrati = candidati.slice(0, LIMITE);
  const senzaVendite = candidati.filter((c) => c.pezzi === 0).length;
  const daConfermare = sp.archivia ? proposte.find((p) => p.id === sp.archivia) ?? null : null;

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        <Link className="ritorno" href="/prodotti">
          ← Prodotti
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">Pruning{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Il merchandiser <b>propone</b> i prodotti da spegnere sul negozio; le proposte stanno qui finché
              qualcuno le <b>archivia</b> (con conferma: scrive su Shopify) o le ritira. I candidati sono i prodotti
              attivi in ordine di venduto più fermo negli ultimi {GIORNI} giorni.
            </p>
          </div>
        </div>

        {sp.messaggio && (
          <div className={sp.esito === "errore" ? "avviso-errore" : "nota-info"}>
            {sp.esito !== "errore" && <span className="nota-icona">✓</span>}
            <span>{sp.messaggio}</span>
          </div>
        )}

        {daConfermare && (
          <div className="scheda" style={{ borderColor: "var(--red)" }}>
            <div className="scheda-titolo">Archiviare «{daConfermare.nome}» sul negozio?</div>
            <p className="page-sub">
              Su Shopify il prodotto passa ad <b>archiviato</b>: il cliente non lo vede più, esce dalle collezioni
              in vetrina e qui va in fase «Archiviato», fuori dalle classifiche. Si riattiva dall&apos;admin del negozio.
              {!daConfermare.shopifyId && " Questo prodotto non è collegato a Shopify: si archivia solo qui."}
            </p>
            <div className="azioni-modulo" style={{ justifyContent: "flex-start" }}>
              <form action={archiviaSulNegozio.bind(null, daConfermare.id)}>
                <button className="btn btn-pericolo" type="submit">
                  Sì, archivia
                </button>
              </form>
              <Link className="btn btn-secondario" href="/prodotti/pruning">
                Annulla
              </Link>
            </div>
          </div>
        )}

        {/* ---------- Le proposte ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Proposte di disattivazione · {proposte.length}</div>
          {proposte.length === 0 ? (
            <div className="vuoto-mini">Nessuna proposta aperta. Proponi dai candidati qui sotto.</div>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Motivo</th>
                    <th>Proposto il</th>
                    <th>Sul negozio</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {proposte.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Miniatura url={p.immagine} lato={36} />
                          <span>
                            <Link href={`/prodotti/${p.id}`} className="cella-nome">
                              {p.nome}
                            </Link>
                            <div className="cella-sub">{p.codice}</div>
                          </span>
                        </div>
                      </td>
                      <td>{p.pruningMotivo ?? <span className="cella-sub">—</span>}</td>
                      <td>{p.pruningPropostoIl ? dataIt(p.pruningPropostoIl) : "—"}</td>
                      <td>{p.shopifyId ? (p.statoShopify === "ACTIVE" ? "attivo" : (p.statoShopify ?? "?").toLowerCase()) : "non collegato"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link className="btn btn-pericolo small" href={`/prodotti/pruning?archivia=${p.id}`}>
                          Archivia sul negozio
                        </Link>{" "}
                        <form action={ritiraPruning.bind(null, p.id)} style={{ display: "inline" }}>
                          <button className="btn btn-secondario small" type="submit">
                            Ritira
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- I candidati ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">
            Candidati: attivi sul negozio, dal venduto più fermo · {candidati.length}
          </div>
          <form method="get" className="filtri" style={{ marginBottom: 12 }}>
            <input type="search" name="cerca" defaultValue={sp.cerca ?? ""} placeholder="Cerca per nome o codice" aria-label="Cerca" />
          </form>
          <p className="page-sub" style={{ marginBottom: 10 }}>
            <b>{senzaVendite}</b> non hanno venduto niente negli ultimi {GIORNI} giorni.
            {candidati.length > LIMITE && ` Mostrati i primi ${LIMITE}: usa la ricerca per gli altri.`}
          </p>
          {mostrati.length === 0 ? (
            <div className="vuoto-mini">Nessun candidato{cerca ? " con questa ricerca" : ""}.</div>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Tipo</th>
                    <th className="num">Pezzi {GIORNI}gg</th>
                    <th className="num">Venduto</th>
                    <th>Ultima vendita</th>
                    <th>Pubblicato il</th>
                    <th>Proponi</th>
                  </tr>
                </thead>
                <tbody>
                  {mostrati.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Miniatura url={p.immagine} lato={36} />
                          <span>
                            <Link href={`/prodotti/${p.id}`} className="cella-nome">
                              {p.nome}
                            </Link>
                            <div className="cella-sub">
                              {p.codice} · {euro(p.prezzoVendita)}
                            </div>
                          </span>
                        </div>
                      </td>
                      <td>{p.tipoShopify ?? <span className="cella-sub">—</span>}</td>
                      <td className="num" style={{ color: p.pezzi === 0 ? "var(--red)" : undefined }}>{p.pezzi}</td>
                      <td className="num">{euro(p.ricavo)}</td>
                      <td>{p.ultima ? dataIt(p.ultima) : <span className="cella-sub">mai in {GIORNI}gg</span>}</td>
                      <td>{p.pubblicatoIlShopify ? dataIt(p.pubblicatoIlShopify) : <span className="cella-sub">—</span>}</td>
                      <td>
                        <form action={proponiPruning} className="riga-ai" style={{ margin: 0, flexWrap: "nowrap" }}>
                          <input type="hidden" name="prodottoId" value={p.id} />
                          <input name="motivo" placeholder="Motivo (facoltativo)" style={{ width: 160 }} aria-label={`Motivo per ${p.nome}`} />
                          <button className="btn btn-secondario small" type="submit">
                            Proponi
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
