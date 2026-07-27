import Link from "next/link";
import { Badge } from "@/components/Badge";
import { BarraQuota } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { importaCollezioniAzione } from "@/lib/azioni-collezioni";
import { brandCorrente } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { elencoNegozi } from "@/lib/negozi";
import { ultimiImportCollezioni } from "@/lib/shopify-collezioni";
import {
  calcolaMargine,
  COLORE_STATO_COLLEZIONE,
  ETICHETTA_STATO_COLLEZIONE,
  etichettaStagione,
  iso,
  percentuale,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";
// L'import di un negozio grande fa migliaia di chiamate: senza questo la
// richiesta viene tagliata a metà strada.
export const maxDuration = 300;

export default async function CollezioniPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();

  const [collezioni, prodotti, inVendita, daPubblicare, collezioniShopify, ultimiImport] = await Promise.all([
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { creataIl: "desc" }],
      include: {
        _count: { select: { prodotti: true } },
        prodotti: { select: { costoProduzione: true, prezzoVendita: true } },
      },
    }),
    prisma.prodotto.findMany({ select: { costoProduzione: true, prezzoVendita: true } }),
    prisma.prodotto.count({ where: { fase: "in_vendita" } }),
    prisma.prodotto.count({ where: { shopifyStato: { not: "pubblicato" }, fase: { not: "archiviato" } } }),
    prisma.collezioneShopify.findMany({
      where: brand ? { negozio: brand } : {},
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      include: { _count: { select: { prodotti: true } } },
    }),
    ultimiImportCollezioni(),
  ]);
  const negozi = (await elencoNegozi()).filter((n) => n.attivo);

  // Il margine medio conta solo dove il costo c'è: a costo zero il margine non
  // è 100%, è un costo che nessuno ha inserito.
  const conCosto = prodotti.filter((p) => p.prezzoVendita > 0 && p.costoProduzione > 0);
  const margineMedio =
    conCosto.length > 0
      ? conCosto.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) /
        conCosto.length
      : null;

  function margineCollezione(ps: { costoProduzione: number; prezzoVendita: number }[]): number | null {
    const v = ps.filter((p) => p.prezzoVendita > 0 && p.costoProduzione > 0);
    if (!v.length) return null;
    return v.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) / v.length;
  }

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Collezioni</h1>
            <p className="page-sub">
              Il prodotto organizzato per stagione, come in una maison: dal concept alla vetrina, fino alla
              pubblicazione su Shopify.
            </p>
          </div>
          <div className="riga-azione">
            <a className="btn btn-secondario" href="/collezioni/nuova">Nuova collezione</a>
            {/* Un bottone per negozio: l'import di tutti insieme non arrivava
                in fondo col negozio più grande. */}
            {negozi.map((n) => (
              <form action={importaCollezioniAzione.bind(null, n.id)} key={n.id}>
                <button className="btn" type="submit">
                  Importa {n.nome}
                </button>
              </form>
            ))}
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {sp.esito && (
          <div className={sp.esito === "ok" ? "nota-info" : "avviso-errore"}>
            {sp.esito === "ok" && <span className="nota-icona">✓</span>}
            <span>{sp.messaggio || "Import completato."}</span>
          </div>
        )}

        {brand && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Le collezioni sono <b>trasversali ai brand</b>: una stessa collezione può essere venduta su più
              negozi, quindi qui l&apos;ambito «{brand}» non filtra niente. Il venduto per brand si guarda in{" "}
              <a href="/vendite">Andamento &amp; trend</a> e in <a href="/classifiche">Classifiche</a>.
            </span>
          </div>
        )}

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{collezioni.length}</div>
            <div className="kpi-etichetta">Collezioni</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{inVendita}</div>
            <div className="kpi-etichetta">Prodotti in vendita</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{margineMedio != null ? percentuale(margineMedio) : "n.d."}</div>
            <div className="kpi-etichetta">
              {margineMedio != null ? `Margine medio su ${conCosto.length} prodotti col costo` : "Margine: nessun costo inserito"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{daPubblicare}</div>
            <div className="kpi-etichetta">Da pubblicare su Shopify</div>
          </div>
        </div>

        {/* Le collezioni vere dei negozi: quelle che il cliente vede sul sito. */}
        <div className="scheda">
          <div className="scheda-titolo">
            Collezioni Shopify {brand ? `— ${brand}` : "(tutti i negozi)"} · {collezioniShopify.length}
          </div>
          {collezioniShopify.length === 0 ? (
            <p className="page-sub">
              Nessuna collezione importata. Il bottone <b>Importa da Shopify</b> le legge dai negozi collegati
              in <Link href="/impostazioni">Negozi &amp; permessi</Link> e le abbina ai prodotti per SKU.
            </p>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Collezione</th>
                    <th>Negozio</th>
                    <th className="num">Prodotti qui</th>
                    <th className="num">Su Shopify</th>
                    <th>Copertura</th>
                  </tr>
                </thead>
                <tbody>
                  {collezioniShopify.map((c) => {
                    const quota = c.prodottiShopify > 0 ? c._count.prodotti / c.prodottiShopify : 0;
                    return (
                      <tr key={c.id} className="riga-cliccabile">
                        <td>
                          <Link href={`/collezioni/shopify/${c.id}`} className="cella-nome link-riga">
                            {c.titolo}
                          </Link>
                          <div className="cella-sub">/{c.handle}</div>
                        </td>
                        <td className="cella-muta">{c.negozio}</td>
                        <td className="num">{c._count.prodotti}</td>
                        <td className="num cella-muta">{c.prodottiShopify}</td>
                        <td style={{ width: 130 }}>
                          <BarraQuota quota={quota} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {ultimiImport.length > 0 && (
            <p className="page-sub" style={{ marginTop: 12 }}>
              Ultimo import —{" "}
              {ultimiImport.map((i, k) => (
                <span key={i.id}>
                  {k > 0 ? " · " : ""}
                  <b>{i.negozio}</b> {iso(i.iniziatoIl)}: {i.messaggio}
                </span>
              ))}
            </p>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>
            «Prodotti qui» sono quelli della collezione che l&apos;app riconosce (abbinati per SKU, poi per
            codice, poi per titolo esatto); «su Shopify» quanti ne contiene davvero. La differenza è la parte
            di quella collezione che qui non esiste — non viene indovinata.
          </p>
        </div>

        <div className="scheda-titolo" style={{ margin: "26px 0 12px" }}>
          Collezioni della maison — nate qui, per stagione
        </div>
        {collezioni.length === 0 ? (
          <div className="vuoto">Nessuna collezione di maison. Crea la prima per iniziare.</div>
        ) : (
          <div className="griglia-collezioni">
            {collezioni.map((c) => {
              const m = margineCollezione(c.prodotti);
              return (
                <a key={c.id} className="card-collezione" href={`/collezioni/${c.id}`}>
                  <div className="card-cover">
                    <span className="card-cover-stagione">{etichettaStagione(c.stagione)}</span>
                  </div>
                  <div className="card-corpo">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span className="card-nome">{c.nome}</span>
                      <Badge testo={ETICHETTA_STATO_COLLEZIONE[c.stato]} colore={COLORE_STATO_COLLEZIONE[c.stato]} />
                    </div>
                    <p className="card-tema">{c.tema ?? c.descrizione ?? "—"}</p>
                    <div className="card-meta">
                      <span className="card-meta-num"><b>{c._count.prodotti}</b> prodotti</span>
                      <span className="card-meta-num">
                        {m != null ? <><b>{percentuale(m)}</b> margine</> : "margine —"}
                      </span>
                      <span className="card-meta-num">{c.dataLancio ? iso(c.dataLancio) : "senza data"}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
