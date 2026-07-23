import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { ANNO_CORRENTE } from "@/lib/queries";
import { ficStato, ficFattureCached, ficSegnaFatturaPagata, FicError, type FicFattura } from "@/lib/fic";

export const dynamic = "force-dynamic";

// Cambia lo stato di incasso di una fattura direttamente su Fatture in Cloud
// (saldata ↔ da incassare), senza aprire FIC.
async function cambiaStatoFattura(id: number, pagata: boolean) {
  "use server";
  try {
    await ficSegnaFatturaPagata(id, pagata);
  } catch (e) {
    redirect("/registrazioni/fatture?errore=" + encodeURIComponent((e as Error).message));
  }
  revalidatePath("/registrazioni/fatture", "layout");
  redirect(`/registrazioni/fatture?statoOk=${pagata ? "saldata" : "daincassare"}`);
}

// Elenco delle fatture VERE emesse su Fatture in Cloud (fonte: FIC, non il DB
// locale). Da qui si aprono i documenti su Fatture in Cloud e si vede lo stato
// di incasso. La creazione avviene da pro-forma o fattura servizi (/fic/fattura).
export default async function FattureCloudPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; q?: string; emessa?: string; errore?: string; statoOk?: string; servizio?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;
  const q = (sp.q ?? "").trim();

  const stato = await ficStato();
  let fatture: FicFattura[] = [];
  let errore: string | null = null;
  if (stato.collegato) {
    try {
      fatture = await ficFattureCached({ anno, q: q || undefined });
    } catch (e) {
      // il rate limit di FIC è temporaneo: dirlo in italiano invece di
      // sbattere in faccia la URL della chiamata
      errore =
        e instanceof FicError && e.troppeRichieste
          ? "Fatture in Cloud ha momentaneamente limitato le richieste (troppe in poco tempo). Riprova fra un minuto: i dati sono lì, è solo il limite delle API."
          : (e as Error).message;
    }
  }

  const totImponibile = fatture.reduce((a, f) => a + f.imponibile, 0);
  const totLordo = fatture.reduce((a, f) => a + f.totale, 0);
  const daIncassare = fatture.filter((f) => !f.pagata).reduce((a, f) => a + f.totale, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Fatture</h1>
          <p className="page-caption">
            Fatture emesse su <strong>Fatture in Cloud</strong>. Per crearne una vai su una pro-forma o su una
            fattura servizi e usa &laquo;Emetti su FIC&raquo;.
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {stato.collegato && stato.companyName && (
            <span className="badge green"><span className="dot" />{stato.companyName}</span>
          )}
          {stato.collegato && (
            <Link href="/registrazioni/fatture/nuova" className="btn primary">+ Nuova fattura</Link>
          )}
        </div>
      </div>

      {sp.emessa && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />Fattura emessa — n. {decodeURIComponent(sp.emessa)}
            {sp.servizio ? " · registrata come servizio del partner (entra nei conteggi)" : ""}
            {" "}(non inviata allo SDI: controllala e inviala da Fatture in Cloud)
          </span>
        </div>
      )}
      {sp.statoOk && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Stato aggiornato su Fatture in Cloud: fattura {sp.statoOk === "saldata" ? "segnata saldata" : "riportata da incassare"}</span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      {!stato.collegato ? (
        <div className="card" style={{ padding: 18 }}>
          <span className="badge orange"><span className="dot" />Fatture in Cloud non collegato</span>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 10 }}>
            Collega l&apos;account in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Fatture in Cloud</Link>{" "}
            per vedere qui l&apos;elenco delle fatture emesse.
          </p>
        </div>
      ) : errore ? (
        <div className="card" style={{ padding: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>Errore nel leggere le fatture: {errore}</span>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Fatturato {anno} (imponibile)</div>
              <div className="kpi-value">{euro(totImponibile)}</div>
              <div className="kpi-sub">{fatture.length} fatture · {euro(totLordo)} IVA inclusa</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Da incassare</div>
              <div className={`kpi-value ${daIncassare > 0 ? "neg" : "pos"}`}>{euro(daIncassare)}</div>
              <div className="kpi-sub">{fatture.filter((f) => !f.pagata).length} fatture non saldate</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <form className="filters" method="get">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Cerca cliente o numero…"
                style={{ minWidth: 240, flex: "1 1 240px" }}
              />
              <input type="number" name="anno" defaultValue={anno} step="1" style={{ width: 100 }} aria-label="Anno" />
              <button className="btn secondary small" type="submit">Filtra</button>
              {(q || anno !== ANNO_CORRENTE) && (
                <Link className="btn secondary small" href="/registrazioni/fatture">Azzera</Link>
              )}
            </form>
          </div>

          <div className="card tight">
            {fatture.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">◎</div>
                <div className="empty-title">Nessuna fattura</div>
                <div className="empty-text">
                  {q ? "Nessuna fattura corrisponde alla ricerca." : `Nessuna fattura emessa su Fatture in Cloud nel ${anno}.`}
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N° fattura</th><th>Data</th><th>Cliente</th>
                      <th className="num">Imponibile</th><th className="num">IVA incl.</th>
                      <th>Stato</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fatture.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 500 }}>{f.numero}</td>
                        <td>{dataIt(f.data)}</td>
                        <td>{f.cliente}</td>
                        <td className="num">{euro(f.imponibile)}</td>
                        <td className="num">{euro(f.totale)}</td>
                        <td>
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {f.pagata ? (
                              <span className="badge green"><span className="dot" />Saldata</span>
                            ) : (
                              <span className="badge orange"><span className="dot" />Da incassare</span>
                            )}
                            {!f.pagata && f.scadenza && (
                              <span className="muted" style={{ fontSize: 12 }}>scad. {dataIt(f.scadenza)}</span>
                            )}
                            <form action={cambiaStatoFattura.bind(null, f.id, !f.pagata)} style={{ display: "inline" }}>
                              <button
                                className="btn small secondary"
                                type="submit"
                                title={f.pagata ? "Segna come da incassare (su Fatture in Cloud)" : "Segna come saldata (su Fatture in Cloud)"}
                              >
                                {f.pagata ? "Riapri" : "Segna saldata"}
                              </button>
                            </form>
                          </span>
                        </td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          {/* Apri il DOCUMENTO nell'app Fatture in Cloud (se già
                              inviata è in sola lettura, altrimenti modificabile/inviabile).
                              Il PDF resta a portata come link separato. */}
                          <a
                            className="btn small secondary"
                            href={`https://secure.fattureincloud.it/invoices/view/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginRight: 6 }}
                            title="Apri la fattura in Fatture in Cloud"
                          >
                            Apri su FIC
                          </a>
                          {f.urlDettaglio && (
                            <a
                              href={f.urlDettaglio}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 12.5, color: "var(--blue)" }}
                              title="Apri il PDF della fattura"
                            >
                              PDF
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
