import Link from "next/link";
import { ConfermaElimina } from "@/components/ConfermaElimina";
import { TornaIndietro } from "@/components/TornaIndietro";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { riepilogoPartner, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt, pctIt } from "@/lib/format";
import { nomeMese, commissione, dovutoVendita, ivato, residuoFattura, incassatoFattura, parzialmenteIncassata, MESI } from "@/lib/calc";
import { tokenPartner } from "@/lib/riconciliazione";
import { segnaFatturaPagata, segnaFatturaCompensata, riallineaFeeVendite, aggiungiTariffa, eliminaTariffa, aggiungiExtra, eliminaExtra } from "@/lib/actions";
import { feeDaTariffe } from "@/lib/fee";
import { transactionsConfigurato } from "@/lib/transactions";
import { fattureFicDelPartner } from "@/lib/fic-partner";
import { scollegaFatturaCommissioni } from "@/lib/fic-actions";
import { scollegaMovimentoAttribuito, escludiMovimentoDaPartner, ripristinaMovimentoEscluso } from "@/lib/movimenti-partner-actions";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CollegaFatturaCommissioni } from "@/components/CollegaFatturaCommissioni";
import { AnagraficaCard } from "@/components/AnagraficaCard";
import { FattureFicPartner } from "@/components/FattureFicPartner";
import { ContattoAmministrativo } from "@/components/ContattoAmministrativo";
import { CreditoCard } from "@/components/CreditoCard";
import { analisiPartner } from "@/lib/stato-analisi";
import { MailPartnerCard } from "@/components/MailPartnerCard";
import { aiMailConfigurata } from "@/lib/aimail";
import { PagamentoMese } from "@/components/PagamentoMese";
import { RecapAI } from "@/components/RecapAI";
import { costruisciRecapPrompt } from "@/lib/recap";

export const dynamic = "force-dynamic";

function siNo(v: boolean) {
  return v ? "Sì" : "No";
}

export default async function PartnerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    amm?: string; fic?: string; ficreg?: string; mail?: string; nota?: string; mese?: string; anag?: string;
    ficCollegata?: string; ficErrore?: string; errorePag?: string; richiesta?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();
  // Il bottone «Richiedi pagamento» compare solo se Transactions e collegata.
  const trxAttiva = transactionsConfigurato();

  const anno = ANNO_CORRENTE;
  const annoPrec = anno - 1;
  const [{ mesi, rolling }, prec, tariffe, fattureAperte, extra, analisi] = await Promise.all([
    riepilogoPartner(id, anno),
    riepilogoPartner(id, annoPrec),
    prisma.tariffaPartner.findMany({ where: { partnerId: id }, orderBy: [{ dalAnno: "desc" }, { dalMese: "desc" }] }),
    prisma.fatturaServizio.findMany({
      where: { partnerId: id, pagata: false, imponibile: { gt: 0 } },
      orderBy: [{ scadenza: "asc" }],
    }),
    prisma.extraSaldo.findMany({ where: { partnerId: id, anno }, orderBy: { createdAt: "asc" } }),
    analisiPartner(id),
    analisiPartner(id),
  ]);

  // Ultimi 10 movimenti bancari della scheda: i CERTI (attribuiti a questo
  // partner in riconciliazione, `partnerId`) più i CANDIDATI per nome — movimenti
  // non ancora attribuiti a nessuno la cui controparte contiene un token forte
  // del nome partner. Il token lo dà lo stesso tokenizer della riconciliazione,
  // che scarta forme societarie, città e mesi; restano l'insegna e i cognomi.
  // ⚠️ Un nome comune (un partner «… PAOLO») può ancora pescare un omonimo: per
  // questo i candidati sono marcati «per nome — da confermare», non spacciati
  // per certi. I movimenti già attribuiti a un ALTRO partner non entrano.
  const tokenNome = tokenPartner(partner.nome);
  // Movimenti esclusi a mano da QUESTA scheda (omonimi «non è questo partner»):
  // si tolgono dai candidati per nome. Lettura non fatale (tabella dedicata,
  // via SQL raw): se fallisce si mostra tutto invece di rompere la scheda.
  const esclusi = await prisma
    .$queryRaw<{ movimentoId: string }[]>`SELECT "movimentoId" FROM "public"."EsclusioneMovimentoPartner" WHERE "partnerId" = ${id};`
    .catch(() => [] as { movimentoId: string }[]);
  const esclusiIds = esclusi.map((e) => e.movimentoId);
  const ultimiMovimenti = await prisma.transazioneBancaria.findMany({
    where: {
      AND: [
        {
          OR: [
            { partnerId: id },
            ...(tokenNome.length
              ? [{ partnerId: null, OR: tokenNome.map((t) => ({ controparte: { contains: t, mode: "insensitive" as const } })) }]
              : []),
          ],
        },
        ...(esclusiIds.length ? [{ id: { notIn: esclusiIds } }] : []),
      ],
    },
    orderBy: [{ data: "desc" }, { id: "desc" }],
    take: 10,
    select: { id: true, data: true, importo: true, descrizione: true, controparte: true, stato: true, partnerId: true },
  });
  // I movimenti esclusi a mano da questa scheda (per l'undo): dettagli dei soli
  // id esclusi, così si possono rimettere fra i candidati.
  const movimentiEsclusi = esclusiIds.length
    ? await prisma.transazioneBancaria.findMany({
        where: { id: { in: esclusiIds } },
        orderBy: [{ data: "desc" }],
        select: { id: true, data: true, importo: true, descrizione: true, controparte: true },
      })
    : [];
  // Le fatture FIC intestate a questo partner: servono a proporre quale
  // collegare come «fattura commissioni» di un mese. Si caricano una volta per
  // scheda (non per riga) e non fanno mai fallire la pagina: se FIC è giù,
  // resta il campo dove scrivere il numero a mano.
  //
  // ⚠️ Solo se c'è davvero un mese da collegare: sui partner in regola —
  // la maggior parte — sarebbe una chiamata di rete per una tendina che
  // nessuno aprirà, pagata a ogni apertura della scheda.
  const daCollegare = mesi.some((m) => m.vendite.length > 0 && !m.saldo?.commFattEmessa);
  const candidateFic = daCollegare ? await fattureFicDelPartner(id, partner.nome, anno) : [];
  // dove tornano le azioni della scheda
  const tornaA = `/partner/${id}`;
  // voci extra raggruppate per mese, per la gestione nel blocco mensile
  const extraPerMese = new Map<number, typeof extra>();
  for (const e of extra) {
    const arr = extraPerMese.get(e.mese) ?? [];
    arr.push(e);
    extraPerMese.set(e.mese, arr);
  }
  const mesiConDati = mesi.filter(
    (m) => m.fatture.length || m.vendite.length || m.saldo
  );
  // valore mese = vendite + servizi fatturati (netto IVA), per il confronto anno su anno
  const valoreMese = (r: { vendite: number; serviziNetto: number }) => r.vendite + r.serviziNetto;

  // fee attesa per una vendita = fee valida nel suo mese secondo lo storico
  const feeBase = partner.feePercent ?? 0;
  const feeAttesaVendita = (v: { anno: number; mese: number }) => feeDaTariffe(tariffe, v.anno, v.mese, feeBase);
  const venditeDisallineate = mesi
    .flatMap((m) => m.vendite)
    .filter((v) => v.feePercent !== feeAttesaVendita(v)).length;

  const recapPrompt = costruisciRecapPrompt({
    partner,
    anno,
    annoPrec,
    mesi,
    mesiPrec: prec.mesi,
    rolling,
    rollingPrec: prec.rolling,
  });

  return (
    <>
      <TornaIndietro fallback="/partner" label="Partner" />
      <div className="page-head">
        <div>
          <h1 className="page-title">{partner.nome}</h1>
          <p className="page-caption">
            {[partner.categoria, partner.citta, partner.servizi].filter(Boolean).join(" · ") || "Scheda partner"}
          </p>
        </div>
        <div className="page-actions">
          {venditeDisallineate > 0 && (
            <form action={riallineaFeeVendite.bind(null, id, anno)}>
              <button
                className="btn secondary"
                type="submit"
                title={`Applica a ${venditeDisallineate} vendite ${anno} la fee prevista dallo storico per il loro mese`}
              >
                Riallinea fee vendite ({venditeDisallineate})
              </button>
            </form>
          )}
          <Link href={`/fatture/nuova?partnerId=${id}`} className="btn secondary">+ Fattura servizi</Link>
          <Link href={`/vendite/nuova?partnerId=${id}`} className="btn secondary">+ Vendita vendor</Link>
          <Link href={`/partner/${id}/modifica`} className="btn primary">Modifica</Link>
        </div>
      </div>

      <RecapAI partnerId={id} prompt={recapPrompt} />

      <div className="card">
        <div className="info-grid">
          <div className="info-item"><div className="k">Fee su vendite</div><div className="v">{pctIt(partner.feePercent)}</div></div>
          <div className="info-item">
            <div className="k">Cliente per l&apos;anno</div>
            <div className="v">
              {partner.clienteAnno ?? "—"}
              {/* se i movimenti dicono altro, lo si vede subito: le regole sono
                  in Impostazioni → Regole degli stati, il campo resta manuale */}
              {analisi.discordante && (
                <Link
                  href="/impostazioni/stati"
                  className="badge orange"
                  style={{ marginLeft: 8, fontSize: 11.5 }}
                  title={`${analisi.motivo} Le regole si cambiano in Impostazioni → Regole degli stati.`}
                >
                  <span className="dot" />dai movimenti: {analisi.calcolato}
                </Link>
              )}
            </div>
          </div>
          <div className="info-item"><div className="k">GG pagamento fatture</div><div className="v">{partner.ggPagamento}</div></div>
          <div className="info-item"><div className="k">Compensazione</div><div className="v">{siNo(partner.compensazione)}</div></div>
          <div className="info-item"><div className="k">Commissioni a detrazione</div><div className="v">{siNo(partner.commissioniADetrazione)}</div></div>
          <div className="info-item"><div className="k">Debiti 2025</div><div className="v">{euro(partner.debiti2025)}</div></div>
          <div className="info-item"><div className="k">Crediti 2025</div><div className="v">{euro(partner.crediti2025)}</div></div>
          <div className="info-item"><div className="k">IBAN</div><div className="v">{partner.iban ?? "—"}</div></div>
        </div>
        {partner.note && (
          <p style={{ marginTop: 14, fontSize: 13.5, color: "var(--text-secondary)" }}>{partner.note}</p>
        )}
      </div>

      {/* Esito di «Chiedi a Transactions» (richiediPagamento redirige qui):
          senza questi due blocchi il rifiuto finiva nell'URL e la pagina si
          ricaricava identica — il bottone sembrava rotto (visto su ARTE E
          FIORI senza IBAN, 24/08/2026). */}
      {sp.errorePag && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}
        >
          <span style={{ color: "var(--red)", fontSize: 14 }}>Pagamento non richiesto — {sp.errorePag}</span>
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
            <strong>Non è uscito nessun denaro.</strong> L&apos;esito dell&apos;invio compare sul mese tra qualche
            istante (ricarica la pagina); il pagamento va poi autorizzato da una persona dentro{" "}
            <a href="https://deluxy-transactions.vercel.app" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Deluxy Transactions</a>,
            e il mese resta «da bonificare» finché non risulta pagata.
          </p>
        </div>
      )}

      {sp.amm && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          {sp.amm === "importato" ? (
            <span className="badge green"><span className="dot" />Contatto amministrativo importato dal registro</span>
          ) : (
            <span className="badge orange">
              <span className="dot" />Nessun contatto amministrativo trovato nel registro Anagrafiche
            </span>
          )}
        </div>
      )}

      {sp.anag && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className={`badge ${/Collegat|rimoss/i.test(sp.anag) ? "green" : "orange"}`}>
            <span className="dot" />{decodeURIComponent(sp.anag)}
          </span>
        </div>
      )}

      {sp.ficCollegata && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />
            Fattura commissioni collegata: {sp.ficCollegata}
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            Su Fatture in Cloud non è cambiato niente: è l&apos;app che ora sa qual è la fattura di quel mese.
          </p>
        </div>
      )}
      {sp.ficErrore && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}
        >
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.ficErrore}</span>
        </div>
      )}

      {sp.ficreg && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          {sp.ficreg === "ok" ? (
            <span className="badge green"><span className="dot" />Fattura FIC registrata come «Servizio a fatturazione» — ora è nei conteggi</span>
          ) : sp.ficreg === "fee" ? (
            <span className="badge green">
              <span className="dot" />Agganciata come <strong>fattura commissioni</strong> del mese: la fee era già
              conteggiata sulle vendite, quindi non viene sommata di nuovo
            </span>
          ) : sp.ficreg === "gia" ? (
            <span className="badge neutral"><span className="dot" />Quella fattura era già registrata come servizio</span>
          ) : (
            <span className="badge orange"><span className="dot" />Dati insufficienti per registrare la fattura</span>
          )}
        </div>
      )}

      <Suspense
        fallback={
          <>
            <h2 className="section-title">Salute del credito</h2>
            <div className="card">
              <span className="muted" style={{ fontSize: 13.5 }}>Calcolo l&apos;aging del credito…</span>
            </div>
          </>
        }
      >
        <CreditoCard partnerId={id} />
      </Suspense>

      <ContattoAmministrativo partner={partner} fattureAperte={fattureAperte} />

      <Suspense
        fallback={
          <>
            <h2 className="section-title">Anagrafica dal registro centralizzato</h2>
            <div className="card">
              <span className="muted" style={{ fontSize: 13.5 }}>Carico l&apos;anagrafica dal registro…</span>
            </div>
          </>
        }
      >
        <AnagraficaCard nomePartner={partner.nome} anagraficaId={partner.anagraficaId} partnerId={partner.id} />
      </Suspense>

      <h2 className="section-title">Ultimi movimenti bancari</h2>
      <div className="card tight" style={{ marginBottom: 24 }}>
        {ultimiMovimenti.length === 0 ? (
          <p className="muted" style={{ fontSize: 13.5, padding: "16px 20px", margin: 0 }}>
            Nessun movimento bancario per questo partner: né attribuito in riconciliazione, né con questo
            nome nella controparte. Compaiono qui appena arrivano da <Link href="/movimenti">Movimenti</Link> o
            si riconciliano in <Link href="/transazioni">Import &amp; riconciliazione</Link>.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th>Stato</th><th className="num">Importo</th><th></th></tr>
                </thead>
                <tbody>
                  {ultimiMovimenti.map((m) => (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/movimenti/${m.id}`}>{dataIt(m.data)}</Link>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <Link href={`/movimenti/${m.id}`} style={{ fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.descrizione}>
                          {m.descrizione}
                        </Link>
                        {m.controparte && <div className="muted" style={{ fontSize: 12 }}>{m.controparte}</div>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {m.partnerId === id ? (
                          m.stato === "registrata" ? (
                            <span className="badge green"><span className="dot" />registrata</span>
                          ) : m.stato === "ignorata" ? (
                            <span className="badge neutral"><span className="dot" />ignorata</span>
                          ) : (
                            <span className="badge orange"><span className="dot" />da lavorare</span>
                          )
                        ) : (
                          <span className="badge neutral" title="Non ancora attribuito a questo partner: abbinato solo per nome della controparte. Conferma in riconciliazione.">
                            <span className="dot" />per nome — da confermare
                          </span>
                        )}
                      </td>
                      <td className={`num ${m.importo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        {m.importo > 0 ? "+" : "−"}{euro(Math.abs(m.importo))}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        {m.partnerId === id ? (
                          // Attribuito: scollegare azzera il legame e lo rimette
                          // in coda alla riconciliazione.
                          <form action={scollegaMovimentoAttribuito.bind(null, id, m.id)} style={{ display: "inline" }}>
                            <ConfermaElimina
                              className="btn small secondary"
                              classeConferma="btn small danger-solid"
                              trigger="Scollega"
                              inCorso="Scollego…"
                              verbo="Scollega"
                              oggetto="questo movimento dal partner"
                              conseguenza="Il movimento non si cancella: torna fra quelli da riconciliare, per attribuirlo al partner giusto."
                            />
                          </form>
                        ) : (
                          // Candidato per nome (omonimo): non è collegato, lo si
                          // esclude in modo persistente SOLO da questa scheda.
                          <form action={escludiMovimentoDaPartner.bind(null, id, m.id)} style={{ display: "inline" }}>
                            <ConfermaElimina
                              className="btn small secondary"
                              classeConferma="btn small danger-solid"
                              trigger="Non è di questo partner"
                              inCorso="Escludo…"
                              verbo="Escludi"
                              oggetto="questo movimento da questa scheda"
                              conseguenza="È un omonimo: sparisce da qui in modo permanente, ma resta riconciliabile altrove e per il partner giusto."
                            />
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 12, padding: "10px 20px", margin: 0 }}>
              I movimenti <strong>attribuiti</strong> a questo partner in riconciliazione, più quelli
              non ancora attribuiti che ne portano il nome nella controparte (marcati «per nome — da
              confermare»).{" "}
              <Link href={`/movimenti?q=${encodeURIComponent(partner.nome)}`}>Cerca «{partner.nome}» in tutti i movimenti →</Link>
            </p>
          </>
        )}
        {movimentiEsclusi.length > 0 && (
          <details style={{ borderTop: "1px solid var(--hairline)" }}>
            <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 20px" }}>
              Movimenti esclusi da questa scheda ({movimentiEsclusi.length}) — omonimi nascosti a mano
            </summary>
            <div className="table-wrap">
              <table>
                <tbody>
                  {movimentiEsclusi.map((m) => (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/movimenti/${m.id}`}>{dataIt(m.data)}</Link>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <Link href={`/movimenti/${m.id}`} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.descrizione}>
                          {m.descrizione}
                        </Link>
                        {m.controparte && <div className="muted" style={{ fontSize: 12 }}>{m.controparte}</div>}
                      </td>
                      <td className={`num ${m.importo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        {m.importo > 0 ? "+" : "−"}{euro(Math.abs(m.importo))}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <form action={ripristinaMovimentoEscluso.bind(null, id, m.id)} style={{ display: "inline" }}>
                          <BottoneInvio className="btn small secondary" inCorso="Ripristino…" title="Rimette questo movimento fra i candidati per nome di questa scheda">
                            Ripristina
                          </BottoneInvio>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {aiMailConfigurata() && (
        <Suspense
          key={`mail-${sp.mail ?? ""}`}
          fallback={
            <>
              <h2 className="section-title">Posta con il cliente</h2>
              <div className="card">
                <span className="muted" style={{ fontSize: 13.5 }}>Cerco la posta su AI Mail…</span>
              </div>
            </>
          }
        >
          <MailPartnerCard
            partnerId={id}
            nomePartner={partner.nome}
            anagraficaId={partner.anagraficaId}
            q={sp.mail}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <FattureFicPartner partnerId={id} partnerNome={partner.nome} />
      </Suspense>

      <h2 className="section-title">Fee nel tempo</h2>
      <div className="card">
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
          Fee base attuale <strong>{pctIt(partner.feePercent)}</strong>. Se la fee cambia da un certo
          mese, aggiungi una decorrenza: le vendite di quel mese in poi la useranno automaticamente,
          quelle precedenti restano invariate.
        </p>
        {tariffe.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="mini-table">
              <thead>
                <tr><th>Dal</th><th>Fee</th><th></th></tr>
              </thead>
              <tbody>
                {tariffe.map((t) => (
                  <tr key={t.id}>
                    <td>{nomeMese(t.dalMese)} {t.dalAnno}</td>
                    <td>{pctIt(t.feePercent)}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={eliminaTariffa.bind(null, t.id, id)}>
                        <ConfermaElimina
                          oggetto="questa tariffa"
                          conseguenza="I mesi coperti da questa fee useranno la tariffa precedente al ricalcolo."
                        />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={aggiungiTariffa.bind(null, id)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="field-label">Dal mese</label>
            <select name="dalMese" defaultValue={new Date().getMonth() + 1} style={{ width: "auto" }}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno</label>
            <input type="number" name="dalAnno" defaultValue={anno} step="1" style={{ width: 90 }} />
          </div>
          <div>
            <label className="field-label">Fee %</label>
            <input type="number" name="feePercent" step="0.1" min="0" max="100" required style={{ width: 90 }} placeholder="es. 22" />
          </div>
          <button className="btn primary small" type="submit">Aggiungi decorrenza</button>
          {venditeDisallineate > 0 && (
            <span className="muted" style={{ fontSize: 12.5, alignSelf: "center", marginLeft: "auto" }}>
              {venditeDisallineate} vendite {anno} non allineate allo storico — usa «Riallinea fee vendite» in alto.
            </span>
          )}
        </form>
      </div>

      <h2 className="section-title">Rolling {anno}</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite come vendor</div>
          <div className="kpi-value">{euro(rolling.vendite)}</div>
          <div className="kpi-sub">
            Commissioni {euro(rolling.commissioni)} · {annoPrec} intero: {euro(prec.rolling.vendite)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Servizi fatturati (netto IVA)</div>
          <div className="kpi-value">{euro(rolling.fatture)}</div>
          <div className="kpi-sub">
            Stima chiusura {euro(rolling.stimaChiusura)} · {annoPrec} intero: {euro(prec.rolling.fatture)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dovuto al partner (YTD)</div>
          <div className="kpi-value">{euro(rolling.incassiNettoCommissioni)}</div>
          <div className="kpi-sub">Bonificato {euro(rolling.pagatoAlPartner)} · incassato {euro(rolling.incassatoDalPartner)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{partner.compensazione ? "Residuo (in compensazione)" : "Partite aperte"}</div>
          {partner.compensazione ? (
            <>
              <div className={`kpi-value ${Math.abs(rolling.residuo) < 0.01 ? "" : rolling.residuo > 0 ? "pos" : "neg"}`}>
                {euro(rolling.residuo)}
              </div>
              <div className="kpi-sub">
                {rolling.residuo > 0.01 ? "il partner deve a Deluxy" : rolling.residuo < -0.01 ? "Deluxy deve al partner" : "pareggiato"}
              </div>
            </>
          ) : (
            <>
              <div className={`kpi-value ${rolling.daBonificare >= 0.01 ? "neg" : ""}`} style={{ fontSize: 22 }}>
                {euro(rolling.daBonificare)}
              </div>
              <div className="kpi-sub">
                da bonificare al partner · <strong>{euro(rolling.daIncassare)}</strong> da incassare (fatture)
              </div>
            </>
          )}
        </div>
      </div>

      <h2 className="section-title">Movimenti mensili {anno}</h2>
      {mesiConDati.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun movimento</div>
            <div className="empty-text">Inserisci una fattura servizi o una vendita vendor per iniziare.</div>
          </div>
        </div>
      )}
      {mesiConDati.map(({ mese, fatture, vendite, saldo, riepilogo: r }) => (
        <div className="month-block" key={mese} id={`mese-${mese}`} style={{ background: "var(--surface)", scrollMarginTop: 20 }}>
          <div className="month-head">
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              {nomeMese(mese)} {anno}
              {(() => {
                const v25 = valoreMese(prec.mesi[mese - 1].riepilogo);
                const v26 = valoreMese(r);
                if (!v25) return <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{annoPrec}: —</span>;
                const dp = ((v26 - v25) / v25) * 100;
                return (
                  <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                    {annoPrec}: {euro(v25)} ·{" "}
                    <span style={{ color: dp >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                      {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
                    </span>
                  </span>
                );
              })()}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* stellina: questo mese ha una nota dell'operatore (il testo è nel
                  tooltip, la nota vera si legge e si modifica in fondo al blocco) */}
              {saldo?.note?.trim() && (
                <span className="badge gold" title={`Nota del mese: ${saldo.note.trim()}`}>
                  ★ Nota
                </span>
              )}
              {sp.nota && sp.mese === String(mese) && (
                <span className="badge green">
                  <span className="dot" />
                  {sp.nota === "ok" ? "Nota salvata" : "Nota rimossa"}
                </span>
              )}
              {r.pareggiato && <span className="badge green"><span className="dot" />Pareggiato</span>}
              {r.daBonificare >= 0.01 && (
                <span className="badge orange"><span className="dot" />Da bonificare {euro(r.daBonificare)}</span>
              )}
              {r.daIncassare >= 0.01 && (
                <span className="badge orange"><span className="dot" />Da incassare {euro(r.daIncassare)}</span>
              )}
              <Link href={`/saldi?anno=${anno}&mese=${mese}&q=${encodeURIComponent(partner.nome.slice(0, 12))}`} className="btn small secondary">
                Saldo mese
              </Link>
            </span>
          </div>
          <div className="month-body">
            <div className="table-wrap">
              <table className="mini-table">
                <tbody>
                  {fatture.map((f) => (
                    <tr key={f.id}>
                      <td style={{ width: 170 }} className="muted">Servizi a fatturazione</td>
                      <td>
                        {f.tipologia.nome} ·{" "}
                        <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }} title="Apri il record della fattura">
                          fatt. {f.numero ?? "s.n."}
                        </Link>
                      </td>
                      <td>scad. {dataIt(f.scadenza)}</td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {f.pagata ? (
                            <>
                              <span className="badge green">
                                <span className="dot" />
                                Saldata{f.dataPagamento ? ` ${dataIt(f.dataPagamento)}` : ""}
                              </span>
                              <form action={segnaFatturaPagata.bind(null, f.id, false, undefined)}>
                                <button className="btn small secondary" type="submit" title="Riporta da incassare (storna anche l'incasso registrato)">
                                  Riapri
                                </button>
                              </form>
                            </>
                          ) : f.compensata ? (
                            <>
                              <span className="badge blue">
                                <span className="dot" />
                                In compensazione
                              </span>
                              <form action={segnaFatturaCompensata.bind(null, f.id, false)}>
                                <button className="btn small secondary" type="submit" title="Riporta da incassare">
                                  Riapri
                                </button>
                              </form>
                            </>
                          ) : (
                            <>
                              {parzialmenteIncassata(f) ? (
                                <span className="badge gold"><span className="dot" />Residuo {euro(residuoFattura(f))}</span>
                              ) : (
                                <span className="badge orange"><span className="dot" />Da incassare</span>
                              )}
                              <Link href={`/fatture/${f.id}`} className="btn small secondary" title="Registra un incasso totale o parziale">
                                Incassa…
                              </Link>
                              <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)} style={{ display: "inline" }}>
                                <button
                                  className="btn small secondary"
                                  type="submit"
                                  title="Bonifico RICEVUTO in banca per l'intero importo: registra l'incasso; il dovuto vendite resta interamente da pagare al partner"
                                >
                                  Salda tutto
                                </button>
                              </form>
                              <form action={segnaFatturaCompensata.bind(null, f.id, true)} style={{ display: "inline" }}>
                                <button
                                  className="btn small secondary"
                                  type="submit"
                                  title="NIENTE bonifico: l'importo viene scalato dai prossimi dovuti al partner finché è coperto"
                                >
                                  Compensata
                                </button>
                              </form>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="num">
                        {euro(f.imponibile)} <span className="muted">+IVA → {euro(ivato(f))}</span>
                        {parzialmenteIncassata(f) && (
                          <div className="muted" style={{ fontSize: 11 }}>incassato {euro(incassatoFattura(f))}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {vendite.map((v) => (
                    <tr key={v.id}>
                      <td className="muted">Vendite come vendor</td>
                      <td>
                        <Link href={`/vendite/${v.id}`} style={{ color: "var(--blue)" }} title="Apri e modifica la vendita (incasso, fee…)">
                          {v.descrizione ?? "Vendite"}
                        </Link>
                        {v.data ? ` · ${dataIt(v.data)}` : ""}
                      </td>
                      <td>
                        fee {pctIt(v.feePercent)} → comm. {euro(commissione(v))}
                        {v.feePercent !== feeAttesaVendita(v) && (
                          <Link href={`/vendite/${v.id}`} className="badge orange" style={{ marginLeft: 6 }} title={`Per ${nomeMese(v.mese)} la fee prevista è ${feeAttesaVendita(v)}%`}>
                            <span className="dot" />attesa {pctIt(feeAttesaVendita(v))}?
                          </Link>
                        )}
                      </td>
                      <td>
                        {saldo?.commFattEmessa ? (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span className="badge green"><span className="dot" />Fatt. comm. {saldo.commFattNumero ?? ""}</span>
                            {/* correggibile: collegare è un clic, e un numero
                                sbagliato non deve richiedere il database */}
                            <form
                              action={scollegaFatturaCommissioni.bind(null, partner.id, anno, mese, tornaA)}
                              style={{ display: "inline" }}
                            >
                              <button
                                className="btn small secondary"
                                type="submit"
                                title="Toglie il collegamento: il mese torna «da emettere». Non cancella niente su Fatture in Cloud."
                              >
                                Scollega
                              </button>
                            </form>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span className="badge neutral"><span className="dot" />Fatt. comm. da emettere</span>
                            <Link
                              className="btn small secondary"
                              href={`/fic/emetti?partnerId=${partner.id}&anno=${anno}&mese=${mese}`}
                              title="Crea la fattura commissioni su Fatture in Cloud"
                            >
                              Emetti
                            </Link>
                            {/* la fattura può essere già stata fatta a mano su FIC */}
                            <CollegaFatturaCommissioni
                              partnerId={partner.id}
                              partnerNome={partner.nome}
                              anno={anno}
                              mese={mese}
                              tornaA={tornaA}
                              candidate={candidateFic}
                            />
                          </span>
                        )}
                      </td>
                      <td className="num">{euro(v.incassoLordo)} <span className="muted">→ dovuto {euro(dovutoVendita(v))}</span></td>
                    </tr>
                  ))}
                  <tr>
                    <td className="muted" style={{ verticalAlign: "top" }}>Extra</td>
                    <td colSpan={3}>
                      {(extraPerMese.get(mese) ?? []).map((e) => (
                        <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0", fontSize: 13 }}>
                          <span style={{ color: e.importo >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500, minWidth: 78 }} className="num">
                            {e.importo >= 0 ? "+" : ""}{euro(e.importo)}
                          </span>
                          <span style={{ color: "var(--text-secondary)" }}>{e.descrizione ?? (e.importo >= 0 ? "aggiunta" : "detrazione")}</span>
                          <form action={eliminaExtra.bind(null, e.id, id)} style={{ display: "inline", marginLeft: "auto" }}>
                            <ConfermaElimina
                              oggetto="questa voce extra"
                              conseguenza="L'importo aggiunto o detratto sparisce dal saldo del mese."
                              title="Elimina questa voce extra"
                            />
                          </form>
                        </div>
                      ))}
                      <form action={aggiungiExtra.bind(null, id, anno, mese)} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        <input type="text" name="descrizione" placeholder="descrizione (facoltativa)" style={{ fontSize: 12.5, padding: "5px 8px", flex: "1 1 160px" }} />
                        <input type="number" name="importo" step="0.01" placeholder="+ o − €" title="Positivo = aggiunta a favore del partner · Negativo = detrazione" style={{ fontSize: 12.5, padding: "5px 8px", width: 110 }} required />
                        <button className="btn small secondary" type="submit">Aggiungi extra</button>
                      </form>
                    </td>
                    <td className="num" style={{ verticalAlign: "top", fontWeight: 600 }}>{euro(r.aggiunte - r.detrazioni)}</td>
                  </tr>
                  {r.compensazione ? (
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="muted">Saldo del mese (compensazione)</td>
                      <td colSpan={2}>
                        Fatture IVATE {euro(r.serviziIvato)} − dovuto vendite {euro(r.dovutoPartner)} ={" "}
                        <strong>{euro(r.saldo)}</strong>{" "}
                        <span className="muted">
                          {Math.abs(r.saldo) < 0.01 ? "" : r.saldo > 0 ? "(il partner ci deve)" : "(dobbiamo al partner)"}
                        </span>
                      </td>
                      <td>
                        {saldo?.bonificoImporto != null && (
                          <span className="muted">
                            {saldo.bonificoImporto > 0 ? "Pagato al partner" : "Incassato"}{" "}
                            {euro(Math.abs(saldo.bonificoImporto))}
                            {saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                          </span>
                        )}
                      </td>
                      <td className={`num ${r.pareggiato ? "" : r.residuo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        residuo {euro(r.residuo)}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Da bonificare al partner</td>
                        <td colSpan={2}>
                          Dovuto vendite {euro(r.dovutoPartner)}
                          {r.bonificoInviato > 0 && <> − già bonificato {euro(r.bonificoInviato)}</>}
                        </td>
                        <td>
                          {saldo?.bonificoImporto != null && saldo.bonificoImporto > 0 && (
                            <span className="muted">
                              Bonifico inviato{saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={`num ${r.daBonificare >= 0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(r.daBonificare)}
                        </td>
                      </tr>
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Da incassare dal partner</td>
                        <td colSpan={2}>
                          Fatture non saldate {euro(r.serviziNonPagatiNetto)}{" "}
                          <span className="muted">+IVA → {euro(r.serviziNonPagati)}</span>
                          {r.bonificoRicevuto > 0 && <> − acconti ricevuti {euro(r.bonificoRicevuto)}</>}
                        </td>
                        <td>
                          {saldo?.bonificoImporto != null && saldo.bonificoImporto < 0 && (
                            <span className="muted">
                              Incasso registrato{saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={`num ${r.daIncassare >= 0.01 ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(r.daIncassare)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <PagamentoMese
              partnerId={partner.id}
              anno={anno}
              mese={mese}
              daBonificare={r.daBonificare}
              daIncassare={r.daIncassare}
              bonificoImporto={saldo?.bonificoImporto ?? null}
              bonificoData={saldo?.bonificoData ?? null}
              note={saldo?.note ?? null}
              noteAggiornateIl={saldo?.noteAggiornateIl ?? null}
              trxAttiva={trxAttiva}
              richiestaRif={saldo?.richiestaRif ?? null}
              richiestaStato={saldo?.richiestaStato ?? null}
              richiestaIl={saldo?.richiestaIl ?? null}
            />
          </div>
        </div>
      ))}

      {mesiConDati.length > 0 && (() => {
        // Totale YTD: somma dei mesi con dati, confrontata con lo stesso periodo 2025
        const ultimoMese = Math.max(...mesiConDati.map((m) => m.mese));
        const ytd = mesi.slice(0, ultimoMese).map((m) => m.riepilogo);
        const sum = (fn: (r: (typeof ytd)[number]) => number) => ytd.reduce((a, r) => a + fn(r), 0);
        const ytdPrec = prec.mesi.slice(0, ultimoMese).map((m) => m.riepilogo);
        const sumPrec = (fn: (r: (typeof ytdPrec)[number]) => number) => ytdPrec.reduce((a, r) => a + fn(r), 0);
        const totCur = sum((r) => r.vendite + r.serviziNetto);
        const totPrec = sumPrec((r) => r.vendite + r.serviziNetto);
        const dp = totPrec ? ((totCur - totPrec) / totPrec) * 100 : null;
        const daBonificareYtd = sum((r) => r.daBonificare);
        const daIncassareYtd = sum((r) => r.daIncassare);
        return (
          <div className="month-block" style={{ background: "var(--surface)" }}>
            <div className="month-head">
              <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                Totale YTD {anno} (Gennaio–{nomeMese(ultimoMese)})
                <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {annoPrec} stesso periodo: {totPrec ? euro(totPrec) : "—"}
                  {dp != null && (
                    <>
                      {" · "}
                      <span style={{ color: dp >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                        {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
                      </span>
                    </>
                  )}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {partner.compensazione ? (
                  // in compensazione crediti e debiti si annullano: un solo netto
                  Math.abs(daIncassareYtd - daBonificareYtd) < 0.01 ? (
                    <span className="badge green"><span className="dot" />Compensato — pari</span>
                  ) : daIncassareYtd - daBonificareYtd > 0 ? (
                    <span className="badge orange"><span className="dot" />Da incassare {euro(daIncassareYtd - daBonificareYtd)} (netto)</span>
                  ) : (
                    <span className="badge orange"><span className="dot" />Da bonificare {euro(daBonificareYtd - daIncassareYtd)} (netto)</span>
                  )
                ) : (
                  <>
                    {daBonificareYtd < 0.01 && daIncassareYtd < 0.01 && (
                      <span className="badge green"><span className="dot" />Tutto pareggiato</span>
                    )}
                    {daBonificareYtd >= 0.01 && (
                      <span className="badge orange"><span className="dot" />Da bonificare {euro(daBonificareYtd)}</span>
                    )}
                    {daIncassareYtd >= 0.01 && (
                      <span className="badge orange"><span className="dot" />Da incassare {euro(daIncassareYtd)}</span>
                    )}
                  </>
                )}
              </span>
            </div>
            <div className="month-body">
              <div className="table-wrap">
                <table className="mini-table">
                  <tbody>
                    <tr>
                      <td style={{ width: 170 }} className="muted">Vendite come vendor</td>
                      <td>commissioni {euro(sum((r) => r.commissioni))}</td>
                      <td className="num">{euro(sum((r) => r.vendite))} <span className="muted">→ dovuto {euro(sum((r) => r.dovutoPartner))}</span></td>
                    </tr>
                    <tr>
                      <td className="muted">Servizi a fatturazione</td>
                      <td>IVA inclusa {euro(sum((r) => r.serviziIvato))}</td>
                      <td className="num">{euro(sum((r) => r.serviziNetto))} <span className="muted">netto IVA</span></td>
                    </tr>
                    {partner.compensazione ? (
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Saldo compensato (netto)</td>
                        <td>Già incassato {euro(rolling.incassatoDalPartner)} · già bonificato {euro(rolling.pagatoAlPartner)}</td>
                        <td className={`num ${daIncassareYtd - daBonificareYtd > 0.01 ? "pos" : daIncassareYtd - daBonificareYtd < -0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(daIncassareYtd - daBonificareYtd)}{" "}
                          <span className="muted">
                            {daIncassareYtd - daBonificareYtd > 0.01 ? "(il partner ci deve)" : daIncassareYtd - daBonificareYtd < -0.01 ? "(dobbiamo bonificare)" : "(pari)"}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr style={{ background: "var(--bg)" }}>
                          <td className="muted">Da bonificare al partner</td>
                          <td>Già bonificato {euro(rolling.pagatoAlPartner)}</td>
                          <td className={`num ${daBonificareYtd >= 0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                            {euro(daBonificareYtd)}
                          </td>
                        </tr>
                        <tr style={{ background: "var(--bg)" }}>
                          <td className="muted">Da incassare dal partner</td>
                          <td>Già incassato {euro(rolling.incassatoDalPartner)}</td>
                          <td className={`num ${daIncassareYtd >= 0.01 ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                            {euro(daIncassareYtd)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
