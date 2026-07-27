import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  euro, dataBreve, consegnaBreve, urgenzaConsegna,
  evasioneLeggibile, pagamentoLeggibile, motivoLeggibile, coloreEvasione, colorePagamento,
  rischioLeggibile, rischioDaSegnalare, coloreRischio, linkShopify,
  problematico, motiviProblema,
} from "@/lib/ordini";
import { statiOrdinati } from "@/lib/stati";
import { CATEGORIE_PAGAMENTO, APP_DESTINAZIONI, nomeApp } from "@/lib/classificazione";
import { linkRicerca, brandPerRicerca } from "@/lib/fornitori";
import { cambiaStato, toggleEtichetta, aggiornaClassificazione, segnaProblemaGestito } from "@/app/actions";
import { ordinali } from "@/lib/repeater";
import { canale } from "@/lib/marketing";
import { PillRepeater, TagLuoghi, PillUrgenza } from "@/components/Provenienza";

export const dynamic = "force-dynamic";

export default async function DettaglioOrdine({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ordine, stati, etichette] = await Promise.all([
    prisma.ordine.findUnique({
      where: { id },
      include: {
        stato: true,
        etichette: true,
        righe: true,
        negozio: { select: { brand: true, dominio: true } },
        eventi: { orderBy: { creatoIl: "desc" }, take: 40 },
        feedback: { orderBy: { creatoIl: "desc" } },
      },
    }),
    statiOrdinati(),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!ordine) notFound();

  // nome del brand nell'app Ricerca fornitori, per il link rapido
  const brandRicerca = await brandPerRicerca(ordine.brand);
  // Prima volta o cliente che torna, contando gli ordini validi prima di questo
  const ordinale = (await ordinali([ordine.id])).get(ordine.id);
  const suoCanale = canale(ordine.canaleMarketing);
  const urlShopify = linkShopify(ordine.negozio?.dominio, ordine.orderId);

  const etichetteAttive = new Set(ordine.etichette.map((e) => e.id));

  return (
    <main className="main">
      <Link href="/" className="ritorno">← Tutti gli ordini</Link>

      {/* Un ordine annullato va detto prima di ogni altra cosa: non si deduce
          dallo stato del pagamento, che può restare "pagato". */}
      {ordine.annullatoIl && (
        <div className="avviso-annullato">
          <strong>Ordine annullato</strong> il {dataBreve(ordine.annullatoIl)}
          {motivoLeggibile(ordine.motivoAnnullamento) ? ` · ${motivoLeggibile(ordine.motivoAnnullamento)}` : ""}
          {ordine.financialStatus && ordine.financialStatus !== "REFUNDED" && (
            <> · pagamento: {pagamentoLeggibile(ordine.financialStatus)}</>
          )}
        </div>
      )}

      <div className="page-head">
        <div style={{ order: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            className="btn"
            href={linkRicerca(brandRicerca, ordine.numero)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Cerca fornitore
          </a>
          <Link className="btn btn-secondario" href={`/ordini/${ordine.id}/fornitori`}>
            Fornitori vicini qui
          </Link>
          {/* L'ordine originale su Shopify, per tutto ciò che qui non si replica */}
          {urlShopify && (
            <a className="btn btn-secondario" href={urlShopify} target="_blank" rel="noopener noreferrer">
              Apri su Shopify
            </a>
          )}
        </div>
        <div>
          <h1 className="page-title">{ordine.numero}</h1>
          <p className="page-sub">
            {ordine.brand} · {dataBreve(ordine.data)} · {euro(ordine.totale, ordine.valuta)}
          </p>
          {consegnaBreve(ordine.dataConsegna, ordine.fasciaConsegna) && (
            <p className={`consegna consegna-${urgenzaConsegna(ordine.dataConsegna) ?? "futura"}`} style={{ marginTop: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              Consegna: {consegnaBreve(ordine.dataConsegna, ordine.fasciaConsegna)}
            </p>
          )}
        </div>
      </div>

      {/* Chi ordina e da dove è arrivato. Sta in alto perché cambia il tono di
          tutto il resto: un primo ordine arrivato da un annuncio a pagamento e
          il quarto ordine di un cliente affezionato non si trattano uguale. */}
      <div className="scheda">
        <div className="scheda-titolo">Da dove arriva questo ordine</div>
        <div className="riga-provenienza">
          <PillRepeater ordinale={ordinale} />
          <PillUrgenza chiave={ordine.urgenza} />
          {suoCanale ? (
            <span className={`segno-canale grande${suoCanale.pagato ? " pagato" : ""}`}>
              <span aria-hidden>{suoCanale.simbolo}</span> {suoCanale.nome}
            </span>
          ) : (
            <span className="tag-vuoto">Provenienza sconosciuta</span>
          )}
        </div>
        <div style={{ marginTop: 8 }}><TagLuoghi ordine={ordine} /></div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          {ordinale
            ? ordinale.repeater
              ? `Prima di questo, lo stesso cliente aveva già fatto ${ordinale.precedenti} ${
                  ordinale.precedenti === 1 ? "ordine" : "ordini"
                } (annullati esclusi).`
              : "È il suo primo ordine: nessun ordine valido prima di questo."
            : "Ordine senza email, telefono né nome: non si può dire se sia un cliente che torna."}{" "}
          {suoCanale
            ? `${suoCanale.spiega} È la PRIMA visita del percorso che ha portato a quest'ordine, non l'ultimo clic.`
            : "Shopify non ha associato nessuna visita a quest'ordine: succede con gli ordini creati a mano e con molti ordini vecchi."}
        </p>
        {(ordine.utmCampaign || ordine.utmSource || ordine.visitaSorgente) && (
          <dl className="griglia-campi" style={{ marginTop: 10 }}>
            {ordine.utmCampaign && (
              <div className="campo campo-largo"><dt>Campagna</dt><dd>{ordine.utmCampaign}</dd></div>
            )}
            {ordine.utmSource && (
              <div className="campo"><dt>utm</dt><dd>
                {ordine.utmSource}{ordine.utmMedium ? ` / ${ordine.utmMedium}` : ""}
              </dd></div>
            )}
            {ordine.visitaSorgente && (
              <div className="campo"><dt>Prima visita</dt><dd>{ordine.visitaSorgente}</dd></div>
            )}
            {ordine.sorgente && (
              <div className="campo"><dt>Canale Shopify</dt><dd>{ordine.sorgente}</dd></div>
            )}
          </dl>
        )}
      </div>

      {/* Stato / pipeline */}
      <div className="scheda">
        <div className="scheda-titolo">Stato</div>
        <div className="selettore-stato">
          {stati.map((s) => {
            const attuale = s.id === ordine.statoId;
            return (
              <form action={cambiaStato} key={s.id}>
                <input type="hidden" name="ordineId" value={ordine.id} />
                <input type="hidden" name="statoId" value={s.id} />
                <button className={`stato-pill${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: s.colore }}>
                  <span className="dot" /><span className="stato-label">{s.nome}</span>
                </button>
              </form>
            );
          })}
        </div>
      </div>

      {/* Etichette */}
      <div className="scheda">
        <div className="scheda-titolo">Etichette</div>
        {etichette.length === 0 ? (
          <p className="testo-guida">Nessuna etichetta. Creane in <Link href="/impostazioni" className="ritorno">Impostazioni</Link>.</p>
        ) : (
          <div className="selettore-stato">
            {etichette.map((e) => {
              const attiva = etichetteAttive.has(e.id);
              return (
                <form action={toggleEtichetta} key={e.id}>
                  <input type="hidden" name="ordineId" value={ordine.id} />
                  <input type="hidden" name="etichettaId" value={e.id} />
                  <button className={`stato-pill${attiva ? " attuale" : ""}`} style={{ color: e.colore }}>
                    <span className="dot" /><span className="stato-label">{attiva ? "✓ " : ""}{e.nome}</span>
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </div>

      {/* Classificazione / instradamento */}
      <div className="scheda">
        <div className="scheda-titolo">Classificazione e instradamento</div>
        <form action={aggiornaClassificazione} className="modulo">
          <input type="hidden" name="ordineId" value={ordine.id} />
          <div className="campo-modulo">
            <label>Categoria pagamento</label>
            <select name="categoriaPagamento" defaultValue={ordine.categoriaPagamento}>
              {CATEGORIE_PAGAMENTO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Destinazione (app)</label>
            <select name="assegnatoApp" defaultValue={ordine.assegnatoApp ?? ""}>
              <option value="">— nessuna —</option>
              {APP_DESTINAZIONI.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Tipo consegna</label>
            <input name="tipoConsegna" defaultValue={ordine.tipoConsegna ?? ""} placeholder="consegna, ritiro, spedizione…" />
          </div>
          <div className="campo-modulo">
            <label>Tipo prodotto</label>
            <input name="tipoProdotto" defaultValue={ordine.tipoProdotto ?? ""} placeholder="fiori, pasticceria, gift…" />
          </div>
          <div className="campo-modulo">
            <label>Canale</label>
            <input name="canale" defaultValue={ordine.canale ?? ""} placeholder="web, telefono, rivenditore…" />
          </div>
          <div className="campo-modulo">
            <label>Fornitore assegnato</label>
            <input name="fornitore" defaultValue={ordine.fornitore ?? ""} placeholder="fiorario/pasticceria" />
          </div>
          <div className="campo-modulo">
            <label>Responsabile</label>
            <input name="responsabile" defaultValue={ordine.responsabile ?? ""} placeholder="persona o email in carico" />
          </div>
          <div className="campo-modulo largo">
            <label>Note interne</label>
            <textarea name="noteInterne" rows={3} defaultValue={ordine.noteInterne ?? ""} />
          </div>
          <div className="azioni-modulo largo">
            <button className="btn" type="submit">Salva classificazione</button>
          </div>
        </form>
      </div>

      {/* Rimborso parziale: l'ordine è vivo, ma una parte del denaro è tornata
          al cliente e nel registro non c'è quanta. Va guardato da una persona. */}
      {problematico(ordine) && (
        <div className="scheda scheda-problema">
          <div className="scheda-titolo">Ordine problematico</div>
          <ul className="motivi-rischio">
            {motiviProblema(ordine).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="testo-guida" style={{ margin: "10px 0" }}>
            Il marchio dipende dallo stato del pagamento su Shopify e resta finché resta
            quello: non si toglie a mano. Quello che si può fare è dire che è stato{" "}
            <strong>verificato</strong>, così esce dalla coda di chi deve controllare — e la
            nota resta scritta per chi passa dopo.
            {ordine.problemaGestito && ordine.problemaNota ? (
              <>
                {" "}Verificato: <strong>{ordine.problemaNota}</strong>
              </>
            ) : null}
          </p>
          <form action={segnaProblemaGestito} className="modulo">
            <input type="hidden" name="ordineId" value={ordine.id} />
            <input type="hidden" name="gestito" value={ordine.problemaGestito ? "no" : "si"} />
            <div className="campo-modulo largo">
              <label htmlFor="nota-problema">Cosa è successo</label>
              <input
                id="nota-problema"
                name="nota"
                defaultValue={ordine.problemaNota ?? ""}
                placeholder="es. rimborsata la spedizione per il ritardo, cliente d'accordo"
              />
            </div>
            <div className="azioni-modulo campo-modulo largo">
              <button className="btn" type="submit">
                {ordine.problemaGestito ? "Rimetti fra i casi da verificare" : "Segna come verificato"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Service: cosa è andato storto su questo ordine, e come l'ha
          giudicato il cliente. Arriva da deluxy-messaging: qui è sola lettura. */}
      {ordine.feedback.length > 0 && (
        <div className="scheda">
          <div className="scheda-titolo">Customer Service — reclami e voti</div>
          <ul className="feedback-lista">
            {ordine.feedback.map((f) => (
              <li key={f.id} className="feedback-voce">
                <div className="feedback-testa">
                  {f.tipo === "reclamo" ? (
                    <>
                      <span className="badge" style={{ color: coloreGravitaFeedback(f.gravita) }}>
                        <span className="dot" />
                        {f.casistica || "Reclamo"}
                      </span>
                      <span className="badge neutro">{statoFeedbackLeggibile(f.stato)}</span>
                      {f.colpaNome && <span className="stato-shopify">colpa: {f.colpaNome}</span>}
                    </>
                  ) : (
                    <>
                      <span className="badge" style={{ color: "var(--gold-strong)" }}>
                        <span className="dot" />
                        Voto {f.voto}/5
                      </span>
                      {f.soggettoNome && <span className="stato-shopify">su {f.soggettoNome}</span>}
                      {f.origine && <span className="stato-shopify">via {f.origine}</span>}
                    </>
                  )}
                  <span className="feedback-data">{dataBreve(f.creatoIl)}</span>
                </div>
                {(f.descrizione || f.testo) && <p className="feedback-testo">{f.descrizione || f.testo}</p>}
                {f.esito && <p className="feedback-esito"><strong>Esito:</strong> {f.esito}</p>}
              </li>
            ))}
          </ul>
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Copia di sola lettura: reclami e voti si aprono e si chiudono nell&apos;app Customer
            Service, non da qui.
          </p>
        </div>
      )}

      {/* Biglietto: per un fioraio è il dato da non sbagliare, va scritto a mano */}
      {ordine.biglietto && (
        <div className="scheda">
          <div className="scheda-titolo">
            ✉ {ordine.bigliettoDaNota ? "Possibile biglietto — da verificare" : "Biglietto"}
          </div>
          <blockquote className={`testo-biglietto${ordine.bigliettoDaNota ? " da-verificare" : ""}`}>
            {ordine.biglietto}
          </blockquote>
          {ordine.bigliettoDaNota && (
            <p className="testo-guida" style={{ marginTop: 8 }}>
              Questo testo è la <strong>nota dell&apos;ordine</strong>, non un campo biglietto compilato dal
              sito: nomina una dedica, ma può contenere anche indirizzi e istruzioni per la consegna.
              Va letto prima di copiarlo sul cartoncino.
            </p>
          )}
        </div>
      )}

      {/* Rischio frode: si mostra la scheda solo se c'è qualcosa da sapere */}
      {(rischioDaSegnalare(ordine.rischioLivello) || ordine.rischioMotivi) && (
        <div className="scheda">
          <div className="scheda-titolo">Rischio frode (analisi di Shopify)</div>
          <p style={{ marginBottom: 10 }}>
            <span className="badge-rischio" style={{ color: coloreRischio(ordine.rischioLivello) }}>
              {rischioDaSegnalare(ordine.rischioLivello) ? "⚠ " : ""}
              {rischioLeggibile(ordine.rischioLivello) ?? "non valutato"}
            </span>
            {ordine.rischioRaccomandazione && (
              <span className="stato-shopify" style={{ marginLeft: 10 }}>
                Shopify consiglia: {ordine.rischioRaccomandazione === "ACCEPT" ? "accettare" : ordine.rischioRaccomandazione === "INVESTIGATE" ? "verificare" : ordine.rischioRaccomandazione === "CANCEL" ? "annullare" : "nessun consiglio"}
              </span>
            )}
          </p>
          {ordine.rischioMotivi && (
            <ul className="motivi-rischio">
              {ordine.rischioMotivi.split("\n").filter(Boolean).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Sono elencati solo i segnali <strong>negativi</strong>. Un rischio basso è la norma e non
            richiede nulla; medio e alto meritano un controllo prima di lavorare l&apos;ordine.
          </p>
        </div>
      )}

      {/* Dati Shopify */}
      <div className="scheda">
        <div className="scheda-titolo">Dati Shopify</div>
        <dl className="griglia-campi">
          <div className="campo"><dt>Pagamento</dt><dd style={{ color: colorePagamento(ordine.financialStatus) }}>
            {pagamentoLeggibile(ordine.financialStatus) ?? "—"}
          </dd></div>
          <div className="campo"><dt>Evasione</dt><dd style={{ color: coloreEvasione(ordine.fulfillmentStatus) }}>
            {evasioneLeggibile(ordine.fulfillmentStatus) ?? "—"}
          </dd></div>
          {ordine.chiusoIl && (
            <div className="campo"><dt>Archiviato su Shopify</dt><dd>{dataBreve(ordine.chiusoIl)}</dd></div>
          )}
          <div className="campo"><dt>Gateway</dt><dd>{ordine.gateway ?? "—"}</dd></div>
          <div className="campo"><dt>Cliente</dt><dd>{ordine.clienteNome ?? "—"}</dd></div>
          <div className="campo"><dt>Email</dt><dd>{ordine.clienteEmail ?? "—"}</dd></div>
          <div className="campo"><dt>Telefono</dt><dd>{ordine.clienteTelefono ?? "—"}</dd></div>
          <div className="campo campo-largo"><dt>Spedizione</dt><dd>
            {[ordine.spedizioneNome, ordine.indirizzo, [ordine.cap, ordine.citta, ordine.provincia].filter(Boolean).join(" "), ordine.paese]
              .filter(Boolean).join(" · ") || "—"}
          </dd></div>
          {ordine.tagShopify && <div className="campo campo-largo"><dt>Tag Shopify</dt><dd>{ordine.tagShopify}</dd></div>}
          {ordine.noteShopify && <div className="campo campo-largo"><dt>Note Shopify</dt><dd>{ordine.noteShopify}</dd></div>}
        </dl>
        {ordine.righe.length > 0 && (
          <ul className="righe" style={{ marginTop: 16 }}>
            {ordine.righe.map((r) => (
              <li key={r.id}>
                {r.immagine && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="riga-foto" src={r.immagine} alt="" loading="lazy" />
                )}
                <span className="riga-qta">{r.quantita}×</span>
                <span className="riga-titolo">
                  {r.titolo}{r.variante ? ` — ${r.variante}` : ""}{r.sku ? ` · ${r.sku}` : ""}
                  {/* Personalizzazioni scelte dal cliente, come le mostra Shopify */}
                  {r.proprieta && (
                    <span className="riga-proprieta">
                      {r.proprieta.split("\n").filter(Boolean).map((p, i) => (
                        <span key={i} className="proprieta">{p}</span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="riga-prezzo">{euro(r.prezzo, ordine.valuta)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Storia */}
      <div className="scheda">
        <div className="scheda-titolo">Storia</div>
        {ordine.eventi.length === 0 ? (
          <p className="testo-guida">Nessun evento.</p>
        ) : (
          <ul className="storia">
            {ordine.eventi.map((ev) => (
              <li key={ev.id}>
                <span className="storia-data">{new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(ev.creatoIl)}</span>
                <span>{ev.descrizione}</span>
                <span className="storia-autore">{ev.autore}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

// Gravità di un reclamo: 3 grave (rosso), 2 media (arancio), 1 lieve (neutro).
// Gli stessi colori del Customer Service, così un reclamo grave si riconosce
// uguale nelle due app.
function coloreGravitaFeedback(gravita: number | null): string {
  if (gravita === 3) return "var(--red)";
  if (gravita === 2) return "var(--orange)";
  return "var(--text-secondary)";
}

function statoFeedbackLeggibile(stato: string): string {
  const nomi: Record<string, string> = {
    aperto: "Aperto",
    in_lavorazione: "In lavorazione",
    risolto: "Risolto",
    chiuso: "Chiuso",
  };
  return nomi[stato] ?? stato ?? "—";
}
