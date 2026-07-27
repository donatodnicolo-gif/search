import Link from "next/link";
import { notFound } from "next/navigation";
import { BarraQuota } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { etichettaCategoria, euro, iso, percentuale } from "@/lib/dominio";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";

export const dynamic = "force-dynamic";

// Scheda di una collezione **di Shopify**: chi ci sta dentro fra i prodotti che
// l'app conosce, e come ha venduto negli ultimi 90 giorni. È la vetrina vista
// dal lato del merchandising.
export default async function CollezioneShopifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const collezione = await prisma.collezioneShopify.findUnique({
    where: { id },
    include: {
      prodotti: {
        include: {
          prodotto: {
            select: {
              id: true,
              nome: true,
              codice: true,
              categoria: true,
              prezzoVendita: true,
              costoProduzione: true,
              fase: true,
            },
          },
        },
      },
    },
  });
  if (!collezione) notFound();

  const prodotti = collezione.prodotti.map((r) => r.prodotto);
  const f = finestra(90);

  // Il negozio qui si chiama "Cake", nel venduto è "cakedesign.me": il nome
  // della scheda e il canale delle vendite non coincidono. Si usa la
  // corrispondenza impostata sul negozio; se non c'è, si contano tutti i canali
  // e lo si dice, invece di mostrare uno zero che sembra un dato.
  const negozio = await prisma.negozioShopify.findFirst({
    where: { nome: collezione.negozio },
    select: { canaleVendite: true },
  });
  const canale = negozio?.canaleVendite?.trim() || null;

  const vendite =
    prodotti.length > 0
      ? await prisma.vendita.groupBy({
          by: ["prodottoId"],
          where: {
            prodottoId: { in: prodotti.map((p) => p.id) },
            data: { gte: f.dal, lte: f.al },
            ...(canale ? { canale } : {}),
            ...FILTRO_BUON_FINE,
          },
          _sum: { quantita: true, ricavo: true },
        })
      : [];
  const perProdotto = new Map(vendite.map((v) => [v.prodottoId as string, v]));

  const righe = prodotti
    .map((p) => {
      const v = perProdotto.get(p.id);
      return { p, pezzi: v?._sum.quantita ?? 0, ricavo: v?._sum.ricavo ?? 0 };
    })
    .sort((a, b) => b.ricavo - a.ricavo);

  const ricavoTotale = righe.reduce((s, r) => s + r.ricavo, 0);
  const pezziTotali = righe.reduce((s, r) => s + r.pezzi, 0);
  const cheHannoVenduto = righe.filter((r) => r.pezzi > 0).length;
  const copertura = collezione.prodottiShopify > 0 ? prodotti.length / collezione.prodottiShopify : 0;

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main">
        <Link href="/collezioni" className="ritorno">
          ← Collezioni
        </Link>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">
              {collezione.negozio} · /{collezione.handle}
            </div>
            <h1 className="page-title">{collezione.titolo}</h1>
            {collezione.descrizione && <p className="page-sub">{collezione.descrizione}</p>}
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">
              {prodotti.length}
              <span style={{ fontSize: 16, color: "var(--text-tertiary)" }}> / {collezione.prodottiShopify}</span>
            </div>
            <div className="kpi-etichetta">Prodotti riconosciuti qui</div>
            <div className="kpi-sotto">{percentuale(copertura)} della collezione su Shopify</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(ricavoTotale)}</div>
            <div className="kpi-etichetta">
              Venduto in 90 giorni {canale ? `su ${canale}` : "(tutti i canali)"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{pezziTotali}</div>
            <div className="kpi-etichetta">Pezzi</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{cheHannoVenduto}</div>
            <div className="kpi-etichetta">Prodotti che hanno venduto</div>
            <div className="kpi-sotto">su {prodotti.length} in collezione</div>
          </div>
        </div>

        {collezione.prodottiShopify > prodotti.length && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Su Shopify questa collezione contiene <b>{collezione.prodottiShopify}</b> prodotti, qui ne
              risultano <b>{prodotti.length}</b>: i mancanti non sono stati riconosciuti (SKU diverso o
              prodotto mai importato) e <b>non vengono indovinati</b>. Rilanciando l&apos;import dopo aver
              sistemato gli SKU rientrano da soli.
            </span>
          </div>
        )}

        {righe.length === 0 ? (
          <div className="vuoto">Nessun prodotto di questa collezione è riconosciuto qui.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th>Categoria</th>
                  <th className="num">Prezzo</th>
                  <th className="num">Pezzi 90gg</th>
                  <th className="num">Venduto</th>
                  <th>Peso in collezione</th>
                </tr>
              </thead>
              <tbody>
                {righe.map(({ p, pezzi, ricavo }) => (
                  <tr key={p.id} className="riga-cliccabile">
                    <td>
                      <Link href={`/prodotti/${p.id}`} className="cella-nome link-riga">
                        {p.nome}
                      </Link>
                      <div className="cella-sub">{p.codice}</div>
                    </td>
                    <td className="cella-muta">{etichettaCategoria(p.categoria)}</td>
                    <td className="num">{euro(p.prezzoVendita)}</td>
                    <td className="num">{pezzi}</td>
                    <td className="num">{euro(ricavo)}</td>
                    <td style={{ width: 130 }}>
                      <BarraQuota quota={ricavoTotale > 0 ? ricavo / ricavoTotale : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="page-sub" style={{ marginTop: 14 }}>
          Aggiornata il {iso(collezione.aggiornataIl)}. Il venduto conta solo le vendite andate a buon fine
          {canale ? (
            <>
              {" "}
              fatte <b>su {canale}</b>: lo stesso prodotto su un altro negozio è un&apos;altra storia.
            </>
          ) : (
            <>
              , di <b>tutti i canali</b>: il negozio «{collezione.negozio}» non ha ancora una corrispondenza
              col nome che ha nel venduto (che arriva da Orders, tipo <code>cakedesign.me</code>). Si imposta
              in <Link href="/impostazioni">Negozi &amp; permessi</Link>, campo «nome nel venduto».
            </>
          )}
        </p>
      </main>
    </div>
  );
}
