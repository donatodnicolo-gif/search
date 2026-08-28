import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { unisciAzione } from "@/lib/azioni-riconciliazione";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { candidati } from "@/lib/riconciliazione";

export const dynamic = "force-dynamic";

// Riconciliare = dire «queste due schede sono lo stesso prodotto».
//
// La pagina propone gli accostamenti **dicendo perché** (stesso SKU, stessa
// pagina Shopify, stesso nome) e lascia scegliere. Nessuna unione automatica:
// due bouquet con lo stesso nome possono essere due prodotti diversi, e a
// deciderlo dev'essere chi il catalogo lo conosce.
export default async function RiconciliaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; cerca?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const prodotto = await prisma.prodotto.findUnique({
    where: { id },
    include: {
      varianti: { select: { nome: true, sku: true } },
      assorbiti: { select: { id: true, nome: true, codice: true } },
    },
  });
  if (!prodotto) notFound();

  const [{ lista: proposte, corrispondenti }, venduto] = await Promise.all([
    candidati(id, sp.cerca),
    prisma.vendita.aggregate({ where: { prodottoId: id }, _sum: { quantita: true, ricavo: true } }),
  ]);
  const fuoriElenco = corrispondenti - proposte.length;

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        {/* «Il ritorno al punto esatto» (Libro v1.5 §2): si arriva sempre
            dalla scheda del prodotto, e la history ci riporta lì com'era. */}
        <TornaIndietro fallback={`/prodotti/${id}`} label="Scheda prodotto" />
        <div className="page-head">
          <div>
            <h1 className="page-title">Riconcilia «{prodotto.nome}»</h1>
            <p className="page-sub">
              Le schede che potrebbero essere <strong>lo stesso prodotto</strong>. Unendole, il loro venduto passa
              qui e loro restano in anagrafica con scritto a chi sono state unite: non si cancella niente, e si
              può separare.
            </p>
          </div>
          <Link className="btn btn-secondario" href={`/prodotti/${id}`}>
            Torna alla scheda
          </Link>
        </div>

        {sp.errore && <div className="avviso avviso-errore">{sp.errore}</div>}

        <div className="scheda" style={{ marginBottom: 16 }}>
          <div className="scheda-titolo">Questa è la scheda che resta</div>
          <p className="page-sub" style={{ margin: 0 }}>
            <strong>{prodotto.nome}</strong> · {prodotto.codice}
            {prodotto.vendorShopify ? ` · ${prodotto.vendorShopify}` : ""} ·{" "}
            {prodotto.prezzoVendita > 0 ? euro(prodotto.prezzoVendita) : "senza prezzo"} ·{" "}
            {venduto._sum.quantita ?? 0} pz venduti per {euro(venduto._sum.ricavo ?? 0)}
            {prodotto.varianti.length > 0 && (
              <>
                {" "}
                · SKU {prodotto.varianti.map((v) => v.sku).filter(Boolean).join(", ") || "—"}
              </>
            )}
          </p>
          {prodotto.assorbiti.length > 0 && (
            <p className="page-sub" style={{ marginBottom: 0 }}>
              Ha già assorbito {prodotto.assorbiti.length}{" "}
              {prodotto.assorbiti.length === 1 ? "scheda" : "schede"}:{" "}
              {prodotto.assorbiti.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <Link href={`/prodotti/${a.id}`}>{a.nome}</Link>
                </span>
              ))}
            </p>
          )}
        </div>

        <form method="get" className="filtri" style={{ marginBottom: 12 }}>
          <input
            type="search"
            name="cerca"
            placeholder="Non la trovi? Cerca per nome o codice…"
            defaultValue={sp.cerca ?? ""}
          />
          <button className="btn btn-secondario" type="submit">
            Cerca
          </button>
        </form>

        {proposte.length === 0 ? (
          <div className="vuoto">
            Nessuna scheda somigliante. Se sai che ce n&apos;è una, cercala per nome o codice qui sopra.
          </div>
        ) : (
          <form action={unisciAzione.bind(null, id)}>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Scheda</th>
                    <th>Perché la propongo</th>
                    <th>Fornitore</th>
                    <th className="num">Prezzo</th>
                    <th className="num">Venduto</th>
                  </tr>
                </thead>
                <tbody>
                  {/* «La riga si apre col click» (Libro v1.6 §8): tutta la
                      riga porta alla scheda; la spunta e i controlli restano
                      loro (stanno sopra il link steso). */}
                  {proposte.map((c) => (
                    <tr key={c.id} className="riga-cliccabile">
                      <td>
                        <input type="checkbox" name="assorbito" value={c.id} aria-label={`Unisci ${c.nome}`} />
                      </td>
                      <td>
                        <Link href={`/prodotti/${c.id}`} className="cella-nome link-riga">
                          {c.nome}
                        </Link>
                        <div className="cella-sub">{c.codice}</div>
                      </td>
                      <td className="cella-muta">{c.motivo}</td>
                      <td className="cella-muta">{c.vendorShopify ?? "—"}</td>
                      <td className="num">{c.prezzoVendita > 0 ? euro(c.prezzoVendita) : "—"}</td>
                      <td className="num">
                        {c.ricavo > 0 ? euro(c.ricavo) : "—"}
                        {c.vendite > 0 && <div className="cella-sub">{c.vendite} pz</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fuoriElenco > 0 && (
              <p className="page-sub" style={{ marginTop: 10 }}>
                Mostrate le {proposte.length} corrispondenze più forti; altre {fuoriElenco} più deboli
                restano fuori — restringi la ricerca per vederle. Nessun taglio silenzioso.
              </p>
            )}
            <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <button className="btn" type="submit">
                Unisci le schede scelte a questa
              </button>
              <span className="page-sub" style={{ margin: 0 }}>
                Il venduto delle schede scelte passa su «{prodotto.nome}». Si può separare dalla loro scheda.
              </span>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
