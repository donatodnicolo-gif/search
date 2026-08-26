import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dataIt, dataInput, euro, numero } from "@/lib/formato";
import {
  compensoCorrente,
  costoAziendaAnnuo,
  eAutonomo,
  FREQUENZE_ATTIVITA,
  inquadramentoCorrente,
  MODALITA_LAVORO,
  MOTIVI_COMPENSO,
  nomeModalitaLavoro,
  nomeMotivoCompenso,
  nomeTipoContratto,
  prossimaDecorrenza,
  QUALIFICHE,
  statoScadenza,
  TIPI_CONTRATTO,
} from "@/lib/organico";
import {
  aggiornaAttivitaPersona,
  aggiornaBenefitPersona,
  aggiornaPersona,
  assegnaBenefit,
  assegnaMansione,
  cessaPersona,
  creaAttivitaPersona,
  creaCompenso,
  creaInquadramento,
  eliminaAttivitaPersona,
  eliminaCompenso,
  eliminaInquadramento,
  riattivaPersona,
  rimuoviAssegnazione,
  rimuoviBenefit,
  segnaPrincipale,
} from "@/lib/azioni";
import { FormConferma } from "@/components/FormConferma";

// La scheda della persona: dati, mansioni, inquadramento e retribuzione come
// STORIA (il corrente è l'ultima decorrenza non futura, calcolato in
// lib/organico.ts e in nessun altro posto).

export const dynamic = "force-dynamic";

export default async function SchedaPersona({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; nota?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      funzione: true,
      responsabile: true,
      riporti: { where: { stato: "attivo" }, orderBy: { nome: "asc" } },
      mansionario: { orderBy: { ordine: "asc" } },
      assegnazioni: {
        include: {
          mansione: { include: { funzione: true, attivita: { orderBy: { ordine: "asc" } } } },
        },
        orderBy: { creatoIl: "asc" },
      },
      inquadramenti: { orderBy: { decorrenza: "desc" } },
      compensi: { orderBy: { decorrenza: "desc" } },
      benefit: { include: { tipo: true }, orderBy: { creatoIl: "asc" } },
    },
  });
  if (!persona) notFound();

  const [funzioni, colleghi, mansioniTutte, tipiBenefit] = await Promise.all([
    prisma.funzione.findMany({ where: { attiva: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.persona.findMany({ where: { stato: "attivo", NOT: { id } }, orderBy: { nome: "asc" } }),
    prisma.mansione.findMany({ where: { attiva: true }, include: { funzione: true }, orderBy: { nome: "asc" } }),
    prisma.tipoBenefit.findMany({ where: { attivo: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
  ]);

  const inquadramento = inquadramentoCorrente(persona.inquadramenti);
  // Un autonomo (P.IVA, consulente) non ha una RAL: la sezione Retribuzione
  // parla di compenso. Il tipo di riferimento è il contratto corrente o, se
  // non c'è, quello che decorrerà.
  const autonomo = eAutonomo(
    (inquadramento ?? prossimaDecorrenza(persona.inquadramenti))?.tipoContratto,
  );
  const compenso = compensoCorrente(persona.compensi);
  const costo = costoAziendaAnnuo(compenso, { autonomo });
  const scadenza = inquadramento ? statoScadenza(inquadramento.scadenza) : null;
  const assegnate = new Set(persona.assegnazioni.map((a) => a.mansioneId));
  const assegnabili = mansioniTutte.filter((m) => !assegnate.has(m.id));
  const oggiInput = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">{persona.nome}</h1>
          <p className="page-sub">
            {[persona.ruolo, persona.funzione?.nome].filter(Boolean).join(" · ") || "Scheda della persona"}
          </p>
        </div>
        <div className="page-azioni">
          {persona.modalitaLavoro && (
            <span className="badge">
              <span className="dot" />
              {nomeModalitaLavoro(persona.modalitaLavoro).toLowerCase()}
            </span>
          )}
          {persona.stato === "cessato" ? (
            <span className="badge rosso">
              <span className="dot" />
              cessata {dataIt(persona.dataCessazione)}
            </span>
          ) : (
            <span className="badge verde">
              <span className="dot" />
              attiva
            </span>
          )}
          <a className="btn ghost" href="/">
            Torna all&apos;elenco
          </a>
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}
      {sp.nota && <div className="avviso-nota">{sp.nota}</div>}

      {/* ---------- Dati ---------- */}
      <form action={aggiornaPersona} className="card">
        <input type="hidden" name="id" value={persona.id} />
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Dati della persona</h2>
            <p className="card-sub">Anagrafica, funzione e posto nell&apos;organigramma.</p>
          </div>
        </div>
        <div className="form-griglia">
          <div className="campo">
            <label>Nome e cognome *</label>
            <input type="text" name="nome" required defaultValue={persona.nome} />
          </div>
          <div className="campo">
            <label>Ruolo (titolo)</label>
            <input type="text" name="ruolo" defaultValue={persona.ruolo} />
          </div>
          <div className="campo">
            <label>Email</label>
            <input type="email" name="email" defaultValue={persona.email} />
          </div>
          <div className="campo">
            <label>Telefono</label>
            <input type="tel" name="telefono" defaultValue={persona.telefono} />
          </div>
          <div className="campo">
            <label>Sede</label>
            <input type="text" name="sede" defaultValue={persona.sede} />
          </div>
          <div className="campo">
            <label>Modalità di lavoro</label>
            <select name="modalitaLavoro" defaultValue={persona.modalitaLavoro}>
              <option value="">— non indicata —</option>
              {MODALITA_LAVORO.map((m) => (
                <option key={m.chiave} value={m.chiave}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Funzione</label>
            <select name="funzioneId" defaultValue={persona.funzioneId ?? ""}>
              <option value="">— nessuna —</option>
              {funzioni.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Riporta a</label>
            <select name="responsabileId" defaultValue={persona.responsabileId ?? ""}>
              <option value="">— nessuno (vertice) —</option>
              {colleghi.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Data di assunzione</label>
            <input type="date" name="dataAssunzione" defaultValue={dataInput(persona.dataAssunzione)} />
          </div>
          <div className="campo largo">
            <label>Note</label>
            <textarea name="note" defaultValue={persona.note} />
          </div>
        </div>
        <div className="form-azioni">
          <button type="submit" className="btn">
            Salva i dati
          </button>
        </div>
      </form>

      {persona.riporti.length > 0 && (
        <div className="card">
          <h2 className="card-titolo">Riportano a {persona.nome.split(" ")[0]}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {persona.riporti.map((r) => (
              <a key={r.id} className="badge" href={`/persone/${r.id}`}>
                <span className="dot" />
                {r.nome}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Mansioni ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Mansioni</h2>
            <p className="card-sub">
              Cosa copre questa persona. La principale è quella che la descrive meglio; le attività di
              ogni mansione vivono in «Funzioni e mansioni».
            </p>
          </div>
        </div>

        {persona.assegnazioni.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-tertiary)", marginBottom: 14 }}>
            Nessuna mansione assegnata.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {persona.assegnazioni.map((a) => (
              <div key={a.id} className="riga-chiave">
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 550, fontSize: 14 }}>
                    {a.mansione.nome}
                    {a.principale && (
                      <span className="badge oro" style={{ marginLeft: 8 }}>
                        <span className="dot" />
                        principale
                      </span>
                    )}
                  </div>
                  <div className="sotto-nome">{a.mansione.funzione.nome}</div>
                </div>
                {!a.principale && (
                  <form action={segnaPrincipale} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="personaId" value={persona.id} />
                    <button className="btn ghost mini" type="submit">
                      Segna principale
                    </button>
                  </form>
                )}
                <FormConferma
                  azione={rimuoviAssegnazione}
                  conferma={`Togliere la mansione «${a.mansione.nome}» a ${persona.nome}?`}
                  campi={{ id: a.id, personaId: persona.id }}
                  etichetta="Togli"
                  classe="btn pericolo mini"
                />
              </div>
            ))}
          </div>
        )}

        {assegnabili.length > 0 ? (
          <form action={assegnaMansione} className="form-inline">
            <input type="hidden" name="personaId" value={persona.id} />
            <div className="campo">
              <label>Assegna una mansione</label>
              <select name="mansioneId" required defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {assegnabili.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.funzione.nome} — {m.nome}
                  </option>
                ))}
              </select>
            </div>
            <label className="spunta" style={{ paddingBottom: 9 }}>
              <input type="checkbox" name="principale" value="1" /> principale
            </label>
            <button className="btn" type="submit">
              Assegna
            </button>
          </form>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {mansioniTutte.length === 0 ? (
              <>
                Non esistono ancora mansioni: si creano in <a href="/funzioni" style={{ textDecoration: "underline" }}>Funzioni e mansioni</a>.
              </>
            ) : (
              "Tutte le mansioni esistenti sono già assegnate a questa persona."
            )}
          </p>
        )}
      </div>

      {/* ---------- Mansionario personale ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Mansionario</h2>
            <p className="card-sub">
              La lista delle cose che {persona.nome.split(" ")[0]} fa davvero, una per riga. Le
              attività-tipo delle mansioni assegnate restano sotto, per confronto.
            </p>
          </div>
        </div>

        {persona.mansionario.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-tertiary)", marginBottom: 12 }}>
            Ancora vuoto: aggiungi la prima attività.
          </p>
        ) : (
          <div className="attivita-lista" style={{ marginBottom: 14 }}>
            {persona.mansionario.map((a) => (
              <div key={a.id} className="attivita-riga">
                <span className="attivita-punto">•</span>
                <span>{a.nome}</span>
                {a.dettaglio && <span style={{ color: "var(--text-secondary)" }}>— {a.dettaglio}</span>}
                {a.frequenza && <span className="attivita-freq">({a.frequenza})</span>}
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <details className="modifica-inline">
                    <summary>✎</summary>
                    <form action={aggiornaAttivitaPersona} className="form-inline">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="personaId" value={persona.id} />
                      <div className="campo">
                        <label>Attività *</label>
                        <input type="text" name="nome" required defaultValue={a.nome} />
                      </div>
                      <div className="campo" style={{ flex: 2 }}>
                        <label>Dettaglio</label>
                        <input type="text" name="dettaglio" defaultValue={a.dettaglio} />
                      </div>
                      <div className="campo" style={{ maxWidth: 160 }}>
                        <label>Frequenza</label>
                        <select name="frequenza" defaultValue={a.frequenza}>
                          <option value="">— non indicata —</option>
                          {FREQUENZE_ATTIVITA.map((fr) => (
                            <option key={fr} value={fr}>
                              {fr}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className="btn ghost mini" type="submit">
                        Salva
                      </button>
                    </form>
                  </details>
                  <FormConferma
                    azione={eliminaAttivitaPersona}
                    conferma={`Eliminare «${a.nome}» dal mansionario di ${persona.nome}?`}
                    campi={{ id: a.id, personaId: persona.id }}
                    etichetta="×"
                    classe="chip-x"
                  />
                </span>
              </div>
            ))}
          </div>
        )}

        <form action={creaAttivitaPersona} className="form-inline">
          <input type="hidden" name="personaId" value={persona.id} />
          <div className="campo">
            <label>Nuova attività</label>
            <input type="text" name="nome" required placeholder="Es. rispondere ai clienti VIP su WhatsApp" />
          </div>
          <div className="campo" style={{ flex: 2 }}>
            <label>Dettaglio</label>
            <input type="text" name="dettaglio" placeholder="Come, con chi, con che strumenti (facoltativo)" />
          </div>
          <div className="campo" style={{ maxWidth: 170 }}>
            <label>Frequenza</label>
            <select name="frequenza" defaultValue="">
              <option value="">— non indicata —</option>
              {FREQUENZE_ATTIVITA.map((fr) => (
                <option key={fr} value={fr}>
                  {fr}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit">
            Aggiungi
          </button>
        </form>

        {persona.assegnazioni.some((a) => a.mansione.attivita.length > 0) && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
              Dalle mansioni assegnate
            </div>
            {persona.assegnazioni
              .filter((a) => a.mansione.attivita.length > 0)
              .map((a) => (
                <div key={a.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {a.mansione.nome} —{" "}
                    <a href="/funzioni" style={{ textDecoration: "underline" }}>
                      si modifica in Funzioni e mansioni
                    </a>
                  </div>
                  <div className="attivita-lista" style={{ marginTop: 4 }}>
                    {a.mansione.attivita.map((att) => (
                      <div key={att.id} className="attivita-riga" style={{ color: "var(--text-secondary)" }}>
                        <span className="attivita-punto">•</span>
                        <span>{att.nome}</span>
                        {att.frequenza && <span className="attivita-freq">({att.frequenza})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ---------- Inquadramento ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Inquadramento</h2>
            <p className="card-sub">
              La storia contrattuale: ogni variazione è una riga nuova con la sua decorrenza, il
              passato non si riscrive.
            </p>
          </div>
          {inquadramento && (
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
              <span className="badge verde">
                <span className="dot" />
                oggi: {nomeTipoContratto(inquadramento.tipoContratto)}
                {inquadramento.livello ? ` · ${inquadramento.livello}` : ""}
                {inquadramento.partTimePct < 100 ? ` · part-time ${inquadramento.partTimePct}%` : ""}
              </span>
              {scadenza === "in_scadenza" && (
                <span className="badge arancio">
                  <span className="dot" />
                  scade {dataIt(inquadramento.scadenza)}
                </span>
              )}
              {scadenza === "scaduto" && (
                <span className="badge rosso">
                  <span className="dot" />
                  scaduto {dataIt(inquadramento.scadenza)}
                </span>
              )}
            </span>
          )}
        </div>

        {persona.inquadramenti.length > 0 && (
          <div className="tabella-card" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Decorrenza</th>
                  <th>Contratto</th>
                  <th>CCNL</th>
                  <th>Livello</th>
                  <th>Qualifica</th>
                  <th className="num">Part-time</th>
                  <th>Scadenza</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {persona.inquadramenti.map((i) => (
                  <tr key={i.id}>
                    <td>{dataIt(i.decorrenza)}</td>
                    <td>{nomeTipoContratto(i.tipoContratto)}</td>
                    <td>{i.ccnl || <span className="cella-vuota">—</span>}</td>
                    <td>{i.livello || <span className="cella-vuota">—</span>}</td>
                    <td>{i.qualifica || <span className="cella-vuota">—</span>}</td>
                    <td className="num">{i.partTimePct < 100 ? `${i.partTimePct}%` : "tempo pieno"}</td>
                    <td>{dataIt(i.scadenza)}</td>
                    <td style={{ maxWidth: 220 }}>{i.note || <span className="cella-vuota">—</span>}</td>
                    <td className="num">
                      <FormConferma
                        azione={eliminaInquadramento}
                        conferma="Eliminare questa riga di inquadramento? Si elimina solo una riga scritta per sbaglio."
                        campi={{ id: i.id, personaId: persona.id }}
                        etichetta="Elimina"
                        classe="btn pericolo mini"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={creaInquadramento}>
          <input type="hidden" name="personaId" value={persona.id} />
          <div className="form-griglia">
            <div className="campo">
              <label>Decorrenza *</label>
              <input type="date" name="decorrenza" required defaultValue={oggiInput} />
            </div>
            <div className="campo">
              <label>Tipo di contratto *</label>
              <select name="tipoContratto" required defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {TIPI_CONTRATTO.map((t) => (
                  <option key={t.chiave} value={t.chiave}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>CCNL</label>
              <input type="text" name="ccnl" placeholder="Es. Commercio e Terziario" />
            </div>
            <div className="campo">
              <label>Livello</label>
              <input type="text" name="livello" placeholder="Es. 4º livello" />
            </div>
            <div className="campo">
              <label>Qualifica</label>
              <select name="qualifica" defaultValue="">
                <option value="">— non indicata —</option>
                {QUALIFICHE.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Part-time % (100 = pieno)</label>
              <input type="text" inputMode="numeric" name="partTimePct" placeholder="100" />
            </div>
            <div className="campo">
              <label>Scadenza (se a termine)</label>
              <input type="date" name="scadenza" />
            </div>
            <div className="campo largo">
              <label>Note</label>
              <input type="text" name="note" placeholder="Es. patto di prova 60 giorni" />
            </div>
          </div>
          <div className="form-azioni">
            <button className="btn" type="submit">
              Registra inquadramento
            </button>
          </div>
        </form>
      </div>

      {/* ---------- Retribuzione ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">{autonomo ? "Compenso" : "Retribuzione"}</h2>
            <p className="card-sub">
              {autonomo
                ? "La storia dei compensi pattuiti: chi fattura non ha RAL, mensilità né netto in busta. Il costo azienda è il compenso, più gli eventuali oneri pattuiti (es. rivalsa)."
                : "La storia degli stipendi. Il netto si scrive se lo si conosce — non si deduce mai dal lordo; il costo azienda esiste solo con i contributi dichiarati."}
            </p>
          </div>
          {compenso && (
            <span className="badge verde">
              <span className="dot" />
              {autonomo
                ? `oggi: compenso ${euro(Number(compenso.ral))}`
                : `oggi: RAL ${euro(Number(compenso.ral))} · ${compenso.mensilita} mensilità`}
              {costo != null ? ` · costo ${euro(costo)}` : ""}
            </span>
          )}
        </div>

        {persona.compensi.length > 0 && (
          <div className="tabella-card" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Decorrenza</th>
                  <th>Motivo</th>
                  <th className="num">{autonomo ? "Compenso" : "RAL"}</th>
                  <th className="num">Mensilità</th>
                  <th className="num">Netto mensile</th>
                  <th className="num">{autonomo ? "Oneri" : "Contributi"}</th>
                  <th className="num">Costo azienda</th>
                  <th>Benefit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {persona.compensi.map((c) => {
                  const costoRiga = costoAziendaAnnuo(c, { autonomo });
                  return (
                    <tr key={c.id}>
                      <td>{dataIt(c.decorrenza)}</td>
                      <td>{nomeMotivoCompenso(c.motivo)}</td>
                      <td className="num">{euro(Number(c.ral))}</td>
                      <td className="num">
                        {autonomo ? <span className="cella-vuota">—</span> : c.mensilita}
                      </td>
                      <td className="num">
                        {autonomo ? (
                          <span className="cella-vuota">—</span>
                        ) : c.nettoMensile != null ? (
                          euro(Number(c.nettoMensile))
                        ) : (
                          <span className="cella-vuota">non indicato</span>
                        )}
                      </td>
                      <td className="num">
                        {c.contributiPct != null ? (
                          `${numero(Number(c.contributiPct))}%`
                        ) : (
                          <span className="cella-vuota">{autonomo ? "nessuno" : "—"}</span>
                        )}
                      </td>
                      <td className="num">
                        {costoRiga != null ? euro(costoRiga) : <span className="cella-vuota">non calcolabile</span>}
                      </td>
                      <td style={{ maxWidth: 180 }}>{c.benefit || <span className="cella-vuota">—</span>}</td>
                      <td className="num">
                        <FormConferma
                          azione={eliminaCompenso}
                          conferma="Eliminare questa riga di retribuzione? Si elimina solo una riga scritta per sbaglio."
                          campi={{ id: c.id, personaId: persona.id }}
                          etichetta="Elimina"
                          classe="btn pericolo mini"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form action={creaCompenso}>
          <input type="hidden" name="personaId" value={persona.id} />
          <div className="form-griglia">
            <div className="campo">
              <label>Decorrenza *</label>
              <input type="date" name="decorrenza" required defaultValue={oggiInput} />
            </div>
            <div className="campo">
              <label>{autonomo ? "Compenso annuo € *" : "RAL — lordo annuo € *"}</label>
              <input
                type="text"
                inputMode="decimal"
                name="ral"
                required
                placeholder={autonomo ? "Es. 14.400" : "Es. 28.500"}
              />
            </div>
            {autonomo ? (
              // Chi fattura non ha mensilità né netto in busta: si registra il
              // compenso e basta (12 = valore neutro a database).
              <input type="hidden" name="mensilita" value="12" />
            ) : (
              <>
                <div className="campo">
                  <label>Mensilità</label>
                  <select name="mensilita" defaultValue="13">
                    <option value="12">12</option>
                    <option value="13">13</option>
                    <option value="14">14</option>
                  </select>
                </div>
                <div className="campo">
                  <label>Netto mensile € (se noto)</label>
                  <input type="text" inputMode="decimal" name="nettoMensile" placeholder="Es. 1.650" />
                </div>
              </>
            )}
            <div className="campo">
              <label>
                {autonomo ? "Oneri in più % (es. rivalsa 4; vuoto = nessuno)" : "Contributi azienda % (per il costo)"}
              </label>
              <input type="text" inputMode="decimal" name="contributiPct" placeholder={autonomo ? "Es. 4" : "Es. 38,5"} />
            </div>
            <div className="campo">
              <label>Motivo</label>
              <select name="motivo" defaultValue="">
                <option value="">— non indicato —</option>
                {MOTIVI_COMPENSO.map((m) => (
                  <option key={m.chiave} value={m.chiave}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Benefit</label>
              <input type="text" name="benefit" placeholder="Es. buoni pasto 8 €" />
            </div>
            <div className="campo largo">
              <label>Note</label>
              <input type="text" name="note" />
            </div>
          </div>
          <div className="form-azioni">
            <button className="btn" type="submit">
              {autonomo ? "Registra compenso" : "Registra retribuzione"}
            </button>
          </div>
        </form>
      </div>

      {/* ---------- Benefit ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Benefit</h2>
            <p className="card-sub">
              Cosa ha in mano {persona.nome.split(" ")[0]}: buoni pasto, cellulare, PC, auto… Il
              quadro di tutti sta in <a href="/benefit" style={{ textDecoration: "underline" }}>Benefit</a>,
              dove si aggiungono anche i tipi nuovi.
            </p>
          </div>
        </div>

        {persona.benefit.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-tertiary)", marginBottom: 14 }}>
            Nessun benefit assegnato.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {persona.benefit.map((b) => (
              <div key={b.id} className="riga-chiave">
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 550, fontSize: 14 }}>{b.tipo.nome}</div>
                  <div className="sotto-nome">
                    {[
                      b.dettaglio,
                      b.valoreMensile != null ? `${euro(Number(b.valoreMensile))}/mese` : null,
                      b.dal ? `dal ${dataIt(b.dal)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "senza dettaglio"}
                  </div>
                </div>
                <details className="modifica-inline">
                  <summary>✎</summary>
                  <form action={aggiornaBenefitPersona} className="form-inline">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="personaId" value={persona.id} />
                    <div className="campo" style={{ flex: 2 }}>
                      <label>Dettaglio</label>
                      <input type="text" name="dettaglio" defaultValue={b.dettaglio} />
                    </div>
                    <div className="campo" style={{ maxWidth: 160 }}>
                      <label>Valore mensile €</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        name="valoreMensile"
                        defaultValue={b.valoreMensile != null ? numero(Number(b.valoreMensile)) : ""}
                      />
                    </div>
                    <div className="campo" style={{ maxWidth: 170 }}>
                      <label>Dal</label>
                      <input type="date" name="dal" defaultValue={dataInput(b.dal)} />
                    </div>
                    <button className="btn ghost mini" type="submit">
                      Salva
                    </button>
                  </form>
                </details>
                <FormConferma
                  azione={rimuoviBenefit}
                  conferma={`Togliere il benefit «${b.tipo.nome}» a ${persona.nome}?`}
                  campi={{ id: b.id, personaId: persona.id }}
                  etichetta="Togli"
                  classe="btn pericolo mini"
                />
              </div>
            ))}
          </div>
        )}

        {tipiBenefit.length > 0 ? (
          <form action={assegnaBenefit} className="form-inline">
            <input type="hidden" name="personaId" value={persona.id} />
            <div className="campo">
              <label>Assegna un benefit</label>
              <select name="tipoId" required defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {tipiBenefit.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo" style={{ flex: 2 }}>
              <label>Dettaglio</label>
              <input type="text" name="dettaglio" placeholder="Es. 8 €/giorno, iPhone 14, targa…" />
            </div>
            <div className="campo" style={{ maxWidth: 160 }}>
              <label>Valore mensile € (se noto)</label>
              <input type="text" inputMode="decimal" name="valoreMensile" placeholder="Es. 160" />
            </div>
            <div className="campo" style={{ maxWidth: 170 }}>
              <label>Dal</label>
              <input type="date" name="dal" />
            </div>
            <button className="btn" type="submit">
              Assegna
            </button>
          </form>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Non esistono ancora tipi di benefit: si creano nella pagina{" "}
            <a href="/benefit" style={{ textDecoration: "underline" }}>Benefit</a>.
          </p>
        )}
      </div>

      {/* ---------- Cessazione ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">{persona.stato === "attivo" ? "Cessazione" : "Rientro"}</h2>
            <p className="card-sub">
              {persona.stato === "attivo"
                ? "Una persona non si elimina: si cessa con una data, e la sua storia resta."
                : "La persona è cessata: se torna, si riattiva e riprende la sua storia."}
            </p>
          </div>
        </div>
        {persona.stato === "attivo" ? (
          <form
            action={cessaPersona}
            className="form-inline"
          >
            <input type="hidden" name="id" value={persona.id} />
            <div className="campo" style={{ maxWidth: 220 }}>
              <label>Data di cessazione</label>
              <input type="date" name="dataCessazione" required />
            </div>
            <button className="btn pericolo" type="submit">
              Cessa la persona
            </button>
          </form>
        ) : (
          <form action={riattivaPersona}>
            <input type="hidden" name="id" value={persona.id} />
            <button className="btn" type="submit">
              Riattiva
            </button>
          </form>
        )}
      </div>
    </>
  );
}
