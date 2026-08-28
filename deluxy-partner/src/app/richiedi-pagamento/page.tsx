import Link from "next/link";
import { RigaLink } from "@/components/RigaLink";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { categorieDaBudgets, TIPI_PL } from "@/lib/categorie-spesa";
import { transactionsConfigurato, STATI_RICHIESTA } from "@/lib/transactions";
import { creaRichiestaPagamento } from "@/lib/richieste-actions";
import { BottoneInvio } from "@/components/BottoneInvio";
import { SceltaBeneficiario } from "@/components/SceltaBeneficiario";
import { CercaFatturaEmessa } from "@/components/CercaFatturaEmessa";

export const dynamic = "force-dynamic";

// «Richiedi pagamento»: chiedere il pagamento di una spesa qualsiasi, con le
// CAUSALI prese dalle categorie di costo di Budgets — le stesse con cui si
// classifica la spesa in `/spese` e si costruisce il conto economico. Scegliere
// la categoria mentre si chiede il pagamento vuol dire che la spesa nasce già
// collocata nel bilancio, invece di doverla rincorrere dopo, quando
// dall'estratto conto si legge solo un nome di banca.

function quando(d: Date): string {
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function RichiediPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const attiva = transactionsConfigurato();

  const [esitoCat, richieste] = await Promise.all([
    categorieDaBudgets(),
    prisma.richiestaPagamento.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const categorie = esitoCat.ok ? esitoCat.categorie : [];

  const inAttesa = richieste.filter((r) => r.stato === "in_attesa" || r.stato === "sospesa");
  const totInAttesa = inAttesa.reduce((a, r) => a + r.importo, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Richiedi pagamento</h1>
          <p className="page-caption">
            Chiedi il pagamento di una spesa. <strong>Da qui non esce denaro</strong>: la richiesta va a{" "}
            <a href="https://deluxy-transactions.vercel.app" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Deluxy Transactions</a>,
            dove una persona la autorizza — con secondo fattore e, sopra soglia, doppia firma.
          </p>
        </div>
      </div>

      {!attiva && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "3px solid var(--orange)" }}>
          <strong style={{ fontSize: 14 }}>Transactions non collegata</strong>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0 }}>
            Mancano <code>TRANSACTIONS_API_KEY</code> e <code>TRANSACTIONS_HMAC_SECRET</code>: senza, la richiesta
            non può partire.
          </p>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.errore}</span>
        </div>
      )}
      {sp.ok && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--blue)" }}>
          <span className="badge blue"><span className="dot" />Richiesta inviata: {sp.ok}</span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            Non è uscito nessun denaro. Resta in attesa finché qualcuno non la autorizza in Transactions.
          </p>
        </div>
      )}

      {inAttesa.length > 0 && (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">In attesa di autorizzazione</div>
            <div className="kpi-value neg">{euro(totInAttesa)}</div>
            <div className="kpi-sub">{inAttesa.length} richieste</div>
          </div>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 0 }}>Nuova richiesta</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <form action={creaRichiestaPagamento}>
          <div className="form-grid">
            <SceltaBeneficiario />
            <div>
              <label className="field-label">Importo € <span className="req">*</span></label>
              <input type="text" name="importo" required inputMode="decimal" placeholder="1.234,56" />
            </div>
            <div>
              <label className="field-label">Categoria di costo</label>
              <select name="categoria" defaultValue="">
                <option value="">— nessuna —</option>
                {categorie.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {TIPI_PL[c.tipoPL]?.label ?? c.tipoPL}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 12 }}>
                {categorie.length > 0
                  ? "Sono le categorie di Deluxy Budgets, quelle del bilancio."
                  : "Elenco non disponibile: Budgets non risponde."}
              </span>
            </div>
            <div>
              <label className="field-label">Da pagare entro</label>
              <input type="date" name="scadenza" />
            </div>
            <div className="full">
              <label className="field-label">Causale <span className="req">*</span></label>
              <input type="text" name="causale" required maxLength={140} placeholder="es. Fattura 118/2026 — fiori settembre" />
              <span className="muted" style={{ fontSize: 12 }}>
                È quello che si legge in banca: massimo 140 caratteri (limite SEPA).
              </span>
            </div>
            <div className="full">
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" name="fornitura" style={{ width: 16, height: 16 }} />
                È il pagamento di una <strong>fornitura</strong> (costo di prodotto)
              </label>
              <div style={{ marginTop: 8 }}>
                <label className="field-label">Fattura del fornitore (rif.)</label>
                <CercaFatturaEmessa />
                <span className="muted" style={{ fontSize: 12 }}>
                  Il riferimento della fattura a cui il pagamento si riferisce. Con la fornitura scegli sopra una
                  <strong> categoria di costo del prodotto (COGS)</strong>: così Budgets lo legge come costo di prodotto e non come spesa generica.
                </span>
              </div>
            </div>
            <div className="full">
              <label className="field-label">Note interne</label>
              <input type="text" name="note" placeholder="Non arrivano in banca: restano per chi deve autorizzare" />
            </div>
          </div>
          <div className="form-footer" style={{ marginTop: 16 }}>
            <span className="muted" style={{ marginRight: "auto", fontSize: 12.5, alignSelf: "center" }}>
              Nessun denaro esce da qui: parte solo la richiesta.
            </span>
            {attiva ? (
              <BottoneInvio className="btn primary small" inCorso="Invio la richiesta…">Richiedi pagamento</BottoneInvio>
            ) : (
              <button className="btn primary small" type="submit" disabled>Richiedi pagamento</button>
            )}
          </div>
        </form>
      </div>

      <h2 className="section-title">Richieste inviate</h2>
      <div className="card tight">
        {richieste.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna richiesta</div>
            <div className="empty-text">Le richieste che invii da qui compaiono in questo elenco, con il loro stato.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th><th>Beneficiario</th><th>Causale</th><th>Categoria</th>
                  <th className="num">Importo</th><th>Stato</th><th>Chiesta da</th>
                </tr>
              </thead>
              <tbody>
                {richieste.map((r) => (
                  <RigaLink key={r.id} className="row-link" href={`/richiedi-pagamento/${r.id}`}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{quando(r.createdAt)}</td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {r.partnerId ? (
                          <Link href={`/partner/${r.partnerId}`} style={{ color: "var(--blue)" }}>{r.beneficiario}</Link>
                        ) : (
                          r.beneficiario
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {/* L'IBAN si mostra troncato: in una tabella aperta su
                            uno schermo condiviso non serve per intero. */}
                        {r.iban.slice(0, 6)}••••{r.iban.slice(-4)}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, maxWidth: 280 }}>
                      {r.causale}
                      {r.fornitura && (
                        <div style={{ marginTop: 3 }}>
                          <span className="badge gold" style={{ fontSize: 11 }}>
                            <span className="dot" />fornitura{r.fatturaFornitoreRif ? ` · fatt. ${r.fatturaFornitoreRif}` : ""}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.categoriaNome ? (
                        <span className={`badge ${TIPI_PL[r.categoriaTipoPL ?? ""]?.badge ?? "neutral"}`}>
                          <span className="dot" />{r.categoriaNome}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num neg">{euro(r.importo)}</td>
                    <td>
                      <span className={`badge ${STATI_RICHIESTA[r.stato]?.badge ?? (r.stato === "errore" ? "red" : "neutral")}`}>
                        <span className="dot" />{STATI_RICHIESTA[r.stato]?.label ?? (r.stato === "errore" ? "Non inviata" : r.stato)}
                      </span>
                      {r.riferimento && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{r.riferimento}</div>
                      )}
                      {r.scadenza && (
                        <div className="muted" style={{ fontSize: 11 }}>entro {dataIt(r.scadenza)}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.richiedente ?? "—"}</td>
                  </RigaLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
