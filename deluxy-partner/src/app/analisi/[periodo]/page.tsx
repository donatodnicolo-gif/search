import Link from "next/link";
import { notFound } from "next/navigation";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { nomeMese } from "@/lib/calc";
import {
  costruisciAnalisi,
  sommaVoci,
  etichettaPeriodo,
  CHIAVE_SENZA_SCADENZA,
  CHIAVE_PRECEDENTI,
  type VoceEntrata,
  type VoceUscita,
} from "@/lib/analisi";

export const dynamic = "force-dynamic";

// Dettaglio di UN periodo del piano di cassa: da dove viene, fattura per
// fattura e partner per partner, il numero che in /analisi è una riga sola.
// Le regole di collocazione stanno in `src/lib/analisi.ts`, condivise con
// l'elenco: qui non si ricalcola nulla, si apre soltanto.

// Le entrate aperte prima, dalla più grossa: è l'ordine in cui si lavora.
function ordina<T extends { saldata: boolean; importo: number }>(v: T[]): T[] {
  return [...v].sort((a, b) => Number(a.saldata) - Number(b.saldata) || b.importo - a.importo);
}

function StatoEntrata({ v }: { v: VoceEntrata }) {
  if (v.saldata && !v.acconto) {
    return (
      <span className="badge green">
        <span className="dot" />
        incassata{v.dataPagamento ? ` il ${dataIt(v.dataPagamento)}` : ""}
      </span>
    );
  }
  if (v.saldata && v.acconto) {
    return (
      <span className="badge blue">
        <span className="dot" />
        acconto incassato
      </span>
    );
  }
  return (
    <span className="badge orange">
      <span className="dot" />
      da incassare
    </span>
  );
}

export default async function DettaglioPeriodo({
  params,
}: {
  params: Promise<{ periodo: string }>;
}) {
  const { periodo } = await params;
  const anno = ANNO_CORRENTE;
  const etichetta = etichettaPeriodo(periodo, anno);
  if (!etichetta) notFound();

  const analisi = await costruisciAnalisi(anno);
  const indice = analisi.righe.findIndex((r) => r.chiave === periodo);
  const riga = indice >= 0 ? analisi.righe[indice] : null;

  const precedente = indice > 0 ? analisi.righe[indice - 1] : null;
  const successivo = indice >= 0 && indice < analisi.righe.length - 1 ? analisi.righe[indice + 1] : null;

  const entrate: VoceEntrata[] = riga ? ordina(riga.entrate) : [];
  const uscite: VoceUscita[] = riga ? ordina(riga.uscite) : [];

  const incassato = sommaVoci(entrate, true);
  const daIncassare = sommaVoci(entrate, false);
  const pagato = sommaVoci(uscite, true);
  const daPagare = sommaVoci(uscite, false);
  const senzaData = periodo === CHIAVE_SENZA_SCADENZA;
  const arretrato = periodo === CHIAVE_PRECEDENTI;
  const scaduto = !!riga?.passato && daIncassare >= 0.01;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/analisi" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna all&apos;analisi
          </Link>
          <h1 className="page-title">
            {etichetta}
            {scaduto && (
              <span className="badge red" style={{ marginLeft: 10, verticalAlign: "middle" }}>
                <span className="dot" />
                scaduto
              </span>
            )}
            {senzaData && (
              <span className="badge" style={{ marginLeft: 10, verticalAlign: "middle" }}>
                <span className="dot" />
                data mancante
              </span>
            )}
          </h1>
          <p className="page-caption">
            {senzaData ? (
              <>
                Le fatture <strong>aperte che non hanno una scadenza</strong>: non stanno su nessun mese del
                piano di cassa, perché non sappiamo quando incassano. Compilando la scadenza nella scheda
                della fattura, ognuna prende il suo posto nel calendario.
              </>
            ) : arretrato ? (
              <>
                L&apos;<strong>arretrato</strong>: fatture degli anni chiusi ancora aperte, più quelle già
                incassate che scadevano prima del {anno}. Sono arretrate a prescindere dal giorno esatto,
                anche quelle che la scadenza non ce l&apos;hanno.
              </>
            ) : (
              <>
                Tutto ciò che scade in questo mese, riga per riga: <strong>{entrate.length} incassi</strong>{" "}
                dalle fatture e <strong>{uscite.length} pagamenti</strong> dovuti ai partner.
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {precedente && (
            <Link href={`/analisi/${precedente.chiave}`} className="btn secondary small">
              ← {precedente.etichetta}
            </Link>
          )}
          {successivo && (
            <Link href={`/analisi/${successivo.chiave}`} className="btn secondary small">
              {successivo.etichetta} →
            </Link>
          )}
        </div>
      </div>

      {!riga && (
        <div className="card tight" style={{ marginBottom: 16 }}>
          In questo periodo non c&apos;è nessun movimento: né fatture in scadenza né dovuti ai partner.
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Entrate — incassato / da incassare</div>
          <div className="kpi-value">
            <span className="pos">{euro(incassato)}</span>
            <span className="muted" style={{ fontSize: 16 }}> / {euro(daIncassare)}</span>
          </div>
          <div className="kpi-sub">
            {entrate.filter((v) => !v.saldata).length} fatture ancora aperte su {entrate.length} voci
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Uscite — pagato / da pagare</div>
          <div className="kpi-value">
            <span>{euro(pagato)}</span>
            <span className="neg" style={{ fontSize: 16 }}> / {euro(daPagare)}</span>
          </div>
          <div className="kpi-sub">
            {uscite.filter((v) => !v.saldata).length} partner ancora da pagare su {uscite.length} voci
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Differenza aperta</div>
          <div className={`kpi-value ${daIncassare - daPagare >= 0 ? "pos" : "neg"}`}>
            {daIncassare - daPagare >= 0 ? "+" : ""}
            {euro(daIncassare - daPagare)}
          </div>
          <div className="kpi-sub">quanto resta da incassare meno quanto resta da pagare</div>
        </div>
      </div>

      <h2 className="section-title">
        Entrate — fatture {senzaData ? "senza scadenza" : arretrato ? "arretrate" : "in scadenza"}
      </h2>
      <div className="card tight" style={{ marginBottom: 24 }}>
        {entrate.length === 0 ? (
          <p className="muted" style={{ padding: "12px 20px 18px", fontSize: 13 }}>
            Nessuna fattura in questo periodo.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Fattura</th>
                  <th>Tipologia</th>
                  <th>Competenza</th>
                  <th>Emissione</th>
                  <th>Scadenza</th>
                  <th className="num">Totale fattura</th>
                  <th className="num">Quota su questo periodo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {entrate.map((v, i) => (
                  <tr key={`e${i}`} style={{ opacity: v.saldata ? 0.72 : 1 }}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>
                    </td>
                    <td>
                      <Link href={v.href}>{v.numero ?? "s.n."}</Link>
                    </td>
                    <td className="muted">{v.tipologia ?? "—"}</td>
                    <td className="muted">
                      {nomeMese(v.meseCompetenza)} {v.annoCompetenza}
                    </td>
                    <td className="muted">{v.emissione ? dataIt(v.emissione) : "—"}</td>
                    <td>
                      {v.scadenza ? (
                        dataIt(v.scadenza)
                      ) : (
                        <Link href={v.href} className="muted" title="Compila la scadenza nella scheda della fattura">
                          non indicata →
                        </Link>
                      )}
                    </td>
                    <td className="num muted">{euro(v.totale)}</td>
                    <td className="num" style={{ fontWeight: v.saldata ? 400 : 600 }}>
                      {euro(v.importo)}
                    </td>
                    <td>
                      <StatoEntrata v={v} />
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                  <td colSpan={7}>Totale entrate</td>
                  <td className="num">{euro(incassato + daIncassare)}</td>
                  <td className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                    {euro(incassato)} incassati · {euro(daIncassare)} aperti
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Uscite — dovuto ai partner</h2>
      <div className="card tight">
        {uscite.length === 0 ? (
          <p className="muted" style={{ padding: "12px 20px 18px", fontSize: 13 }}>
            Nessun dovuto ai partner con competenza in questo periodo.
            {senzaData && " Le uscite hanno sempre un mese: qui finiscono solo le fatture senza scadenza."}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Mese di competenza</th>
                  <th className="num">Dovuto vendite</th>
                  <th className="num">Aggiunte</th>
                  <th className="num">Detrazioni</th>
                  <th className="num">Importo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {uscite.map((v, i) => (
                  <tr key={`u${i}`} style={{ opacity: v.saldata ? 0.72 : 1 }}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>
                      {v.compensazione && (
                        <span className="badge neutral" style={{ marginLeft: 8 }}>
                          <span className="dot" />
                          in compensazione
                        </span>
                      )}
                    </td>
                    <td className="muted">
                      <Link href={v.href} title="Apri il mese nella scheda partner">
                        {nomeMese(v.mese)} {v.anno} →
                      </Link>
                    </td>
                    <td className="num muted">{euro(v.dovutoVendite)}</td>
                    <td className="num muted">{v.aggiunte >= 0.01 ? euro(v.aggiunte) : "—"}</td>
                    <td className="num muted">{v.detrazioni >= 0.01 ? euro(v.detrazioni) : "—"}</td>
                    <td className="num" style={{ fontWeight: v.saldata ? 400 : 600 }}>
                      {euro(v.importo)}
                    </td>
                    <td>
                      {v.saldata ? (
                        <span className="badge green">
                          <span className="dot" />
                          bonifico inviato
                        </span>
                      ) : (
                        <span className="badge orange">
                          <span className="dot" />
                          da pagare
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                  <td colSpan={5}>Totale uscite</td>
                  <td className="num">{euro(pagato + daPagare)}</td>
                  <td className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                    {euro(pagato)} pagati · {euro(daPagare)} aperti
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        La <strong>quota su questo periodo</strong> è la parte della fattura che cade qui: per una
        fattura saldata è l&apos;incasso, per una aperta è il <strong>residuo</strong>. Una fattura con
        un acconto compare due volte — l&apos;acconto fra gli incassi, il residuo fra gli aperti — e le
        due quote sommate fanno il totale della fattura. Le fatture segnate <strong>compensate</strong>{" "}
        non sono qui: non entrano in banca, si chiudono compensando il dovuto al partner.{" "}
        {senzaData
          ? "Compilando la scadenza, la fattura esce da questa pagina ed entra nel mese giusto."
          : "Le uscite sono collocate sul mese di competenza del dovuto, non su una data di pagamento."}
      </p>
    </>
  );
}
