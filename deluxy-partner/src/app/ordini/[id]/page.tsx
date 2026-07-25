import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { STATI_ORDINE, CATEGORIE_PAG } from "@/lib/ordini";
import { tokenNegozio, scaricaTransazioniOrdine, type TransazioneOrdine } from "@/lib/shopify";

export const dynamic = "force-dynamic";

const dataOra = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

// Scheda del singolo ordine Shopify con la TRANSAZIONE corrispondente:
//  - bonifico riconciliato → il movimento bancario abbinato (Qonto/file);
//  - carta/gateway → l'incasso reale sul gateway letto da Shopify (il denaro
//    arriva in banca in un payout aggregato, non 1:1).
export default async function OrdineDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordine = await prisma.ordineShopify.findUnique({ where: { id }, include: { negozio: true } });
  if (!ordine) notFound();

  const st = STATI_ORDINE[ordine.statoRicon] ?? { label: ordine.statoRicon, badge: "neutral" };

  // Movimento bancario abbinato (se l'ordine è stato riconciliato con un bonifico)
  const movimento = ordine.transazioneId
    ? await prisma.transazioneBancaria.findUnique({ where: { id: ordine.transazioneId } })
    : null;

  // Transazioni reali dell'ordine su Shopify (best-effort: se il token non c'è o
  // Shopify non risponde, mostriamo comunque il resto della scheda).
  let txShopify: TransazioneOrdine[] = [];
  let erroreTx: string | null = null;
  try {
    const token = await tokenNegozio(ordine.negozio);
    txShopify = await scaricaTransazioniOrdine(ordine.negozio.dominio, token, ordine.orderId);
  } catch (e) {
    erroreTx = (e as Error).message;
  }
  const incassi = txShopify.filter((t) => ["SALE", "CAPTURE"].includes(t.kind ?? "") && t.status === "SUCCESS");
  const rimborsi = txShopify.filter((t) => t.kind === "REFUND" && t.status === "SUCCESS");

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/ordini" className="btn secondary small" style={{ marginBottom: 10 }}>← Tutti gli ordini</Link>
          <h1 className="page-title">Ordine {ordine.nome}</h1>
          <p className="page-caption">
            {ordine.negozio.brand} · {dataIt(ordine.data)} · {ordine.clienteNome ?? "cliente n/d"}
          </p>
        </div>
        <div className="page-actions">
          <span className={`badge ${st.badge}`}><span className="dot" />{st.label}</span>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Totale ordine</div>
          <div className="kpi-value">{euro(ordine.totale)}</div>
          <div className="kpi-sub">{ordine.valuta}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pagamento</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{CATEGORIE_PAG[ordine.categoriaPagamento] ?? ordine.categoriaPagamento}</div>
          <div className="kpi-sub">{ordine.gateway ?? "—"} · {ordine.financialStatus ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Incassato su Shopify</div>
          <div className="kpi-value">{euro(incassi.reduce((a, t) => a + t.importo, 0))}</div>
          <div className="kpi-sub">
            {rimborsi.length > 0 ? `− ${euro(rimborsi.reduce((a, t) => a + t.importo, 0))} rimborsati` : `${incassi.length} incasso/i`}
          </div>
        </div>
      </div>

      {/* ---- Transazione corrispondente ---- */}
      <h2 className="section-title">Transazione corrispondente</h2>

      {movimento ? (
        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <span className="badge green"><span className="dot" />Bonifico abbinato al movimento bancario</span>
          </div>
          <div className="info-grid">
            <div className="info-item"><div className="k">Data movimento</div><div className="v">{dataIt(movimento.data)}</div></div>
            <div className="info-item"><div className="k">Importo accreditato</div><div className="v">{euro(movimento.importo)}</div></div>
            <div className="info-item"><div className="k">Controparte</div><div className="v" style={{ fontSize: 14 }}>{movimento.controparte ?? "—"}</div></div>
            <div className="info-item"><div className="k">Fonte</div><div className="v" style={{ fontSize: 14 }}>{movimento.fonte ?? "—"}</div></div>
            <div className="info-item full"><div className="k">Descrizione</div><div className="v" style={{ fontSize: 14 }}>{movimento.descrizione}</div></div>
          </div>
          {Math.abs(movimento.importo - ordine.totale) > 0.01 && (
            <p style={{ fontSize: 13, color: "var(--orange)", marginTop: 12 }}>
              L&apos;importo del movimento ({euro(movimento.importo)}) non coincide con il totale ordine ({euro(ordine.totale)}): differenza {euro(movimento.importo - ordine.totale)}.
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <Link href={`/transazioni?q=${encodeURIComponent(movimento.controparte ?? movimento.descrizione.slice(0, 20))}`} className="btn secondary small">
              Apri nei movimenti
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          {erroreTx ? (
            <span style={{ color: "var(--red)", fontSize: 14 }}>Non riesco a leggere le transazioni da Shopify: {erroreTx}</span>
          ) : txShopify.length === 0 ? (
            <span className="muted" style={{ fontSize: 13.5 }}>Nessuna transazione trovata su Shopify per questo ordine.</span>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                {ordine.categoriaPagamento === "carta" ? (
                  <span className="badge blue"><span className="dot" />Incassato sul gateway — arriva in banca nel payout</span>
                ) : (
                  <span className="badge neutral"><span className="dot" />Transazioni dell&apos;ordine su Shopify</span>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data e ora</th><th>Tipo</th><th>Gateway</th><th>Carta</th><th>Rif.</th><th className="num">Importo</th><th>Esito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txShopify.map((t) => (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{dataOra(t.processedAt)}</td>
                        <td>{t.kind ?? "—"}</td>
                        <td>{t.gateway ?? "—"}</td>
                        <td className="muted">{t.accountNumber ? `•••• ${t.accountNumber}` : "—"}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{t.paymentId ?? "—"}</td>
                        <td className={`num ${t.kind === "REFUND" ? "neg" : ""}`}>{t.kind === "REFUND" ? "−" : ""}{euro(t.importo)}</td>
                        <td>
                          <span className={`badge ${t.status === "SUCCESS" ? "green" : t.status === "PENDING" ? "orange" : "red"}`}>
                            <span className="dot" />{t.status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ordine.categoriaPagamento === "carta" && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
                  Questi sono gli incassi sul <strong>gateway</strong> (Shopify Payments/Stripe/PayPal…). In banca
                  <strong> non</strong> arrivano uno per uno: il gateway li versa in un <strong>payout aggregato</strong> di
                  più ordini, al netto delle commissioni. Il match 1:1 con un movimento bancario esiste solo per i bonifici.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <p style={{ marginTop: 16 }}>
        <a
          href={`https://${ordine.negozio.dominio}/admin/orders/${ordine.orderId.split("/").pop()}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--blue)", fontSize: 13.5 }}
        >
          Apri l&apos;ordine su Shopify ↗
        </a>
      </p>
    </>
  );
}
