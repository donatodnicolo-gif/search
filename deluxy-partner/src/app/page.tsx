import Link from "next/link";
import { riepilogoTutti, ANNI_DISPONIBILI, annoValido } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { nomeMese, ivato, residuoFattura, parzialmenteIncassata } from "@/lib/calc";
import { registraBonifico, segnaFatturaPagata } from "@/lib/actions";
import { richiediPagamento } from "@/lib/pagamenti-partner-actions";
import { transactionsConfigurato, etichettaRichiesta, richiestaRifacibile } from "@/lib/transactions";
import { BottoneInvio } from "@/components/BottoneInvio";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; richiesta?: string; errorePag?: string }>;
}) {
  const sp = await searchParams;
  const anno = annoValido(sp.anno);
  const oggi = new Date();

  // Le due letture sono indipendenti: in parallelo si paga una sola andata e
  // ritorno verso il database invece di due in fila.
  const [tutti, fattureAperte] = await Promise.all([
    riepilogoTutti(anno),
    prisma.fatturaServizio.findMany({
      where: { anno, pagata: false, imponibile: { gt: 0 } },
      include: { partner: true, tipologia: true },
      orderBy: { scadenza: "asc" },
    }),
  ]);

  const totVendite = tutti.reduce((a, t) => a + t.rolling.vendite, 0);
  const totCommissioni = tutti.reduce((a, t) => a + t.rolling.commissioni, 0);
  const totServizi = tutti.reduce((a, t) => a + t.rolling.fatture, 0);
  const stima = tutti.reduce((a, t) => a + t.rolling.stimaChiusura, 0);
  const scadute = fattureAperte.filter((f) => f.scadenza && f.scadenza < oggi);
  const totScaduto = scadute.reduce((a, f) => a + residuoFattura(f), 0);

  // Mesi con partite aperte. Per i partner senza compensazione le due direzioni
  // sono indipendenti: lo stesso mese puo' avere sia da bonificare sia da incassare.
  const mesiPartner = tutti.flatMap((t) =>
    t.mesi.map((m) => ({ partner: t.partner, mese: m.mese, r: m.riepilogo, saldo: m.saldo }))
  );
  const daPagareAiPartner = mesiPartner
    .filter((x) => x.r.daBonificare >= 0.01)
    .sort((a, b) => b.r.daBonificare - a.r.daBonificare);
  const daIncassareRighe = mesiPartner
    .filter((x) => x.r.daIncassare >= 0.01)
    .sort((a, b) => b.r.daIncassare - a.r.daIncassare);
  const totDaPagare = daPagareAiPartner.reduce((a, x) => a + x.r.daBonificare, 0);
  // Il bottone «Paga» chiede il pagamento a Transactions: se non e collegata,
  // resta solo l annotazione manuale.
  const trxAttiva = transactionsConfigurato();
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
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="anno-switch" role="group" aria-label="Anno">
            {ANNI_DISPONIBILI.map((a) => (
              <Link
                key={a}
                href={a === ANNI_DISPONIBILI[0] ? "/" : `/?anno=${a}`}
                className={`anno-btn${a === anno ? " attivo" : ""}`}
              >
                {a}
              </Link>
            ))}
          </div>
          <Link href="/fatture/nuova" className="btn secondary">+ Fattura servizi</Link>
          <Link href="/vendite/nuova" className="btn primary">+ Vendita vendor</Link>
        </div>
      </div>


      {sp.errorePag && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.errorePag}</span>
        </div>
      )}
      {sp.richiesta && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--blue)" }}>
          <span className="badge blue">
            <span className="dot" />
            {sp.richiesta.split("|")[0] === "invio"
              ? `Richiesta in partenza verso Transactions (${sp.richiesta.split("|")[1] ?? ""})`
              : sp.richiesta.split("|")[1] === "gia"
                ? `Richiesta già inviata: ${sp.richiesta.split("|")[0]}`
                : `Richiesta inviata: ${sp.richiesta.split("|")[0]}`}
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            <strong>Non è uscito nessun denaro.</strong> L&apos;esito dell&apos;invio compare sulla riga del mese
            (ricarica tra qualche istante); il pagamento va poi autorizzato da una persona dentro{" "}
            <a href="https://deluxy-transactions.vercel.app" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Deluxy Transactions</a>;
            il mese qui resta «da bonificare» finché non risulta pagata.
          </p>
        </div>
      )}

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
                    {/* Stesse azioni, stesso ordine e stesso allineamento della
                        tabella degli incassi qui sotto: apri il dettaglio ·
                        annota · azione principale (in nero) per ultima. */}
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
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
                          style={{ display: "inline" }}
                        >
                          {/* Per i bonifici fatti a mano dalla banca: annota e
                              basta, non chiede niente a nessuno. */}
                          <BottoneInvio
                            className="btn small secondary"
                            inCorso="Annoto…"
                            title={`Annota che il bonifico di ${euro(x.r.daBonificare)} è GIÀ stato fatto (es. a mano dalla banca), con data odierna. Si annulla dalla scheda del partner.`}
                          >
                            Annota pagato
                          </BottoneInvio>
                        </form>
                        {/* «Paga» CHIEDE il pagamento a Deluxy Transactions,
                            l'unica app da cui può uscire denaro: qui non esce
                            niente e non si segna niente come pagato. Se la
                            richiesta è già partita, al posto del bottone si
                            mostra a che punto è. */}
                        {trxAttiva && (!x.saldo?.richiestaRif || richiestaRifacibile(x.saldo.richiestaStato, x.saldo.richiestaIl)) && (
                          <form
                            action={richiediPagamento.bind(
                              null,
                              x.partner.id,
                              anno,
                              x.mese,
                              +x.r.daBonificare.toFixed(2),
                              `/?anno=${anno}`
                            )}
                            style={{ display: "inline" }}
                          >
                            {/* si blocca mentre parte, così un doppio clic non
                                manda due richieste */}
                            <BottoneInvio
                              className="btn small primary"
                              inCorso="Invio…"
                              title={`Avvia il pagamento di ${euro(x.r.daBonificare)} a ${x.partner.nome} su Deluxy Transactions. NON esce denaro adesso: la richiesta va autorizzata da una persona dentro Transactions.`}
                            >
                              Paga
                            </BottoneInvio>
                          </form>
                        )}
                        {/* Richiesta già partita: niente più bottone, solo lo
                            stato. Si ritorna cliccabile solo se annullata o
                            rifiutata (vedi richiestaRifacibile). */}
                        {x.saldo?.richiestaRif && !richiestaRifacibile(x.saldo.richiestaStato, x.saldo.richiestaIl) && (
                          <span
                            className={`badge ${etichettaRichiesta(x.saldo.richiestaStato).badge}`}
                            title={`Richiesta ${x.saldo.richiestaRif} inviata a Deluxy Transactions — il pagamento va autorizzato lì`}
                          >
                            <span className="dot" />
                            {etichettaRichiesta(x.saldo.richiestaStato).label}
                          </span>
                        )}
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
                  <th className="num">Residuo (IVA incl.)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scadute.slice(0, 12).map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/partner/${f.partnerId}`}>{f.partner.nome}</Link></td>
                    <td>{f.numero ?? "—"}</td>
                    <td>{f.tipologia.nome}</td>
                    <td><span className="badge red"><span className="dot" />{dataIt(f.scadenza)}</span></td>
                    <td className="num">
                      {euro(residuoFattura(f))}
                      {parzialmenteIncassata(f) && (
                        <div className="muted" style={{ fontSize: 11 }}>su {euro(ivato(f))}</div>
                      )}
                    </td>
                    {/* Stesso schema della tabella dei bonifici qui sopra:
                        apri il dettaglio · annota · azione principale in nero. */}
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        <Link className="btn small secondary" href={`/fatture/${f.id}`}>
                          Gestisci
                        </Link>
                        {/* Incasso ricevuto: segna la fattura saldata (data odierna).
                            Si annulla dalla scheda del partner con «Riapri». */}
                        <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)} style={{ display: "inline" }}>
                          <button
                            className="btn small secondary"
                            type="submit"
                            title={`Segna incassata la fattura ${f.numero ?? "s.n."} di ${euro(residuoFattura(f))} (data odierna)`}
                          >
                            Annota pagato
                          </button>
                        </form>
                        {/* Sollecito: prepara l'email al contatto amministrativo */}
                        <Link className="btn small primary" href={`/solleciti/${f.id}?da=dashboard`}>
                          Sollecita
                        </Link>
                      </span>
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
