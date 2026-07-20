import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt, pctIt } from "@/lib/format";
import { CHIAVI, leggiImpostazioni } from "@/lib/impostazioni";
import { totaliProForma, importoRiga, rifProForma, STATI_PF } from "@/lib/proforma";
import { cambiaStatoProForma, deleteProForma } from "@/lib/proforma-actions";
import { StampaButton } from "@/components/StampaButton";

export const dynamic = "force-dynamic";

// Dettaglio pro-forma: anteprima del documento (stampabile in PDF dal browser)
// e gestione del ciclo di vita — invia, segna fatturata, annulla, riporta in bozza.
export default async function ProFormaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvato?: string; inviata?: string; fic?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [pf, imp] = await Promise.all([
    prisma.proForma.findUnique({
      where: { id },
      include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
    }),
    leggiImpostazioni(),
  ]);
  if (!pf) notFound();

  const tot = totaliProForma(pf.righe);
  const st = STATI_PF[pf.stato] ?? STATI_PF.bozza;
  const rif = rifProForma(pf);

  const intestazione = imp[CHIAVI.aziendaIntestazione] || "Deluxy";
  const indirizzo = imp[CHIAVI.aziendaIndirizzo] || "";
  const piva = imp[CHIAVI.aziendaPiva] || "";
  const contatti = imp[CHIAVI.aziendaContatti] || "";

  return (
    <>
      <div className="page-head no-print">
        <div>
          <Link href="/proforma" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Tutte le pro-forma
          </Link>
          <h1 className="page-title">Pro-forma {rif}</h1>
          <p className="page-caption">
            {pf.partner.nome} · {euro(tot.totale)} IVA inclusa
            {pf.inviataIl ? ` · inviata il ${dataIt(pf.inviataIl)}${pf.inviataA ? ` a ${pf.inviataA}` : ""}` : ""}
          </p>
        </div>
        <div className="page-actions" style={{ alignItems: "center", display: "flex", gap: 10 }}>
          <span className={`badge ${st.badge}`}>
            <span className="dot" />
            {st.label}
            {pf.stato === "fatturata" && pf.fatturaNumero ? ` n. ${pf.fatturaNumero}` : ""}
          </span>
          <StampaButton />
        </div>
      </div>

      {sp.salvato && (
        <div className="card no-print" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Pro-forma salvata</span>
        </div>
      )}
      {sp.fic && (
        <div className="card no-print" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />Fattura emessa su Fatture in Cloud — n. {decodeURIComponent(sp.fic)}
            {" "}(non inviata allo SDI: controllala e inviala da Fatture in Cloud)
          </span>
        </div>
      )}
      {sp.inviata && (
        <div className="card no-print" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Email inviata e documento segnato come &laquo;Inviata&raquo;</span>
        </div>
      )}

      {/* ————— Documento ————— */}
      <div className="docpf card">
        <div className="docpf-top">
          <div>
            <div className="docpf-brand">{intestazione}</div>
            {indirizzo && <div className="docpf-mittente">{indirizzo}</div>}
            {piva && <div className="docpf-mittente">P. IVA {piva}</div>}
            {contatti && <div className="docpf-mittente">{contatti}</div>}
          </div>
          <div className="docpf-titolo">
            <div className="docpf-tipo">Fattura pro-forma</div>
            <div className="docpf-numero">{rif}</div>
            <div className="docpf-data">del {dataIt(pf.data)}</div>
          </div>
        </div>

        <div className="docpf-dest">
          <div className="docpf-label">Spettabile</div>
          <div className="docpf-dest-nome">{pf.partner.ragioneSociale || pf.partner.nome}</div>
          {pf.partner.ragioneSociale && pf.partner.ragioneSociale !== pf.partner.nome && (
            <div className="docpf-mittente">{pf.partner.nome}</div>
          )}
          {pf.partner.citta && <div className="docpf-mittente">{pf.partner.citta}</div>}
          {pf.partner.email && <div className="docpf-mittente">{pf.partner.email}</div>}
        </div>

        {pf.oggetto && (
          <div className="docpf-oggetto">
            <span className="docpf-label">Oggetto</span> {pf.oggetto}
          </div>
        )}

        <table className="docpf-righe">
          <thead>
            <tr>
              <th>Descrizione</th>
              <th className="num">Q.tà</th>
              <th className="num">Prezzo unit.</th>
              <th className="num">IVA</th>
              <th className="num">Importo</th>
            </tr>
          </thead>
          <tbody>
            {pf.righe.map((r) => (
              <tr key={r.id}>
                <td>{r.descrizione}</td>
                <td className="num">{r.quantita.toLocaleString("it-IT")}</td>
                <td className="num">{euro(r.prezzoUnitario)}</td>
                <td className="num">{pctIt(r.aliquotaIva)}</td>
                <td className="num">{euro(importoRiga(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="docpf-bottom">
          <div className="docpf-note">
            {pf.scadenza && (
              <p><span className="docpf-label">Termine di pagamento</span> {dataIt(pf.scadenza)}</p>
            )}
            {pf.note && <p style={{ whiteSpace: "pre-wrap" }}>{pf.note}</p>}
            <p className="docpf-disclaimer">
              Il presente documento è una fattura pro-forma emessa a solo scopo informativo: non costituisce
              fattura ai sensi dell&apos;art. 21 del DPR 633/72, non è valida ai fini della detrazione IVA e non
              è titolo per la registrazione contabile. La fattura definitiva sarà emessa al ricevimento del pagamento.
            </p>
          </div>
          <div className="docpf-totali">
            {tot.perAliquota.map((a) => (
              <div className="docpf-tot-riga" key={a.aliquota}>
                <span>Imponibile {pctIt(a.aliquota)}</span>
                <span>{euro(a.imponibile)}</span>
              </div>
            ))}
            {tot.perAliquota.map((a) => (
              <div className="docpf-tot-riga" key={`iva-${a.aliquota}`}>
                <span>IVA {pctIt(a.aliquota)}</span>
                <span>{euro(a.iva)}</span>
              </div>
            ))}
            <div className="docpf-tot-riga docpf-tot-finale">
              <span>Totale documento</span>
              <span>{euro(tot.totale)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ————— Ciclo di vita ————— */}
      <div className="card no-print" style={{ marginTop: 16, padding: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {pf.stato === "bozza" && (
            <>
              <Link href={`/proforma/${id}/invia`} className="btn primary">Invia al partner…</Link>
              <Link href={`/proforma/${id}/modifica`} className="btn secondary">Modifica</Link>
              <form action={cambiaStatoProForma.bind(null, id, "inviata", undefined)} style={{ display: "inline" }}>
                <button className="btn secondary" type="submit" title="Se l'hai già trasmessa fuori dall'app (WhatsApp, a mano…)">
                  Segna come inviata
                </button>
              </form>
            </>
          )}
          {pf.stato === "inviata" && (
            <>
              <Link
                href={`/fic/fattura?proforma=${id}`}
                className="btn primary"
                title="Crea la fattura vera su Fatture in Cloud dalle righe di questa pro-forma"
              >
                Emetti fattura su FIC…
              </Link>
              <details className="pf-esito">
                <summary className="btn secondary">Segna fatturata a mano…</summary>
                <form
                  action={cambiaStatoProForma.bind(null, id, "fatturata")}
                  style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}
                >
                  <div>
                    <label className="field-label">N° fattura definitiva (FattureInCloud)</label>
                    <input type="text" name="fatturaNumero" placeholder="es. 212/2026" />
                  </div>
                  <button className="btn primary" type="submit">Conferma</button>
                </form>
              </details>
              <Link href={`/proforma/${id}/invia`} className="btn secondary">Invia di nuovo…</Link>
              <form action={cambiaStatoProForma.bind(null, id, "annullata", undefined)} style={{ display: "inline" }}>
                <button className="btn secondary" type="submit">Annulla pro-forma</button>
              </form>
              <form action={cambiaStatoProForma.bind(null, id, "bozza", undefined)} style={{ display: "inline" }}>
                <button className="btn secondary" type="submit" title="Riporta in bozza per correggerla">Riporta in bozza</button>
              </form>
            </>
          )}
          {pf.stato === "fatturata" && (
            <>
              <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                Confermata{pf.fatturataIl ? ` il ${dataIt(pf.fatturataIl)}` : ""}
                {pf.fatturaNumero ? ` — fattura n. ${pf.fatturaNumero}` : ""}.
              </span>
              <form action={cambiaStatoProForma.bind(null, id, "inviata", undefined)} style={{ display: "inline", marginLeft: "auto" }}>
                <button className="btn small secondary" type="submit">Riapri (torna a inviata)</button>
              </form>
            </>
          )}
          {pf.stato === "annullata" && (
            <>
              <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                Annullata{pf.annullataIl ? ` il ${dataIt(pf.annullataIl)}` : ""}. Il numero {rif} resta assegnato.
              </span>
              <form action={cambiaStatoProForma.bind(null, id, "bozza", undefined)} style={{ display: "inline", marginLeft: "auto" }}>
                <button className="btn small secondary" type="submit">Ripristina in bozza</button>
              </form>
            </>
          )}
          {pf.stato === "bozza" && (
            <form action={deleteProForma.bind(null, id)} style={{ marginLeft: "auto" }}>
              <button className="btn small danger" type="submit">Elimina bozza</button>
            </form>
          )}
        </div>
        {(!indirizzo || !piva) && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
            Suggerimento: completa l&apos;intestazione del documento (ragione sociale, indirizzo, P. IVA) in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Intestazione documenti</Link>.
          </p>
        )}
      </div>
    </>
  );
}
