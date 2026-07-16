import Link from "next/link";
import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { nomeMese, ivato } from "@/lib/calc";
import { segnaFatturaPagata } from "@/lib/actions";

export const dynamic = "force-dynamic";

// Scadenzario: tutto ciò che è in sospeso, ordinato per urgenza.
export default async function Scadenzario() {
  const anno = ANNO_CORRENTE;
  const oggi = new Date();

  const aperte = await prisma.fatturaServizio.findMany({
    where: { anno, pagata: false, imponibile: { gt: 0 } },
    include: { partner: true, tipologia: true },
    orderBy: [{ scadenza: "asc" }],
  });
  const scadute = aperte.filter((f) => f.scadenza && f.scadenza < oggi);
  const inScadenza = aperte.filter((f) => !f.scadenza || f.scadenza >= oggi);

  const tutti = await riepilogoTutti(anno);
  const bonificiPendenti = tutti
    .flatMap((t) =>
      t.mesi
        .filter((m) => m.riepilogo.residuo < -0.01 && (m.riepilogo.vendite || m.riepilogo.serviziNetto))
        .map((m) => ({ partner: t.partner, mese: m.mese, r: m.riepilogo }))
    )
    .sort((a, b) => a.mese - b.mese || a.r.residuo - b.r.residuo);

  const commDaEmettere = tutti.flatMap((t) =>
    t.mesi
      .filter((m) => m.riepilogo.vendite > 0 && !m.saldo?.commFattEmessa)
      .map((m) => ({ partner: t.partner, mese: m.mese, r: m.riepilogo }))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Scadenzario</h1>
          <p className="page-caption">
            Fatture da incassare, bonifici da inviare e fatture commissioni da emettere.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Fatture scadute</div>
          <div className={`kpi-value ${scadute.length ? "neg" : "pos"}`}>{scadute.length}</div>
          <div className="kpi-sub">{euro(scadute.reduce((a, f) => a + ivato(f), 0))} IVA inclusa</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bonifici partner pendenti</div>
          <div className={`kpi-value ${bonificiPendenti.length ? "neg" : "pos"}`}>{bonificiPendenti.length}</div>
          <div className="kpi-sub">{euro(bonificiPendenti.reduce((a, x) => a + -x.r.residuo, 0))}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Fatture commissioni da emettere</div>
          <div className={`kpi-value ${commDaEmettere.length ? "neg" : "pos"}`}>{commDaEmettere.length}</div>
          <div className="kpi-sub">{euro(commDaEmettere.reduce((a, x) => a + x.r.commissioni, 0))} di commissioni</div>
        </div>
      </div>

      <h2 className="section-title">Fatture servizi da incassare</h2>
      <div className="card tight">
        {aperte.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Tutto incassato</div>
            <div className="empty-text">Non ci sono fatture servizi aperte.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th><th>Mese</th><th>N°</th><th>Tipologia</th>
                  <th>Scadenza</th><th className="num">IVA incl.</th><th></th>
                </tr>
              </thead>
              <tbody>
                {[...scadute, ...inScadenza].map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/partner/${f.partnerId}`} style={{ fontWeight: 500 }}>{f.partner.nome}</Link></td>
                    <td>{nomeMese(f.mese)}</td>
                    <td>{f.numero ?? "—"}</td>
                    <td>{f.tipologia.nome}</td>
                    <td>
                      {f.scadenza && f.scadenza < oggi ? (
                        <span className="badge red"><span className="dot" />{dataIt(f.scadenza)}</span>
                      ) : (
                        <span className="badge blue"><span className="dot" />{dataIt(f.scadenza)}</span>
                      )}
                    </td>
                    <td className="num">{euro(ivato(f))}</td>
                    <td>
                      <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)}>
                        <button className="btn small secondary" type="submit">Segna saldata</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Bonifici da inviare ai partner</h2>
      <div className="card tight">
        {bonificiPendenti.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Nessun bonifico pendente</div>
            <div className="empty-text">Tutti i dovuti ai partner risultano saldati.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th><th>Mese</th>
                  <th className="num">Residuo da bonificare</th>
                  <th>IBAN</th><th></th>
                </tr>
              </thead>
              <tbody>
                {bonificiPendenti.map((x) => (
                  <tr key={x.partner.id + x.mese}>
                    <td><Link href={`/partner/${x.partner.id}`} style={{ fontWeight: 500 }}>{x.partner.nome}</Link></td>
                    <td>{nomeMese(x.mese)}</td>
                    <td className="num neg">{euro(-x.r.residuo)}</td>
                    <td className="muted">{x.partner.iban ?? "IBAN mancante"}</td>
                    <td>
                      <Link className="btn small secondary" href={`/saldi?anno=${anno}&mese=${x.mese}&q=${encodeURIComponent(x.partner.nome.slice(0, 12))}`}>
                        Registra bonifico
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Fatture commissioni da emettere</h2>
      <div className="card tight">
        {commDaEmettere.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Nessuna fattura commissioni in sospeso</div>
            <div className="empty-text">Tutte le vendite del periodo hanno la fattura commissioni emessa.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th><th>Mese</th>
                  <th className="num">Vendite</th>
                  <th className="num">Commissioni da fatturare</th><th></th>
                </tr>
              </thead>
              <tbody>
                {commDaEmettere.map((x) => (
                  <tr key={x.partner.id + x.mese}>
                    <td><Link href={`/partner/${x.partner.id}`} style={{ fontWeight: 500 }}>{x.partner.nome}</Link></td>
                    <td>{nomeMese(x.mese)}</td>
                    <td className="num">{euro(x.r.vendite)}</td>
                    <td className="num">{euro(x.r.commissioni)}</td>
                    <td>
                      <Link className="btn small secondary" href={`/saldi?anno=${anno}&mese=${x.mese}&q=${encodeURIComponent(x.partner.nome.slice(0, 12))}`}>
                        Gestisci
                      </Link>
                    </td>
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
