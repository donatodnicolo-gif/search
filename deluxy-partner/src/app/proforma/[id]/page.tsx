import Link from "next/link";
import { ConfermaElimina } from "@/components/ConfermaElimina";
import { TornaIndietro } from "@/components/TornaIndietro";
import { notFound } from "next/navigation";
import { euro, dataIt, pctIt } from "@/lib/format";
import { statoDocumento } from "@/lib/proforma";
import { cambiaStatoProForma, deleteProForma } from "@/lib/proforma-actions";
import { AzioniDocumento } from "@/components/AzioniDocumento";
import { caricaDocumentoProForma } from "@/lib/proforma-documento";
import { ficUrlFattura } from "@/lib/fic";

export const dynamic = "force-dynamic";

// Dettaglio pro-forma / preventivo: l'anteprima del DOCUMENTO — la stessa
// che si stampa (@media print) e che il PDF (/proforma/[id]/pdf) riproduce —
// e la gestione del ciclo di vita: invia, segna fatturata, annulla, riporta in
// bozza. I dati del foglio arrivano da un punto solo (proforma-documento.ts).
export default async function ProFormaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvato?: string; inviata?: string; fic?: string; erroreStato?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await caricaDocumentoProForma(id);
  if (!d) notFound();

  const e = d.emittente;
  const c = d.cliente;
  const st = statoDocumento(d.preventivo ? "preventivo" : "proforma", d.stato, d.fatturaNumero);
  // Eliminabile finché non è una fattura VERA su FIC (numero presente).
  const puoEliminare = !(d.stato === "fatturata" && d.fatturaNumero);
  // Se la pro-forma è «fatturata» con un numero, il link per aprirla su FIC;
  // se è «fatturata» SENZA numero è una fatturata finta, e va sbloccata.
  const urlFicFattura =
    d.stato === "fatturata" && d.fatturaNumero ? await ficUrlFattura(d.fatturaNumero, new Date(d.data).getFullYear()) : null;
  const righeMittente = [
    e.indirizzo,
    e.piva ? `P. IVA ${e.piva}` : "",
    e.codiceFiscale && e.codiceFiscale !== e.piva ? `C.F. ${e.codiceFiscale}` : "",
    e.rea ? `REA ${e.rea}` : "",
    e.sdi ? `SDI ${e.sdi}` : "",
    e.pec ? `PEC ${e.pec}` : "",
    e.contatti,
  ].filter(Boolean);
  const mostraPagamento = !d.preventivo && (e.modalitaPagamento || e.iban);
  const ibanSpaziato = e.iban ? e.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim() : "";

  return (
    <>
      <div className="page-head no-print">
        <div>
          <TornaIndietro
            fallback={d.preventivo ? "/proforma?tipo=preventivo" : "/proforma"}
            label={d.preventivo ? "Preventivi" : "Pro-forma"}
          />
          <h1 className="page-title">{d.preventivo ? "Preventivo" : "Pro-forma"} {d.rif}</h1>
          <p className="page-caption">
            {c.nome} · {euro(d.totali.totale)} IVA inclusa
            {d.inviataIl ? ` · inviata il ${dataIt(d.inviataIl)}${d.inviataA ? ` a ${d.inviataA}` : ""}` : ""}
          </p>
        </div>
        <div className="page-actions" style={{ alignItems: "center", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className={`badge ${st.badge}`}>
            <span className="dot" />
            {st.label}
            {d.stato === "fatturata" && d.fatturaNumero ? ` n. ${d.fatturaNumero}` : ""}
          </span>
          <AzioniDocumento id={id} />
        </div>
      </div>

      {sp.erroreStato && (
        <div className="card no-print" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.2)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.erroreStato)}</span>
        </div>
      )}
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
          <span className="badge green"><span className="dot" />Email inviata con il PDF allegato e documento segnato come &laquo;Inviata&raquo;</span>
        </div>
      )}
      {d.mancanti.length > 0 && (
        <div className="card no-print" style={{ padding: 12, marginBottom: 12, borderColor: "rgba(201,52,0,0.2)", background: "rgba(201,52,0,0.06)" }}>
          <span style={{ fontSize: 13, color: "var(--orange)" }}>
            Per emettere la fattura vera mancano ancora, sull&apos;anagrafica del cliente:{" "}
            <strong>{d.mancanti.join(" · ")}</strong>. Si compilano in Anagrafiche (il registro è la loro casa).
          </span>
        </div>
      )}

      {/* ————— Il documento: quello che il cliente riceve ————— */}
      <div className="docpf card">
        <div className="docpf-top">
          <div style={{ maxWidth: 420 }}>
            {e.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.logoDataUrl} alt={e.brand || e.ragioneSociale} className="docpf-logo" />
            ) : (
              <div className="docpf-wordmark">{(e.brand || e.ragioneSociale || "Deluxy").toUpperCase()}</div>
            )}
            <div className="docpf-brand">{e.ragioneSociale}</div>
            {righeMittente.map((r, i) => (
              <div key={i} className="docpf-mittente">{r}</div>
            ))}
          </div>
          <div className="docpf-titolo">
            <div className="docpf-tipo">{d.titolo}</div>
            <div className="docpf-numero">{d.rif}</div>
            <div className="docpf-data">del {dataIt(d.data)}</div>
          </div>
        </div>
        <div className="docpf-regola" />

        <div className="docpf-blocchi">
          <div style={{ flex: 1 }}>
            <div className="docpf-label">Spettabile</div>
            <div className="docpf-dest-nome">{c.nome}</div>
            {c.insegna && <div className="docpf-mittente">{c.insegna}</div>}
            {c.indirizzo && <div className="docpf-mittente">{c.indirizzo}</div>}
            {c.citta && <div className="docpf-mittente">{c.citta}</div>}
            {c.pIva && <div className="docpf-mittente">P. IVA {c.pIva}</div>}
            {c.codiceFiscale && <div className="docpf-mittente">C.F. {c.codiceFiscale}</div>}
            {c.codiceSdi && <div className="docpf-mittente">Cod. SDI {c.codiceSdi}</div>}
            {c.pec && <div className="docpf-mittente">PEC {c.pec}</div>}
            {c.email && <div className="docpf-mittente">{c.email}</div>}
          </div>
          <div className="docpf-meta">
            <div className="docpf-meta-riga"><span>Documento</span><span>{d.rif}</span></div>
            <div className="docpf-meta-riga"><span>Data</span><span>{dataIt(d.data)}</span></div>
            {d.scadenza && <div className="docpf-meta-riga"><span>Termine di pagamento</span><span>{dataIt(d.scadenza)}</span></div>}
            {d.preventivo && d.validoFino && (
              <div className="docpf-meta-riga"><span>Offerta valida fino al</span><span>{dataIt(d.validoFino)}</span></div>
            )}
            <div className="docpf-meta-riga"><span>Totale</span><span>{euro(d.totali.totale)}</span></div>
          </div>
        </div>

        {d.oggetto && (
          <div className="docpf-oggetto">
            <span className="docpf-label">Oggetto</span>
            {d.oggetto}
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
            {d.righe.map((r) => (
              <tr key={r.id}>
                <td>{r.descrizione}</td>
                <td className="num">{r.quantita.toLocaleString("it-IT")}</td>
                <td className="num">{euro(r.prezzoUnitario)}</td>
                <td className="num">{pctIt(r.aliquotaIva)}</td>
                <td className="num importo">{euro(r.importo)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="docpf-bottom">
          <div className="docpf-note">{d.note && <p>{d.note}</p>}</div>
          <div className="docpf-totali">
            {d.totali.perAliquota.map((a) => (
              <div className="docpf-tot-riga" key={`i${a.aliquota}`}>
                <span>Imponibile {pctIt(a.aliquota)}</span>
                <span>{euro(a.imponibile)}</span>
              </div>
            ))}
            {d.totali.perAliquota.map((a) => (
              <div className="docpf-tot-riga" key={`v${a.aliquota}`}>
                <span>IVA {pctIt(a.aliquota)}</span>
                <span>{euro(a.iva)}</span>
              </div>
            ))}
            <div className="docpf-tot-riga docpf-tot-finale">
              <span>Totale documento</span>
              <span>{euro(d.totali.totale)}</span>
            </div>
          </div>
        </div>

        {/* COME SI PAGA, sul documento (27/08/2026): un foglio che chiede soldi
            senza dire dove mandarli fa perdere un giro di mail. */}
        {mostraPagamento && (
          <div className="docpf-pagamento">
            <div className="docpf-label" style={{ display: "block", marginBottom: 8 }}>Pagamento</div>
            {e.modalitaPagamento && <div className="docpf-pag-riga"><span>Modalità</span><span>{e.modalitaPagamento}</span></div>}
            {e.iban && <div className="docpf-pag-riga"><span>IBAN</span><span className="docpf-iban">{ibanSpaziato}</span></div>}
            {e.intestatarioConto && <div className="docpf-pag-riga"><span>Intestato a</span><span>{e.intestatarioConto}</span></div>}
            {(e.banca || e.bic) && (
              <div className="docpf-pag-riga"><span>Banca</span><span>{[e.banca, e.bic ? `BIC ${e.bic}` : ""].filter(Boolean).join(" · ")}</span></div>
            )}
            {d.scadenza && <div className="docpf-pag-riga"><span>Entro il</span><span>{dataIt(d.scadenza)}</span></div>}
          </div>
        )}

        <p className="docpf-disclaimer">{e.disclaimer}</p>
        <div className="docpf-piede">
          <span>{[e.ragioneSociale, e.indirizzo, e.piva ? `P. IVA ${e.piva}` : "", e.contatti].filter(Boolean).join("  ·  ")}</span>
          <span>{d.rif}</span>
        </div>
      </div>

      {/* ————— Ciclo di vita ————— */}
      <div className="card no-print" style={{ marginTop: 16, padding: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {d.stato === "bozza" && (
            <>
              <Link href={`/proforma/${id}/invia`} className="btn primary" title="Email al cliente con il PDF allegato">Invia al partner…</Link>
              {/* Si puo fatturare anche direttamente da una bozza, senza passare
                  prima per «inviata»: FIC crea la fattura dalle righe e la pro-forma
                  diventa «fatturata». */}
              <Link href={`/fic/fattura?proforma=${id}`} className="btn secondary" title="Crea la fattura vera su Fatture in Cloud dalle righe di questa pro-forma">Emetti fattura su FIC…</Link>
              <Link href={`/proforma/${id}/modifica`} className="btn secondary">Modifica</Link>
              <form action={cambiaStatoProForma.bind(null, id, "annullata", undefined)} style={{ display: "inline" }}>
                <button className="btn secondary" type="submit" title="Annulla la pro-forma: il numero resta assegnato, si può ripristinare">Annulla</button>
              </form>
              <form action={cambiaStatoProForma.bind(null, id, "inviata", undefined)} style={{ display: "inline" }}>
                <button className="btn secondary" type="submit" title="Se l'hai già trasmessa fuori dall'app (WhatsApp, a mano…)">
                  Segna come inviata
                </button>
              </form>
            </>
          )}
          {d.stato === "inviata" && (
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
          {d.stato === "fatturata" && (
            <>
              {d.fatturaNumero ? (
                <>
                  <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                    Fatturata{d.fatturataIl ? ` il ${dataIt(d.fatturataIl)}` : ""} — fattura n. {d.fatturaNumero}.
                  </span>
                  {urlFicFattura && (
                    <a href={urlFicFattura} target="_blank" rel="noopener noreferrer" className="btn secondary">
                      Apri in Fatture in Cloud ↗
                    </a>
                  )}
                </>
              ) : (
                <>
                  {/* «Fatturata» SENZA numero: non è una fattura vera. Non un
                      vicolo cieco: da qui si emette davvero, o si corregge. */}
                  <span style={{ fontSize: 13.5, color: "var(--orange)" }}>
                    ⚠️ Segnata «fatturata» ma <strong>senza fattura collegata</strong>: nessun numero e nessun documento su Fatture in Cloud.
                  </span>
                  <Link href={`/fic/fattura?proforma=${id}`} className="btn primary" title="Crea la fattura vera su Fatture in Cloud dalle righe di questa pro-forma">
                    Emetti la fattura vera su FIC…
                  </Link>
                  <form action={cambiaStatoProForma.bind(null, id, "bozza", undefined)} style={{ display: "inline" }}>
                    <button className="btn secondary" type="submit" title="Riportala in bozza per correggerla prima di emetterla">Riporta in bozza</button>
                  </form>
                </>
              )}
              <form action={cambiaStatoProForma.bind(null, id, "inviata", undefined)} style={{ display: "inline", marginLeft: "auto" }}>
                <button className="btn small secondary" type="submit" title="Torna a «inviata» senza toccare altro">Riapri</button>
              </form>
            </>
          )}
          {d.stato === "annullata" && (
            <>
              <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                Annullata{d.annullataIl ? ` il ${dataIt(d.annullataIl)}` : ""}. Il numero {d.rif} resta assegnato.
              </span>
              <form action={cambiaStatoProForma.bind(null, id, "bozza", undefined)} style={{ display: "inline", marginLeft: "auto" }}>
                <button className="btn small secondary" type="submit">Ripristina in bozza</button>
              </form>
            </>
          )}
          {puoEliminare && (
            <form action={deleteProForma.bind(null, id)} style={{ marginLeft: "auto" }}>
              <ConfermaElimina
                verbo="Elimina"
                inCorso="Elimino…"
                oggetto={d.stato === "bozza" ? "questa bozza" : `la pro-forma ${d.rif}`}
                conseguenza="Non è stata emessa su Fatture in Cloud, quindi non c'è nessuna fattura da toccare: sparisce solo questo documento."
              />
            </form>
          )}
        </div>
        {(!e.indirizzo || !e.piva) && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
            Suggerimento: completa l&apos;intestazione del documento (ragione sociale, indirizzo, P. IVA) in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Intestazione documenti</Link>.
          </p>
        )}
      </div>
    </>
  );
}
