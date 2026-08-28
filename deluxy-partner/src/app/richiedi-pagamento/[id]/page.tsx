import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { dettaglioRichiestaTransactions, STATI_RICHIESTA, transactionsConfigurato } from "@/lib/transactions";
import { TIPI_PL } from "@/lib/categorie-spesa";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

// Scheda di UNA richiesta di pagamento. In elenco l'IBAN è troncato e la causale
// stretta: qui c'è il record intero, com'è partito verso Deluxy Transactions,
// più lo stato dell'autorizzazione. Da qui il denaro non esce comunque: la
// esegue Transactions, dopo il secondo fattore (e la doppia firma sopra soglia).

function quando(d: Date): string {
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ width: 200, flexShrink: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{etichetta}</div>
      <div style={{ fontSize: 13.5, minWidth: 0, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

export default async function RichiestaDettaglio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await prisma.richiestaPagamento.findUnique({ where: { id } });
  if (!r) notFound();

  const st = STATI_RICHIESTA[r.stato] ?? { label: r.stato === "errore" ? "Non inviata" : r.stato, badge: r.stato === "errore" ? "red" : "neutral" };

  // La PROVA del pagamento vive in Transactions (una casa sola): qui si
  // elenca live e si scarica dal proxy. Se Transactions non risponde, la
  // scheda resta completa — solo senza la sezione allegati.
  const vivo = r.riferimento && transactionsConfigurato() ? await dettaglioRichiestaTransactions(r.riferimento) : null;

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <TornaIndietro fallback="/richiedi-pagamento" label="Tutte le richieste" />
      </div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{r.beneficiario}</h1>
          <p className="page-caption">
            Richiesta di pagamento di <strong>{euro(r.importo)}</strong> del {quando(r.createdAt)}
            {r.riferimento ? <> · rif. {r.riferimento}</> : null}
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Importo</div>
          <div className="kpi-value neg">{euro(r.importo)}</div>
          <div className="kpi-sub">quello che si chiede a Transactions</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Stato dell&apos;autorizzazione</div>
          <div className="kpi-value" style={{ fontSize: 19 }}>
            <span className={`badge ${st.badge}`}><span className="dot" />{st.label}</span>
          </div>
          <div className="kpi-sub">{r.riferimento ?? "nessun riferimento Transactions"}</div>
        </div>
        {r.fornitura && (
          <div className="kpi">
            <div className="kpi-label">Fornitura</div>
            <div className="kpi-value" style={{ fontSize: 19 }}>
              <span className="badge gold"><span className="dot" />costo di prodotto</span>
            </div>
            <div className="kpi-sub">{r.fatturaFornitoreRif ?? "senza fattura collegata"}</div>
          </div>
        )}
      </div>

      <h2 className="section-title">La richiesta come è partita</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        <Riga etichetta="Beneficiario">{r.beneficiario}</Riga>
        <Riga etichetta="IBAN">{r.iban}</Riga>
        <Riga etichetta="Importo"><span className="neg" style={{ fontWeight: 600 }}>{euro(r.importo)}</span></Riga>
        <Riga etichetta="Causale (in banca)">{r.causale}</Riga>
        <Riga etichetta="Categoria di costo">
          {r.categoriaNome ? (
            <span className={`badge ${TIPI_PL[r.categoriaTipoPL ?? ""]?.badge ?? "neutral"}`}>
              <span className="dot" />{r.categoriaNome}
            </span>
          ) : (
            <span className="muted">non assegnata</span>
          )}
        </Riga>
        <Riga etichetta="Pagamento di una fornitura">
          {r.fornitura ? "Sì — costo di prodotto (COGS)" : <span className="muted">No</span>}
        </Riga>
        {r.fornitura && (
          <Riga etichetta="Fattura collegata">
            {r.fatturaFornitoreRif ?? <span className="muted">non indicata</span>}
          </Riga>
        )}
        <Riga etichetta="Da pagare entro">
          {r.scadenza ? dataIt(r.scadenza) : <span className="muted">non indicata</span>}
        </Riga>
        <Riga etichetta="Note interne">
          {r.note ?? <span className="muted">nessuna</span>}
        </Riga>
        <Riga etichetta="Chiesta da">{r.richiedente ?? <span className="muted">—</span>}</Riga>
        <Riga etichetta="Riferimento Transactions">{r.riferimento ?? <span className="muted">—</span>}</Riga>
        {r.partnerId && (
          <Riga etichetta="Partner collegato">
            <Link href={`/partner/${r.partnerId}`}>{r.partnerNome ?? r.beneficiario}</Link>
          </Riga>
        )}
        <div style={{ paddingTop: 12 }}>
          <a href="https://deluxy-transactions.vercel.app" target="_blank" rel="noopener noreferrer" className="btn secondary small">
            Apri Deluxy Transactions ↗
          </a>
        </div>
      </div>

      {vivo && vivo.allegati.length > 0 && (
        <>
          <h2 className="section-title">Allegati su Transactions</h2>
          <div className="card" style={{ marginBottom: 24 }}>
            {vivo.allegati.map((a) => (
              <Riga key={a.id} etichetta={a.ruolo === "prova" ? "Prova del pagamento" : "Documento della richiesta"}>
                <a href={`/api/prova-pagamento/${r.riferimento}/${a.id}`} style={{ color: "var(--blue)" }}>
                  📎 {a.nome}
                </a>{" "}
                <span className="muted" style={{ fontSize: 12 }}>({Math.round(a.byte / 1000)} KB)</span>
              </Riga>
            ))}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
              La prova vive in Transactions: qui la si legge, non se ne tiene una copia.
            </p>
          </div>
        </>
      )}
      {vivo && r.stato === "pagata" && vivo.allegati.every((a) => a.ruolo !== "prova") && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          Pagata, ma su Transactions non c&apos;è ancora una prova allegata
          {vivo.pagatoCon === "fuori_app" ? " (pagata fuori dall'app: c'è la parola di chi l'ha registrata)" : ""}.
        </p>
      )}
    </>
  );
}
