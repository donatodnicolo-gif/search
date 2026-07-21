import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { STATI_ORDINE, CATEGORIE_PAG, suggerisciMovimenti } from "@/lib/ordini";
import {
  sincronizzaOrdini,
  riconciliaOrdine,
  segnaOrdineIncassato,
  ignoraOrdine,
  riapriOrdine,
} from "@/lib/ordini-actions";

export const dynamic = "force-dynamic";

export default async function OrdiniPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; nuovi?: string; agg?: string; errori?: string; negozio?: string; stato?: string; cat?: string }>;
}) {
  const sp = await searchParams;

  const [negozi, ordiniRaw, movimenti] = await Promise.all([
    prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } }),
    prisma.ordineShopify.findMany({
      where: {
        ...(sp.negozio ? { negozioId: sp.negozio } : {}),
        ...(sp.stato ? { statoRicon: sp.stato } : {}),
        ...(sp.cat ? { categoriaPagamento: sp.cat } : {}),
      },
      orderBy: [{ data: "desc" }],
      take: 400,
    }),
    // accrediti bancari disponibili per l'abbinamento dei bonifici
    prisma.transazioneBancaria.findMany({ where: { importo: { gt: 0 } }, orderBy: { data: "desc" }, take: 1000 }),
  ]);

  const giaAbbinati = new Set(
    (await prisma.ordineShopify.findMany({ where: { transazioneId: { not: null } }, select: { transazioneId: true } }))
      .map((o) => o.transazioneId!)
  );

  // KPI
  const daRic = ordiniRaw.filter((o) => o.statoRicon === "da_riconciliare");
  const bonificoDaRic = daRic.filter((o) => o.categoriaPagamento === "bonifico");
  const gateway = ordiniRaw.filter((o) => o.statoRicon === "incassato_gateway");
  const totOrdini = ordiniRaw.reduce((a, o) => a + o.totale, 0);

  const nomeNegozio = (id: string) => negozi.find((n) => n.id === id)?.brand ?? "—";
  const senzaToken = negozi.filter((n) => !n.token);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-caption">
            Ordini dei negozi Shopify, riconciliati con gli incassi: i <strong>bonifici</strong> abbinati 1:1 ai
            movimenti Qonto/Vivid, gli ordini a <strong>carta</strong> incassati via gateway.
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {negozi.length > 0 && (
            <form action={sincronizzaOrdini.bind(null, 90)}>
              <button className="btn primary" type="submit" title="Scarica gli ordini degli ultimi 90 giorni da tutti i negozi">
                ⇅ Scarica ordini
              </button>
            </form>
          )}
        </div>
      </div>

      {negozi.length === 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <span className="badge orange"><span className="dot" />Nessun negozio Shopify collegato</span>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 10 }}>
            Aggiungi i tuoi negozi in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Negozi Shopify</Link>{" "}
            (dominio .myshopify.com + token Admin API), poi torna qui e premi &laquo;Scarica ordini&raquo;.
          </p>
        </div>
      )}
      {senzaToken.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 16, background: "rgba(201,52,0,0.07)" }}>
          <span style={{ fontSize: 13, color: "var(--orange)" }}>
            ⚠︎ Negozi senza token (non scaricabili): {senzaToken.map((n) => n.brand).join(", ")} —{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>completali</Link>.
          </span>
        </div>
      )}
      {sp.sync === "ok" && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Sync completata — {sp.nuovi} nuovi, {sp.agg} aggiornati</span>
          {sp.errori && <p style={{ fontSize: 13, color: "var(--red)", marginTop: 8 }}>Errori: {sp.errori}</p>}
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Ordini (periodo)</div>
          <div className="kpi-value">{ordiniRaw.length}</div>
          <div className="kpi-sub">{euro(totOrdini)} totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bonifici da riconciliare</div>
          <div className={`kpi-value ${bonificoDaRic.length ? "neg" : "pos"}`}>{bonificoDaRic.length}</div>
          <div className="kpi-sub">{euro(bonificoDaRic.reduce((a, o) => a + o.totale, 0))} da abbinare ai movimenti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Incassati via gateway</div>
          <div className="kpi-value">{gateway.length}</div>
          <div className="kpi-sub">{euro(gateway.reduce((a, o) => a + o.totale, 0))} (payout carta)</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="negozio" defaultValue={sp.negozio ?? ""}>
            <option value="">Tutti i negozi</option>
            {negozi.map((n) => <option key={n.id} value={n.id}>{n.brand}</option>)}
          </select>
          <select name="cat" defaultValue={sp.cat ?? ""}>
            <option value="">Tutti i pagamenti</option>
            {Object.entries(CATEGORIE_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI_ORDINE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {ordiniRaw.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun ordine</div>
            <div className="empty-text">
              {negozi.length === 0 ? "Collega i negozi e scarica gli ordini." : "Premi «Scarica ordini» o cambia i filtri."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th><th>Negozio</th><th>Data</th><th>Cliente</th>
                  <th>Pagamento</th><th className="num">Totale</th><th>Stato</th><th></th>
                </tr>
              </thead>
              <tbody>
                {ordiniRaw.map((o) => {
                  const st = STATI_ORDINE[o.statoRicon] ?? STATI_ORDINE.da_riconciliare;
                  const proposti =
                    o.statoRicon === "da_riconciliare" && o.categoriaPagamento === "bonifico"
                      ? suggerisciMovimenti(o, movimenti, giaAbbinati).slice(0, 3)
                      : [];
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>{o.nome}</td>
                      <td style={{ fontSize: 12.5 }}>{nomeNegozio(o.negozioId)}</td>
                      <td>{dataIt(o.data)}</td>
                      <td style={{ fontSize: 12.5 }}>{o.clienteNome ?? o.clienteEmail ?? "—"}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {CATEGORIE_PAG[o.categoriaPagamento]}
                        {o.financialStatus ? <div style={{ color: "var(--text-tertiary)" }}>{o.financialStatus}</div> : null}
                      </td>
                      <td className="num">{euro(o.totale)}</td>
                      <td><span className={`badge ${st.badge}`}><span className="dot" />{st.label}</span></td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        {o.statoRicon === "da_riconciliare" ? (
                          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {proposti.map(({ tx, forte }) => (
                              <form key={tx.id} action={riconciliaOrdine.bind(null, o.id, tx.id)} style={{ display: "inline" }}>
                                <button
                                  className={`btn small ${forte ? "primary" : "secondary"}`}
                                  type="submit"
                                  title={`${tx.descrizione} · ${dataIt(tx.data)}`}
                                >
                                  Abbina {euro(tx.importo)}{forte ? " ✓" : ""}
                                </button>
                              </form>
                            ))}
                            <form action={segnaOrdineIncassato.bind(null, o.id)} style={{ display: "inline" }}>
                              <button className="btn small secondary" type="submit" title="Segna incassato senza abbinare un movimento">Incassato</button>
                            </form>
                            <form action={ignoraOrdine.bind(null, o.id)} style={{ display: "inline" }}>
                              <button className="btn small secondary" type="submit">Ignora</button>
                            </form>
                          </span>
                        ) : (
                          <form action={riapriOrdine.bind(null, o.id)} style={{ display: "inline" }}>
                            <button className="btn small secondary" type="submit">Riapri</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
