import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { elencoClienti } from "@/lib/orders";
import { aggiungiInvitato, cambiaStatoEvento, cambiaStatoInvito, rimuoviInvito, salvaEvento } from "@/lib/actions";
import { aOraItaliana } from "@/lib/ore";
import { dataIt, euro, segmento, statoEvento, statoInvito } from "@/lib/etichette";

export const dynamic = "force-dynamic";

type Params = { id: string };
type Query = { cerca?: string; esito?: string; errore?: string };

// DETTAGLIO EVENTO — la regia dell'occasione: chi è in lista, chi è stato
// invitato, chi ha confermato, chi c'era davvero. Gli invitati si pescano dal
// libro clienti (Orders); l'invito parte come mail personalizzata.
export default async function DettaglioEvento({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const qui = `/eventi/${id}`;

  const evento = await prisma.evento.findUnique({
    where: { id },
    include: { inviti: { orderBy: { creatoIl: "asc" } } },
  });
  if (!evento) notFound();

  const cerca = sp.cerca?.trim();
  const risultati = cerca ? await elencoClienti({ q: cerca, limit: 8 }) : null;
  const giaInvitati = new Set(evento.inviti.map((i) => i.chiaveCliente));

  const st = statoEvento(evento.stato);
  const conta = (stato: string) => evento.inviti.filter((i) => i.stato === stato).length;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">{evento.titolo}</h1>
          <p className="page-sub" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore }}>
              <span className="dot" />
              {st.nome}
            </span>
            <span>{dataIt(evento.dataInizio, true)}</span>
            {evento.luogo ? <span>{evento.luogo}</span> : null}
            {evento.dressCode ? <span className="chip">{evento.dressCode}</span> : null}
          </p>
        </div>
        <div className="azioni">
          {evento.stato === "aperto" || evento.stato === "bozza" ? (
            <form action={cambiaStatoEvento}>
              <input type="hidden" name="id" value={evento.id} />
              <input type="hidden" name="stato" value="concluso" />
              <button className="btn ghost" type="submit">Segna concluso</button>
            </form>
          ) : null}
          <a className="btn ghost" href="/eventi">← Eventi</a>
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia quattro" style={{ marginBottom: 16 }}>
        <div className="card stretta stat">
          <span className="valore">{evento.inviti.length}</span>
          <span className="etichetta">In lista</span>
          <span className="nota">{evento.capienza ? `capienza ${evento.capienza}` : "senza limite"}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{conta("invitato")}</span>
          <span className="etichetta">Invitati in attesa</span>
          <span className="nota">{conta("da_invitare")} ancora da invitare</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{conta("confermato")}</span>
          <span className="etichetta">Confermati</span>
          <span className="nota">{conta("declinato")} hanno declinato</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{conta("partecipato")}</span>
          <span className="etichetta">Presenti</span>
          <span className="nota">si segna a evento concluso</span>
        </div>
      </div>

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card tabella-card">
            <div style={{ padding: "20px 20px 8px" }}>
              <div className="card-titolo">Lista invitati</div>
              <div className="card-sub">L&apos;invito parte come mail personalizzata; conferme e presenze si segnano qui.</div>
            </div>
            {evento.inviti.length === 0 ? (
              <p className="secondario piccolo" style={{ padding: "0 20px 20px" }}>
                Lista vuota: cerca un cliente qui a destra e aggiungilo.
              </p>
            ) : (
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Stato</th>
                      <th>Invitato il</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {evento.inviti.map((i) => {
                      const sti = statoInvito(i.stato);
                      return (
                        <tr key={i.id}>
                          <td>
                            <a href={`/clienti/${i.chiaveCliente}`}>
                              <div className="cella-principale">{i.nomeCliente || i.emailCliente || "—"}</div>
                              <div className="cella-sotto">{i.emailCliente}</div>
                            </a>
                          </td>
                          <td>
                            <span className="badge colorato" style={{ ["--badge-colore" as string]: sti.colore }}>
                              <span className="dot" />
                              {sti.nome}
                            </span>
                          </td>
                          <td className="secondario piccolo">{i.invitatoIl ? dataIt(i.invitatoIl, true) : "—"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                              {i.stato === "da_invitare" && i.emailCliente ? (
                                <a
                                  className="btn mini"
                                  href={`/mail/componi?cliente=${encodeURIComponent(i.chiaveCliente)}&evento=${evento.id}&invito=${i.id}`}
                                >
                                  Invita via mail
                                </a>
                              ) : null}
                              {i.stato === "da_invitare" && !i.emailCliente ? (
                                <form action={cambiaStatoInvito}>
                                  <input type="hidden" name="id" value={i.id} />
                                  <input type="hidden" name="stato" value="invitato" />
                                  <input type="hidden" name="torna" value={qui} />
                                  <button className="btn ghost mini" type="submit" title="Invitato per telefono o di persona">
                                    Segna invitato
                                  </button>
                                </form>
                              ) : null}
                              {i.stato === "invitato" ? (
                                <>
                                  <form action={cambiaStatoInvito}>
                                    <input type="hidden" name="id" value={i.id} />
                                    <input type="hidden" name="stato" value="confermato" />
                                    <input type="hidden" name="torna" value={qui} />
                                    <button className="btn ghost mini" type="submit">Conferma</button>
                                  </form>
                                  <form action={cambiaStatoInvito}>
                                    <input type="hidden" name="id" value={i.id} />
                                    <input type="hidden" name="stato" value="declinato" />
                                    <input type="hidden" name="torna" value={qui} />
                                    <button className="btn ghost mini" type="submit">Declina</button>
                                  </form>
                                </>
                              ) : null}
                              {i.stato === "confermato" ? (
                                <form action={cambiaStatoInvito}>
                                  <input type="hidden" name="id" value={i.id} />
                                  <input type="hidden" name="stato" value="partecipato" />
                                  <input type="hidden" name="torna" value={qui} />
                                  <button className="btn ghost mini" type="submit">C&apos;era</button>
                                </form>
                              ) : null}
                              <form action={rimuoviInvito}>
                                <input type="hidden" name="id" value={i.id} />
                                <input type="hidden" name="torna" value={qui} />
                                <button className="btn rosso mini" type="submit">Togli</button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <details className="card">
            <summary className="link-quieto" style={{ cursor: "pointer", fontWeight: 550 }}>
              Modifica l&apos;evento
            </summary>
            <form action={salvaEvento} style={{ marginTop: 16 }}>
              <input type="hidden" name="id" value={evento.id} />
              <input type="hidden" name="torna" value={qui} />
              <div className="campo">
                <label>Titolo <span className="ob">*</span></label>
                <input type="text" name="titolo" defaultValue={evento.titolo} required />
              </div>
              <div className="form-riga">
                <div className="campo">
                  <label>Inizio <span className="ob">*</span></label>
                  <input type="datetime-local" name="dataInizio" defaultValue={aOraItaliana(evento.dataInizio)} required />
                </div>
                <div className="campo">
                  <label>Fine</label>
                  <input type="datetime-local" name="dataFine" defaultValue={aOraItaliana(evento.dataFine)} />
                </div>
              </div>
              <div className="form-riga">
                <div className="campo">
                  <label>Luogo</label>
                  <input type="text" name="luogo" defaultValue={evento.luogo} />
                </div>
                <div className="campo">
                  <label>Dress code</label>
                  <input type="text" name="dressCode" defaultValue={evento.dressCode} />
                </div>
              </div>
              <div className="form-riga">
                <div className="campo">
                  <label>Capienza</label>
                  <input type="number" name="capienza" min={1} defaultValue={evento.capienza ?? ""} />
                </div>
                <div className="campo">
                  <label>Stato</label>
                  <select name="stato" defaultValue={evento.stato}>
                    <option value="bozza">Bozza</option>
                    <option value="aperto">Aperto</option>
                    <option value="concluso">Concluso</option>
                    <option value="annullato">Annullato</option>
                  </select>
                </div>
              </div>
              <div className="campo">
                <label>Descrizione</label>
                <textarea name="descrizione" rows={3} defaultValue={evento.descrizione ?? ""} />
              </div>
              <div className="campo">
                <label>Note interne</label>
                <input type="text" name="note" defaultValue={evento.note ?? ""} />
              </div>
              <div className="form-piede">
                <button className="btn" type="submit">Salva</button>
              </div>
            </form>
          </details>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo">Aggiungi invitati</div>
            <div className="card-sub">Cerca nel libro clienti (fonte: Deluxy Orders) e metti in lista.</div>
            <form method="get" action={qui} style={{ display: "flex", gap: 8 }}>
              <input type="search" name="cerca" placeholder="Nome, email, città…" defaultValue={cerca ?? ""} />
              <button className="btn ghost" type="submit">Cerca</button>
            </form>
            {risultati ? (
              !risultati.ok ? (
                <p className="secondario piccolo" style={{ marginTop: 12 }}>{risultati.errore}</p>
              ) : risultati.dati.clienti.length === 0 ? (
                <p className="secondario piccolo" style={{ marginTop: 12 }}>Nessun cliente trovato per «{cerca}».</p>
              ) : (
                <div className="timeline" style={{ marginTop: 8 }}>
                  {risultati.dati.clienti.map((c) => {
                    const seg = segmento(c.segmento);
                    const dentro = giaInvitati.has(c.cliente);
                    return (
                      <div className="timeline-voce" key={c.cliente}>
                        <div className="timeline-corpo">
                          <div className="timeline-titolo">{c.nome ?? c.email ?? "—"}</div>
                          <div className="timeline-quando">
                            <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                              <span className="dot" />
                              {seg.nome}
                            </span>{" "}
                            {euro(c.speso)} · {c.ordini} ordini{c.citta ? ` · ${c.citta}` : ""}
                          </div>
                        </div>
                        {dentro ? (
                          <span className="chip" style={{ alignSelf: "center" }}>in lista</span>
                        ) : (
                          <form action={aggiungiInvitato} style={{ alignSelf: "center" }}>
                            <input type="hidden" name="eventoId" value={evento.id} />
                            <input type="hidden" name="chiaveCliente" value={c.cliente} />
                            <input type="hidden" name="nomeCliente" value={c.nome ?? ""} />
                            <input type="hidden" name="emailCliente" value={c.email ?? ""} />
                            <input type="hidden" name="torna" value={`${qui}?cerca=${encodeURIComponent(cerca ?? "")}`} />
                            <button className="btn ghost mini" type="submit">Aggiungi</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>

          {evento.descrizione || evento.note ? (
            <div className="card">
              <div className="card-titolo">Dettagli</div>
              {evento.descrizione ? <p style={{ fontSize: 14, lineHeight: 1.55 }}>{evento.descrizione}</p> : null}
              {evento.note ? (
                <p className="secondario" style={{ fontSize: 13, marginTop: 10 }}>
                  Note interne: {evento.note}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
