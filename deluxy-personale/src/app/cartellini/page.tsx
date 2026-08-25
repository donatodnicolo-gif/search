import { inviaReportPresenze } from "@/lib/azioni";
import { dataIt } from "@/lib/formato";
import { hubConfigurato, presenzeDalHub, type RigaPresenzeHub } from "@/lib/presenze-hub";
import { postaConfigurata } from "@/lib/posta";

// I cartellini del mese, letti dal Hub (che li possiede: là si timbra), con
// l'invio del rapporto al commercialista per le buste paga. Il rapporto lo
// impagina il Hub stesso: qui si sceglie mese, destinatario e nota.

export const dynamic = "force-dynamic";

function meseCorrente(): string {
  // "en-CA" dà YYYY-MM-DD: i primi 7 caratteri sono il mese, in ora di Roma.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date()).slice(0, 7);
}

function mesePrima(mese: string): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function meseDopo(mese: string): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return d.toISOString().slice(0, 7);
}

function ore(minuti: number): string {
  return `${Math.floor(minuti / 60)}h ${String(minuti % 60).padStart(2, "0")}m`;
}

function etichettaAssenze(r: RigaPresenzeHub): string {
  if (r.assenze.length === 0) return "—";
  const perTipo = new Map<string, number>();
  for (const a of r.assenze) perTipo.set(a.tipo, (perTipo.get(a.tipo) ?? 0) + a.giorniNelMese);
  return [...perTipo.entries()].map(([tipo, giorni]) => `${tipo} ${giorni}g`).join(" · ");
}

export default async function PaginaCartellini({
  searchParams,
}: {
  searchParams: Promise<{ mese?: string; nota?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const mese = /^\d{4}-\d{2}$/.test(sp.mese ?? "") ? sp.mese! : meseCorrente();
  const presenze = hubConfigurato()
    ? await presenzeDalHub(mese)
    : ({ ok: false, messaggio: "HUB_KEYS_TOKEN non impostato: senza token del Hub i cartellini non si leggono." } as const);
  const posta = postaConfigurata();
  const destinatarioPredefinito = process.env.COMMERCIALISTA_EMAIL ?? "";

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Cartellini</h1>
          <p className="page-sub">
            Timbrature e assenze del mese, lette dal Hub (dove si timbra). Da qui il rapporto parte
            via mail al commercialista per le buste paga — con gli stessi numeri del Cartellino.
          </p>
        </div>
        <div className="page-azioni">
          <a className="btn ghost" href={`/cartellini?mese=${mesePrima(mese)}`}>
            ← {mesePrima(mese)}
          </a>
          <span className="badge">
            <span className="dot" />
            {presenze.ok ? presenze.dati.riepilogo.etichettaMese : mese}
          </span>
          {mese < meseCorrente() && (
            <a className="btn ghost" href={`/cartellini?mese=${meseDopo(mese)}`}>
              {meseDopo(mese)} →
            </a>
          )}
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}
      {sp.nota && <div className="avviso-nota">{sp.nota}</div>}

      {!presenze.ok ? (
        <div className="card vuoto">
          <div className="vuoto-icona">🕐</div>
          <div className="vuoto-titolo">Cartellini non raggiungibili</div>
          <div className="vuoto-testo">{presenze.messaggio}</div>
        </div>
      ) : (
        <>
          <div className="kpi-riga">
            <div className="kpi">
              <div className="kpi-nome">Ore timbrate nel mese</div>
              <div className="kpi-valore">{ore(presenze.dati.riepilogo.totaleMinuti)}</div>
              <div className="kpi-nota">tutte le persone del Hub</div>
            </div>
            <div className="kpi">
              <div className="kpi-nome">Persone nel cartellino</div>
              <div className="kpi-valore">{presenze.dati.riepilogo.righe.length}</div>
              <div className="kpi-nota"> </div>
            </div>
            <div className="kpi">
              <div className="kpi-nome">Giorni di assenza</div>
              <div className="kpi-valore">
                {presenze.dati.riepilogo.righe.reduce((s, r) => s + r.giorniAssenza, 0)}
              </div>
              <div className="kpi-nota">ferie, permessi, malattie, trasferte</div>
            </div>
          </div>

          <div className="tabella-card">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th className="num">Ore</th>
                  <th className="num">Giornate timbrate</th>
                  <th>Assenze</th>
                  <th>Dettaglio</th>
                </tr>
              </thead>
              <tbody>
                {presenze.dati.riepilogo.righe.map((r) => (
                  <tr key={r.email}>
                    <td>
                      <span className="link-nome">{r.nome}</span>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>{r.email}</td>
                    <td className="num">{ore(r.minuti)}</td>
                    <td className="num">{r.giornate.length}</td>
                    <td>{etichettaAssenze(r)}</td>
                    <td>
                      {r.giornate.length === 0 && r.assenze.length === 0 ? (
                        <span className="cella-vuota">—</span>
                      ) : (
                        <details className="modifica-inline">
                          <summary>giorno per giorno</summary>
                          <div style={{ marginTop: 10, padding: 12, background: "var(--fill)", borderRadius: "var(--radius-m)" }}>
                            {r.giornate.map((g) => (
                              <div key={g.giorno} style={{ fontSize: 13, display: "flex", gap: 8, padding: "2px 0" }}>
                                <span style={{ fontVariantNumeric: "tabular-nums" }}>{g.giorno}</span>
                                <span>{ore(g.minuti)}</span>
                                {g.aperto && (
                                  <span className="badge arancio">
                                    <span className="dot" />
                                    turno aperto
                                  </span>
                                )}
                                {g.conManuali && <span className="attivita-freq">(con righe a mano)</span>}
                              </div>
                            ))}
                            {r.assenze.map((a, i) => (
                              <div key={i} style={{ fontSize: 13, display: "flex", gap: 8, padding: "2px 0", color: "var(--text-secondary)" }}>
                                <span>{a.tipo}</span>
                                <span>
                                  {dataIt(new Date(a.dal))} → {dataIt(new Date(a.al))}
                                </span>
                                <span>({a.giorniNelMese}g nel mese · {a.stato})</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="riga-totale">
                  <td colSpan={2}>Totale</td>
                  <td className="num">{ore(presenze.dati.riepilogo.totaleMinuti)}</td>
                  <td className="num">{presenze.dati.riepilogo.righe.reduce((s, r) => s + r.giornate.length, 0)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---------- Invio al commercialista ---------- */}
          <div className="card">
            <div className="card-testa">
              <div>
                <h2 className="card-titolo">Invia il rapporto al commercialista</h2>
                <p className="card-sub">
                  Parte via AI Mail dalla casella aziendale (copia negli «Inviati»): oggetto, testo e
                  versione impaginata li prepara il Hub — gli stessi numeri qui sopra.
                </p>
              </div>
            </div>

            {!posta.pronta && (
              <div className="avviso-nota">
                Invio non ancora configurato: manca {posta.manca.join(" e ")} nelle variabili di
                questa app. Il token si copia da AI Mail → Impostazioni App → «Token API di AI
                Mail»; MAIL_UTENTE è l&apos;email della casella da cui spedire.
              </div>
            )}

            <form action={inviaReportPresenze} className="form-inline">
              <input type="hidden" name="mese" value={mese} />
              <div className="campo">
                <label>Email del commercialista *</label>
                <input
                  type="email"
                  name="destinatario"
                  required
                  defaultValue={destinatarioPredefinito}
                  placeholder="studio@commercialista.it"
                />
              </div>
              <div className="campo" style={{ flex: 2 }}>
                <label>Nota in testa al rapporto (facoltativa)</label>
                <input type="text" name="nota" placeholder="Es. per le buste paga di {mese}: straordinari già inclusi" />
              </div>
              <button className="btn" type="submit">
                Invia il rapporto
              </button>
            </form>

            <details className="modifica-inline" style={{ marginTop: 12 }}>
              <summary>anteprima del testo che parte</summary>
              <pre
                style={{
                  marginTop: 10,
                  padding: 14,
                  background: "var(--fill)",
                  borderRadius: "var(--radius-m)",
                  fontSize: 12.5,
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                }}
              >
                {presenze.dati.rapporto.testo}
              </pre>
            </details>
          </div>
        </>
      )}
    </>
  );
}
