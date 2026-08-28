import { prisma } from "@/lib/db";
import { ordiniCliente, ricorrenze, schedaCliente } from "@/lib/orders";
import { aggiungiRicorrenza, registraAttivita } from "@/lib/actions";
import { TornaIndietro } from "@/components/TornaIndietro";
import {
  dataIt,
  euro,
  giornoMese,
  quandoLeggibile,
  segmento,
  statoInvito,
  tipoRicorrenza,
  TIPI_ATTIVITA,
  TIPI_RICORRENZA,
} from "@/lib/etichette";

export const dynamic = "force-dynamic";

type Params = { codice: string };
type Query = { esito?: string; errore?: string };

// LA SCHEDA A 360 GRADI — quello che un client advisor deve sapere prima di
// alzare il telefono: chi è, cosa compra, cosa le piace, quando festeggia,
// cosa ci siamo detti. Ordini, segmento, gusti e ricorrenze arrivano da
// Deluxy Orders; il diario, le mail e gli inviti vivono qui.
export default async function Scheda({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Query>;
}) {
  // Il segmento può arrivare ancora percent-encoded (monica%40…): si
  // normalizza una volta qui, così ogni encodeURIComponent a valle ne fa UNA.
  const { codice: codiceRaw } = await params;
  const codice = decodeURIComponent(codiceRaw);
  const sp = await searchParams;
  const qui = `/clienti/${encodeURIComponent(codice)}`;

  const [scheda, ordini, ricorr, attivita, mail, inviti] = await Promise.all([
    schedaCliente(codice),
    ordiniCliente(codice, 1, 30),
    ricorrenze({ cliente: codice, stato: "tutti", limit: 50 }),
    prisma.attivita.findMany({ where: { chiaveCliente: codice }, orderBy: { quando: "desc" }, take: 50 }),
    prisma.mailInviata.findMany({ where: { chiaveCliente: codice }, orderBy: { inviataIl: "desc" }, take: 50 }),
    prisma.invito.findMany({
      where: { chiaveCliente: codice },
      include: { evento: { select: { id: true, titolo: true, dataInizio: true } } },
      orderBy: { creatoIl: "desc" },
    }),
  ]);

  if (!scheda.ok) {
    return (
      <>
        <div className="intestazione">
          <div>
            <h1 className="page-title">Cliente</h1>
            <p className="page-sub">La scheda non si può aprire.</p>
          </div>
          <TornaIndietro fallback="/clienti" label="Libro clienti" />
        </div>
        <div className="errore-card">{scheda.errore}</div>
      </>
    );
  }

  const c = scheda.dati;
  const seg = segmento(c.segmento);
  const nomeMostrato = c.nome ?? c.email ?? c.telefono ?? "Senza nome";

  // La timeline della relazione: diario + mail + inviti, fusi per data.
  type Voce = { quando: Date; tipo: string; titolo: string; dettaglio: string | null; extra?: string };
  const timeline: Voce[] = [
    ...attivita.map((a) => ({
      quando: a.quando,
      tipo: TIPI_ATTIVITA[a.tipo] ?? a.tipo,
      titolo: a.titolo,
      dettaglio: a.dettaglio,
      extra: a.autore || undefined,
    })),
    ...mail.map((m) => ({
      quando: m.inviataIl,
      tipo: m.esito === "inviata" ? "Mail inviata" : "Mail non partita",
      titolo: m.oggetto,
      dettaglio: m.esito === "errore" ? m.errore : null,
      extra: m.autore || undefined,
    })),
    ...inviti
      .filter((i) => i.invitatoIl)
      .map((i) => ({
        quando: i.invitatoIl!,
        tipo: "Invito",
        titolo: `Invito a «${i.evento.titolo}»`,
        dettaglio: null,
      })),
  ].sort((a, b) => b.quando.getTime() - a.quando.getTime());

  return (
    <>
      <TornaIndietro fallback="/clienti" label="Libro clienti" />
      <div className="intestazione">
        <div>
          <h1 className="page-title">{nomeMostrato}</h1>
          <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
              <span className="dot" />
              {seg.nome}
            </span>
            {c.tipologia ? <span className="chip">{c.tipologia}</span> : null}
            {c.citta ? <span>{c.citta}</span> : null}
            {c.email ? <span>{c.email}</span> : null}
            {c.telefono ? <span>{c.telefono}</span> : null}
            {c.brand.length ? <span className="terziario">{c.brand.join(" · ")}</span> : null}
          </p>
        </div>
        <div className="azioni">
          <a className="btn ghost" href={`/clienti/${encodeURIComponent(codice)}/nuovo-ordine`}>Crea ordine</a>
          {c.telefono ? (
            <a className="btn ghost" href={`/whatsapp/componi?cliente=${encodeURIComponent(codice)}`}>WhatsApp</a>
          ) : null}
          {c.email ? (
            <a className="btn" href={`/mail/componi?cliente=${encodeURIComponent(codice)}`}>Scrivi una mail</a>
          ) : (
            <span className="chip" title="Questo cliente non ha un'email negli ordini">senza email</span>
          )}
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia quattro" style={{ marginBottom: 16 }}>
        <div className="card stretta stat">
          <span className="valore">{euro(c.speso)}</span>
          <span className="etichetta">Valore del cliente</span>
          <span className="nota">medio {euro(c.ordineMedio)} a ordine</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{c.ordini}</span>
          <span className="etichetta">Ordini</span>
          <span className="nota">{c.annullati ? `più ${c.annullati} annullati` : "nessun annullato"}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{dataIt(c.primoOrdine)}</span>
          <span className="etichetta">Cliente da</span>
          <span className="nota">{c.acquisizione?.canale ? `arrivato da ${c.acquisizione.canale}` : "provenienza non indicata"}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{dataIt(c.ultimoOrdine)}</span>
          <span className="etichetta">Ultimo ordine</span>
          <span className="nota">{c.giorniDallUltimo != null ? `${c.giorniDallUltimo} giorni fa` : ""}</span>
        </div>
      </div>

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)" }}>
        {/* -------- colonna principale -------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {c.riepilogo ? (
            <div className="card">
              <div className="card-titolo">Chi è, in una riga</div>
              <div className="card-sub">
                Riassunto scritto dall&apos;AI di Orders su {c.riepilogo.ordiniConsiderati} ordini
                {c.riepilogo.aggiornato ? "" : ` (${c.riepilogo.ordiniNuoviDaAllora} ordini nuovi da allora)`}.
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.55 }}>{c.riepilogo.riassunto}</p>
              {c.riepilogo.gusti ? (
                <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>
                  <span className="chip oro">Gusti</span> {c.riepilogo.gusti}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="card tabella-card">
            <div style={{ padding: "20px 20px 8px" }}>
              <div className="card-titolo">Ordini</div>
              <div className="card-sub">
                {ordini.ok
                  ? `${ordini.dati.totale} ordini validi (gli annullati non compaiono). Fonte: Deluxy Orders.`
                  : "Fonte: Deluxy Orders."}
              </div>
            </div>
            {!ordini.ok ? (
              <p className="secondario piccolo" style={{ padding: "0 20px 20px" }}>{ordini.errore}</p>
            ) : ordini.dati.ordini.length === 0 ? (
              <p className="secondario piccolo" style={{ padding: "0 20px 20px" }}>Nessun ordine valido.</p>
            ) : (
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ordine</th>
                      <th>Cosa</th>
                      <th>Per chi / dove</th>
                      <th>Dedica</th>
                      <th className="num">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordini.dati.ordini.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="cella-principale">{o.numero}</div>
                          <div className="cella-sotto">
                            {dataIt(o.data)} · {o.brand}
                          </div>
                        </td>
                        <td>
                          <div className="riga-prodotti">
                            {o.righe.slice(0, 3).map((r, i) => (
                              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {r.immagine ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img className="mini-foto" src={r.immagine} alt="" />
                                ) : null}
                                <span className="piccolo">
                                  {r.quantita > 1 ? `${r.quantita}× ` : ""}
                                  {r.titolo}
                                </span>
                              </span>
                            ))}
                            {o.righe.length > 3 ? <span className="terziario piccolo">+{o.righe.length - 3}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="piccolo">{o.spedizione?.nome ?? "—"}</div>
                          <div className="cella-sotto">
                            {[o.spedizione?.citta, o.consegna?.data ? `consegna ${dataIt(o.consegna.data)}` : null]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        </td>
                        <td>
                          {o.biglietto ? (
                            <span className="piccolo" title={o.biglietto}>
                              “{o.biglietto.length > 60 ? `${o.biglietto.slice(0, 60)}…` : o.biglietto}”
                            </span>
                          ) : (
                            <span className="terziario">—</span>
                          )}
                        </td>
                        <td className="num">{euro(o.totale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-titolo">La relazione</div>
            <div className="card-sub">Diario di chiamate, incontri, note, mail e inviti — il più recente in alto.</div>
            {timeline.length === 0 ? (
              <p className="secondario piccolo">Ancora niente: la prima nota si scrive qui a destra.</p>
            ) : (
              <div className="timeline">
                {timeline.map((v, i) => (
                  <div className="timeline-voce" key={i}>
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        {v.titolo} <span className="chip">{v.tipo}</span>
                      </div>
                      {v.dettaglio ? <div className="timeline-dettaglio">{v.dettaglio}</div> : null}
                      <div className="timeline-quando">
                        {dataIt(v.quando, true)}
                        {v.extra ? ` · ${v.extra}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* -------- colonna laterale -------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo">Ricorrenze</div>
            <div className="card-sub">
              Compleanni e occasioni di questa persona: lette dagli ordini, confermate da noi. Vivono nel registro di
              Orders — aggiungerne una qui la scrive lì.
            </div>
            {!ricorr.ok ? (
              <p className="secondario piccolo">{ricorr.errore}</p>
            ) : ricorr.dati.eventi.length === 0 ? (
              <p className="secondario piccolo">Nessuna ricorrenza conosciuta.</p>
            ) : (
              <div className="timeline">
                {ricorr.dati.eventi.map((r) => {
                  const tipo = tipoRicorrenza(r.tipo);
                  return (
                    <div className="timeline-voce" key={r.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          {r.titolo || tipo.nome}
                          {r.destinatario ? <span className="secondario"> → {r.destinatario}</span> : null}
                        </div>
                        <div className="timeline-dettaglio">
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: tipo.colore }}>
                            <span className="dot" />
                            {tipo.nome}
                          </span>{" "}
                          <span className="terziario piccolo">
                            {giornoMese(r.giorno, r.mese)} · {quandoLeggibile(r.fraGiorni)}
                            {r.origine === "dedotto" ? ` · vista ${r.ricorrenze} ${r.ricorrenze === 1 ? "volta" : "volte"}` : ""}
                            {r.stato === "da-confermare" ? " · da confermare" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <details style={{ marginTop: 12 }}>
              <summary className="link-quieto" style={{ cursor: "pointer" }}>Aggiungi una ricorrenza</summary>
              <form action={aggiungiRicorrenza} style={{ marginTop: 12 }}>
                <input type="hidden" name="cliente" value={codice} />
                <input type="hidden" name="torna" value={qui} />
                <div className="form-riga">
                  <div className="campo">
                    <label>Giorno <span className="ob">*</span></label>
                    <input type="number" name="giorno" min={1} max={31} required />
                  </div>
                  <div className="campo">
                    <label>Mese <span className="ob">*</span></label>
                    <select name="mese" required defaultValue="">
                      <option value="" disabled>—</option>
                      {["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"].map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="campo">
                  <label>Tipo</label>
                  <select name="tipo" defaultValue="compleanno">
                    {Object.entries(TIPI_RICORRENZA).map(([chiave, t]) => (
                      <option key={chiave} value={chiave}>{t.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Per chi <span className="aiuto">(vuoto = il cliente stesso)</span></label>
                  <input type="text" name="destinatario" placeholder="es. la moglie, Anna" />
                </div>
                <div className="campo">
                  <label>Come la chiamiamo</label>
                  <input type="text" name="titolo" placeholder="es. Compleanno di Anna" />
                </div>
                <div className="campo">
                  <label>Note</label>
                  <input type="text" name="note" placeholder="es. preferisce le peonie" />
                </div>
                <div className="form-piede">
                  <button className="btn" type="submit">Salva nel registro</button>
                </div>
              </form>
            </details>
          </div>

          <div className="card">
            <div className="card-titolo">Registra un&apos;attività</div>
            <div className="card-sub">Una chiamata, un incontro, una nota: due righe oggi valgono una scheda domani.</div>
            <form action={registraAttivita}>
              <input type="hidden" name="chiaveCliente" value={codice} />
              <input type="hidden" name="nomeCliente" value={nomeMostrato} />
              <input type="hidden" name="torna" value={qui} />
              <div className="form-riga">
                <div className="campo">
                  <label>Tipo</label>
                  <select name="tipo" defaultValue="nota">
                    {Object.entries(TIPI_ATTIVITA).map(([chiave, nome]) => (
                      <option key={chiave} value={chiave}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Quando</label>
                  <input type="datetime-local" name="quando" />
                </div>
              </div>
              <div className="campo">
                <label>Titolo <span className="ob">*</span></label>
                <input type="text" name="titolo" placeholder="es. Chiamata per il compleanno" required />
              </div>
              <div className="campo">
                <label>Dettaglio</label>
                <textarea name="dettaglio" rows={3} placeholder="Cosa ci siamo detti, cosa promesso…" />
              </div>
              <div className="form-piede">
                <button className="btn" type="submit">Registra</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-titolo">Inviti</div>
            <div className="card-sub">Gli eventi a cui questa persona è stata invitata.</div>
            {inviti.length === 0 ? (
              <p className="secondario piccolo">
                Nessun invito. <a className="link-quieto" href="/eventi">Vai agli eventi →</a>
              </p>
            ) : (
              <div className="timeline">
                {inviti.map((i) => {
                  const st = statoInvito(i.stato);
                  return (
                    <div className="timeline-voce" key={i.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          <a href={`/eventi/${i.evento.id}`}>{i.evento.titolo}</a>
                        </div>
                        <div className="timeline-quando">{dataIt(i.evento.dataInizio, true)}</div>
                      </div>
                      <span
                        className="badge colorato"
                        style={{ ["--badge-colore" as string]: st.colore, alignSelf: "center" }}
                      >
                        <span className="dot" />
                        {st.nome}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
