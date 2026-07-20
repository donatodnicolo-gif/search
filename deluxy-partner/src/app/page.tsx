import Link from "next/link";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { nomeMese } from "@/lib/calc";
import { registraBonifico } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const anno = ANNO_CORRENTE;
  const tutti = await riepilogoTutti(anno);
  const oggi = new Date();

  const totVendite = tutti.reduce((a, t) => a + t.rolling.vendite, 0);
  const totCommissioni = tutti.reduce((a, t) => a + t.rolling.commissioni, 0);
  const totServizi = tutti.reduce((a, t) => a + t.rolling.fatture, 0);
  const stima = tutti.reduce((a, t) => a + t.rolling.stimaChiusura, 0);

  // Fatture servizi non pagate e scadute
  const fattureAperte = await prisma.fatturaServizio.findMany({
    where: { anno, pagata: false, imponibile: { gt: 0 } },
    include: { partner: true, tipologia: true },
    orderBy: { scadenza: "asc" },
  });
  const scadute = fattureAperte.filter((f) => f.scadenza && f.scadenza < oggi);
  const totScaduto = scadute.reduce((a, f) => a + f.imponibile * (1 + f.aliquotaIva / 100), 0);

  // Mesi con partite aperte. Per i partner senza compensazione le due direzioni
  // sono indipendenti: lo stesso mese puo' avere sia da bonificare sia da incassare.
  const mesiPartner = tutti.flatMap((t) =>
    t.mesi.map((m) => ({ partner: t.partner, mese: m.mese, r: m.riepilogo }))
  );
  const daPagareAiPartner = mesiPartner
    .filter((x) => x.r.daBonificare >= 0.01)
    .sort((a, b) => b.r.daBonificare - a.r.daBonificare);
  const daIncassareRighe = mesiPartner
    .filter((x) => x.r.daIncassare >= 0.01)
    .sort((a, b) => b.r.daIncassare - a.r.daIncassare);
  const totDaPagare = daPagareAiPartner.reduce((a, x) => a + x.r.daBonificare, 0);
  const totDaIncassare = daIncassareRighe.reduce((a, x) => a + x.r.daIncassare, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-caption">
            Situazione finanziaria partner {anno} — rolling, incassi e bonifici da gestire.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/fatture/nuova" className="btn secondary">+ Fattura servizi</Link>
          <Link href="/vendite/nuova" className="btn primary">+ Vendita vendor</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite come vendor (YTD)</div>
          <div className="kpi-value">{euro(totVendite)}</div>
          <div className="kpi-sub">Commissioni {euro(totCommissioni)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Servizi fatturati (YTD, netto IVA)</div>
          <div className="kpi-value">{euro(totServizi)}</div>
          <div className="kpi-sub">Stima chiusura anno {euro(stima)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da incassare dai partner</div>
          <div className="kpi-value neg">{euro(totDaIncassare)}</div>
          <div className="kpi-sub">{daIncassareRighe.length} mesi partner aperti · scaduto {euro(totScaduto)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bonifici da fare ai partner</div>
          <div className="kpi-value neg">{euro(totDaPagare)}</div>
          <div className="kpi-sub">{daPagareAiPartner.length} mesi partner da saldare</div>
        </div>
      </div>

      <h2 className="section-title">Bonifici da fare ai partner</h2>
      <div className="card tight">
        {daPagareAiPartner.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Nessun bonifico in sospeso</div>
            <div className="empty-text">Tutti i saldi partner sono pareggiati.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Mese</th>
                  <th className="num">Dovuto al partner</th>
                  <th className="num">Già bonificato</th>
                  <th className="num">Residuo da pagare</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {daPagareAiPartner.slice(0, 12).map((x) => (
                  <tr key={x.partner.id + x.mese}>
                    <td><Link href={`/partner/${x.partner.id}`}>{x.partner.nome}</Link></td>
                    <td>{nomeMese(x.mese)}</td>
                    <td className="num">{euro(x.r.dovutoPartner)}</td>
                    <td className="num">{euro(x.r.bonificoInviato)}</td>
                    <td className="num neg">{euro(x.r.daBonificare)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        <Link className="btn small secondary" href={`/partner/${x.partner.id}`}>
                          Gestisci
                        </Link>
                        <form
                          action={registraBonifico.bind(
                            null,
                            x.partner.id,
                            anno,
                            x.mese,
                            +x.r.daBonificare.toFixed(2),
                            undefined
                          )}
                        >
                          <button
                            className="btn small primary"
                            type="submit"
                            title={`Registra bonifico di ${euro(x.r.daBonificare)} con data odierna (il mese risulterà pareggiato)`}
                          >
                            Paga
                          </button>
                        </form>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Fatture scadute da incassare</h2>
      <div className="card tight">
        {scadute.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Nessuna fattura scaduta</div>
            <div className="empty-text">Le fatture servizi risultano nei termini.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>N° fattura</th>
                  <th>Tipologia</th>
                  <th>Scadenza</th>
                  <th className="num">Importo (IVA incl.)</th>
                </tr>
              </thead>
              <tbody>
                {scadute.slice(0, 12).map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/partner/${f.partnerId}`}>{f.partner.nome}</Link></td>
                    <td>{f.numero ?? "—"}</td>
                    <td>{f.tipologia.nome}</td>
                    <td><span className="badge red"><span className="dot" />{dataIt(f.scadenza)}</span></td>
                    <td className="num">{euro(f.imponibile * (1 + f.aliquotaIva / 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
