import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { ivato, residuoFattura, incassatoFattura, parzialmenteIncassata, nomeMese, MESI } from "@/lib/calc";
import { updateFattura, segnaFatturaPagata, deleteFattura, incassaFatturaParziale } from "@/lib/actions";
import { ScadenzaRapida } from "@/components/ScadenzaRapida";

export const dynamic = "force-dynamic";

// Scheda della singola fattura servizi: tutti i campi, stato, azioni e modifica.
export default async function FatturaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvato?: string; fic?: string; incasso?: string; erroreIncasso?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [fattura, tipologie] = await Promise.all([
    prisma.fatturaServizio.findUnique({
      where: { id },
      include: { partner: true, tipologia: true },
    }),
    prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" } }),
  ]);
  if (!fattura) notFound();

  const oggi = new Date();
  const scaduta = !fattura.pagata && fattura.scadenza && fattura.scadenza < oggi;
  const action = updateFattura.bind(null, id);
  const dataIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const totale = ivato(fattura);
  const residuo = residuoFattura(fattura);
  const giaIncassato = incassatoFattura(fattura);
  const parziale = parzialmenteIncassata(fattura);
  const oggiIso = oggi.toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/fatture" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna alle fatture
          </Link>
          <h1 className="page-title">Fattura {fattura.numero ?? "s.n."}</h1>
          <p className="page-caption">
            <Link href={`/partner/${fattura.partnerId}`} style={{ color: "var(--blue)" }}>
              {fattura.partner.nome}
            </Link>{" "}
            · {fattura.tipologia.nome} · competenza {nomeMese(fattura.mese)} {fattura.anno}
          </p>
        </div>
        <div className="page-actions">
          {fattura.pagata ? (
            <span className="badge green"><span className="dot" />
              Saldata{fattura.dataPagamento ? ` il ${dataIt(fattura.dataPagamento)}` : ""}
            </span>
          ) : parziale ? (
            <span className="badge gold"><span className="dot" />Incassata in parte · residuo {euro(residuo)}</span>
          ) : scaduta ? (
            <span className="badge red"><span className="dot" />Scaduta il {dataIt(fattura.scadenza)}</span>
          ) : (
            <span className="badge orange"><span className="dot" />Da incassare</span>
          )}
          {fattura.sollecitoInviatoIl && (
            <span className="badge blue"><span className="dot" />Sollecitata {dataIt(fattura.sollecitoInviatoIl)}</span>
          )}
          {!fattura.numero && (
            <Link
              href={`/fic/fattura?fattura=${fattura.id}`}
              className="btn primary small"
              title="Emetti questa fattura su Fatture in Cloud e riporta qui il numero"
            >
              Emetti su FIC…
            </Link>
          )}
        </div>
      </div>

      {sp.salvato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Fattura aggiornata</span>
        </div>
      )}
      {sp.fic && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />Emessa su Fatture in Cloud — n. {decodeURIComponent(sp.fic)}
            {" "}(non inviata allo SDI: controllala e inviala da lì)
          </span>
        </div>
      )}
      {sp.incasso && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />
            {sp.incasso === "saldata" ? "Incasso registrato: fattura ora saldata" : "Incasso parziale registrato"}
          </span>
        </div>
      )}
      {sp.erroreIncasso && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.erroreIncasso)}</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Imponibile</div>
          <div className="kpi-value">{euro(fattura.imponibile)}</div>
          <div className="kpi-sub">IVA {fattura.aliquotaIva}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{fattura.pagata ? "Totale IVA inclusa" : "Residuo da incassare"}</div>
          <div className={`kpi-value ${!fattura.pagata && residuo > 0.005 ? "neg" : ""}`}>
            {euro(fattura.pagata ? totale : residuo)}
          </div>
          <div className="kpi-sub">
            {fattura.pagata
              ? "saldata"
              : parziale
                ? `su ${euro(totale)} · già incassato ${euro(giaIncassato)}`
                : `totale ${euro(totale)}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Scadenza</div>
          <div className={`kpi-value ${scaduta ? "neg" : ""}`} style={{ fontSize: 22 }}>
            {dataIt(fattura.scadenza)}
          </div>
          <div className="kpi-sub">emessa {dataIt(fattura.emissione)}</div>
        </div>
      </div>

      {!fattura.pagata && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h2 className="section-title" style={{ margin: 0 }}>Registra un incasso</h2>
            <span className="muted" style={{ fontSize: 13 }}>Residuo da incassare: <strong>{euro(residuo)}</strong></span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
            Incassa <strong>tutto</strong> (fattura saldata) oppure un <strong>acconto</strong>: il resto
            rimane da incassare qui, nello scadenzario e nella scheda partner.
          </p>
          <form action={incassaFatturaParziale.bind(null, id)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label className="field-label">Importo incassato € (IVA incl.)</label>
              <input type="number" name="importo" step="0.01" min="0.01" max={residuo.toFixed(2)} defaultValue={residuo.toFixed(2)} required style={{ width: 160 }} />
            </div>
            <div>
              <label className="field-label">Data</label>
              <input type="date" name="dataPagamento" defaultValue={oggiIso} />
            </div>
            <button className="btn primary" type="submit">Registra incasso</button>
          </form>
        </div>
      )}

      <div className="page-actions" style={{ marginBottom: 16 }}>
        {!fattura.pagata ? (
          <>
            <form action={segnaFatturaPagata.bind(null, id, true, undefined)}>
              <button className="btn secondary" type="submit" title="Segna l'intera fattura saldata con data odierna">Segna saldata oggi</button>
            </form>
            <Link href={`/solleciti/${id}`} className="btn secondary">Invia sollecito</Link>
          </>
        ) : (
          <form action={segnaFatturaPagata.bind(null, id, false, undefined)}>
            <button className="btn secondary" type="submit">Riapri (non saldata)</button>
          </form>
        )}
        <form
          action={deleteFattura.bind(null, id)}
        >
          <button className="btn danger" type="submit" title="Elimina definitivamente questa fattura dall'app (non tocca Fatture in Cloud)">
            Elimina
          </button>
        </form>
      </div>

      <h2 className="section-title">Modifica record</h2>
      <form action={action} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Tipologia <span className="req">*</span></label>
            <select name="tipologiaId" required defaultValue={fattura.tipologiaId}>
              {tipologie.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">N° fattura</label>
            <input type="text" name="numero" defaultValue={fattura.numero ?? ""} />
          </div>
          <div>
            <label className="field-label">Mese di competenza <span className="req">*</span></label>
            <select name="mese" required defaultValue={fattura.mese}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno <span className="req">*</span></label>
            <input type="number" name="anno" required step="1" defaultValue={fattura.anno} />
          </div>
          <div>
            <label className="field-label">Imponibile € <span className="req">*</span></label>
            <input type="number" name="imponibile" required step="0.01" defaultValue={fattura.imponibile} />
          </div>
          <div>
            <label className="field-label">Aliquota IVA %</label>
            <input type="number" name="aliquotaIva" step="1" defaultValue={fattura.aliquotaIva} />
          </div>
          <ScadenzaRapida
            emissioneIniziale={dataIso(fattura.emissione)}
            scadenzaIniziale={dataIso(fattura.scadenza)}
          />
          <div className="checkbox-row">
            <input type="checkbox" id="pagata" name="pagata" defaultChecked={fattura.pagata} />
            <label htmlFor="pagata">Saldata</label>
          </div>
          <div>
            <label className="field-label">Data pagamento</label>
            <input type="date" name="dataPagamento" defaultValue={dataIso(fattura.dataPagamento)} />
          </div>
          <div className="full">
            <label className="field-label">Descrizione</label>
            <input type="text" name="descrizione" defaultValue={fattura.descrizione ?? ""} />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Salva modifiche</button>
        </div>
      </form>
    </>
  );
}
