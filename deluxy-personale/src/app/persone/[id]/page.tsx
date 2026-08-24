import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dataIt, dataInput, euro, numero } from "@/lib/formato";
import {
  compensoCorrente,
  costoAziendaAnnuo,
  inquadramentoCorrente,
  MOTIVI_COMPENSO,
  nomeMotivoCompenso,
  nomeTipoContratto,
  QUALIFICHE,
  statoScadenza,
  TIPI_CONTRATTO,
} from "@/lib/organico";
import {
  aggiornaPersona,
  assegnaMansione,
  cessaPersona,
  creaCompenso,
  creaInquadramento,
  eliminaCompenso,
  eliminaInquadramento,
  riattivaPersona,
  rimuoviAssegnazione,
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
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      funzione: true,
      responsabile: true,
      riporti: { where: { stato: "attivo" }, orderBy: { nome: "asc" } },
      assegnazioni: { include: { mansione: { include: { funzione: true } } }, orderBy: { creatoIl: "asc" } },
      inquadramenti: { orderBy: { decorrenza: "desc" } },
      compensi: { orderBy: { decorrenza: "desc" } },
    },
  });
  if (!persona) notFound();

  const [funzioni, colleghi, mansioniTutte] = await Promise.all([
    prisma.funzione.findMany({ where: { attiva: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.persona.findMany({ where: { stato: "attivo", NOT: { id } }, orderBy: { nome: "asc" } }),
    prisma.mansione.findMany({ where: { attiva: true }, include: { funzione: true }, orderBy: { nome: "asc" } }),
  ]);

  const inquadramento = inquadramentoCorrente(persona.inquadramenti);
  const compenso = compensoCorrente(persona.compensi);
  const costo = costoAziendaAnnuo(compenso);
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
            <h2 className="card-titolo">Retribuzione</h2>
            <p className="card-sub">
              La storia degli stipendi. Il netto si scrive se lo si conosce — non si deduce mai dal
              lordo; il costo azienda esiste solo con i contributi dichiarati.
            </p>
          </div>
          {compenso && (
            <span className="badge verde">
              <span className="dot" />
              oggi: RAL {euro(Number(compenso.ral))} · {compenso.mensilita} mensilità
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
                  <th className="num">RAL</th>
                  <th className="num">Mensilità</th>
                  <th className="num">Netto mensile</th>
                  <th className="num">Contributi</th>
                  <th className="num">Costo azienda</th>
                  <th>Benefit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {persona.compensi.map((c) => {
                  const costoRiga = costoAziendaAnnuo(c);
                  return (
                    <tr key={c.id}>
                      <td>{dataIt(c.decorrenza)}</td>
                      <td>{nomeMotivoCompenso(c.motivo)}</td>
                      <td className="num">{euro(Number(c.ral))}</td>
                      <td className="num">{c.mensilita}</td>
                      <td className="num">
                        {c.nettoMensile != null ? euro(Number(c.nettoMensile)) : (
                          <span className="cella-vuota">non indicato</span>
                        )}
                      </td>
                      <td className="num">
                        {c.contributiPct != null ? `${numero(Number(c.contributiPct))}%` : (
                          <span className="cella-vuota">—</span>
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
              <label>RAL — lordo annuo € *</label>
              <input type="text" inputMode="decimal" name="ral" required placeholder="Es. 28.500" />
            </div>
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
            <div className="campo">
              <label>Contributi azienda % (per il costo)</label>
              <input type="text" inputMode="decimal" name="contributiPct" placeholder="Es. 38,5" />
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
              Registra retribuzione
            </button>
          </div>
        </form>
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
