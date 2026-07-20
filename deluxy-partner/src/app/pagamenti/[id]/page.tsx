import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { ordinanteSepa } from "@/lib/sepa";
import { STATI_PAG } from "@/lib/pagamenti";
import {
  segnaPagamentoEseguito,
  annullaPagamentoDiretto,
  riapriPagamentoDiretto,
  eliminaPagamentoDiretto,
} from "@/lib/pagamenti-actions";

export const dynamic = "force-dynamic";

export default async function PagamentoDirettoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creato?: string; salvato?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [p, ordinante] = await Promise.all([
    prisma.pagamentoDiretto.findUnique({ where: { id } }),
    ordinanteSepa(),
  ]);
  if (!p) notFound();

  const st = STATI_PAG[p.stato] ?? STATI_PAG.predisposto;
  const scaricabile = p.stato !== "annullato" && Boolean(ordinante);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/pagamenti" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Tutti i pagamenti
          </Link>
          <h1 className="page-title">{p.beneficiario}</h1>
          <p className="page-caption">
            {euro(p.importo)}{p.fornitore ? ` · ${p.fornitore}` : ""}
            {p.stato === "pagato" && p.dataPagamento ? ` · pagato il ${dataIt(p.dataPagamento)}` : ""}
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className={`badge ${st.badge}`}><span className="dot" />{st.label}</span>
        </div>
      </div>

      {(sp.creato || sp.salvato) && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />{sp.creato ? "Bonifico predisposto" : "Modifiche salvate"}</span>
        </div>
      )}

      {!p.ibanValido && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 13.5 }}>
            ⚠︎ L&apos;IBAN non supera il controllo di validità (mod-97): <strong>verificalo con il fornitore</strong> prima di pagare.
          </span>
        </div>
      )}

      {/* Dati del bonifico */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="info-grid">
          <div className="info-item"><div className="k">Beneficiario</div><div className="v">{p.beneficiario}</div></div>
          <div className="info-item">
            <div className="k">IBAN</div>
            <div className="v" style={{ fontFamily: "ui-monospace, monospace" }}>
              {p.iban.replace(/(.{4})/g, "$1 ").trim()}{" "}
              {p.ibanValido
                ? <span className="badge green"><span className="dot" />valido</span>
                : <span className="badge red"><span className="dot" />da verificare</span>}
            </div>
          </div>
          <div className="info-item"><div className="k">BIC / SWIFT</div><div className="v">{p.bic ?? "—"}</div></div>
          <div className="info-item"><div className="k">Importo</div><div className="v" style={{ fontWeight: 600 }}>{euro(p.importo)}</div></div>
          <div className="info-item"><div className="k">Causale</div><div className="v">{p.causale ?? "—"}</div></div>
          <div className="info-item"><div className="k">Fornitore</div><div className="v">{p.fornitore ?? "—"}</div></div>
        </div>
        {p.note && <p style={{ marginTop: 14, fontSize: 13.5, color: "var(--text-secondary)" }}>{p.note}</p>}
      </div>

      {/* Esecuzione: file SEPA da autorizzare in banca */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0, fontSize: 15 }}>Esegui il pagamento</h2>
        {!ordinante ? (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
            Per generare il file SEPA imposta prima intestazione e IBAN del conto Deluxy in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Ordinante bonifici SEPA</Link>.
          </p>
        ) : (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
            Scarica il file SEPA e caricalo in <strong>Qonto</strong> (o nell&apos;home banking): lì controlli il
            bonifico e lo <strong>autorizzi tu</strong>. L&apos;app non invia denaro.
            Ordinante: <strong>{ordinante.nome}</strong>.
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {scaricabile && (
            <a className="btn primary" href={`/api/pagamenti/${p.id}/sepa`} download>
              Scarica file SEPA
            </a>
          )}
          {p.stato === "predisposto" && (
            <>
              <details className="pf-esito">
                <summary className="btn secondary">Segna come pagato…</summary>
                <form action={segnaPagamentoEseguito.bind(null, p.id)} style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label className="field-label">Data del pagamento</label>
                    <input type="date" name="data" defaultValue={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <button className="btn primary" type="submit">Conferma pagato</button>
                </form>
              </details>
              <form action={annullaPagamentoDiretto.bind(null, p.id)} style={{ display: "inline" }}>
                <button className="btn secondary" type="submit">Annulla</button>
              </form>
            </>
          )}
          {p.stato === "pagato" && (
            <form action={riapriPagamentoDiretto.bind(null, p.id)} style={{ display: "inline" }}>
              <button className="btn secondary" type="submit">Riapri (torna a predisposto)</button>
            </form>
          )}
          {p.stato === "annullato" && (
            <form action={riapriPagamentoDiretto.bind(null, p.id)} style={{ display: "inline" }}>
              <button className="btn secondary" type="submit">Ripristina</button>
            </form>
          )}
          <form action={eliminaPagamentoDiretto.bind(null, p.id)} style={{ marginLeft: "auto" }}>
            <button className="btn small danger" type="submit">Elimina</button>
          </form>
        </div>
      </div>
    </>
  );
}
