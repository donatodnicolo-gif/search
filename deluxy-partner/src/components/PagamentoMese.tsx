import { euro, dataIt } from "@/lib/format";
import { registraPagamentoMese, azzeraPagamentoMese, salvaNoteMese } from "@/lib/actions";
import { richiediPagamento } from "@/lib/pagamenti-partner-actions";
import { etichettaRichiesta, richiestaRifacibile } from "@/lib/transactions";
import { BottoneInvio } from "./BottoneInvio";

// Footer del blocco mese nella scheda partner.
// Mostra SOLO ciò che serve: un riquadro "Da pagare al partner" se c'è un
// dovuto aperto, un riquadro "Da incassare" se ci sono fatture aperte, una riga
// verde se il mese è pareggiato. Sotto, la nota del mese (compatta, espandibile),
// che viene inclusa nel prompt del recap AI.
export function PagamentoMese({
  partnerId,
  anno,
  mese,
  daBonificare,
  daIncassare,
  bonificoImporto,
  bonificoData,
  note,
  noteAggiornateIl,
  trxAttiva,
  richiestaRif,
  richiestaStato,
  richiestaIl,
  nettoCompensato = null,
  pagatoInPiu = 0,
  incassatoInPiu = 0,
  movimentoId = null,
}: {
  partnerId: string;
  anno: number;
  mese: number;
  daBonificare: number;
  daIncassare: number;
  // Partner IN COMPENSAZIONE: il netto dell'anno (crediti del partner meno i
  // suoi debiti). È QUESTA la cifra che «Paga» chiede a Transactions, non il
  // dovuto del mese: il bottone deve dirlo, altrimenti si legge 185,22 sul mese
  // e si trova 48,30 in Transactions (ANTOFLOWERS, 04/09/2026). `null` = partner
  // senza compensazione, si chiede il mese.
  nettoCompensato?: number | null;
  bonificoImporto: number | null;
  bonificoData: Date | null;
  note: string | null;
  noteAggiornateIl?: Date | null;
  // Richiesta di pagamento verso Deluxy Transactions: se e gia partita si
  // mostra il suo stato invece di un bottone che la duplicherebbe.
  trxAttiva?: boolean;
  richiestaRif?: string | null;
  richiestaStato?: string | null;
  // Quando e' partito l'ultimo invio: serve a sbloccare un «invio» rimasto
  // appeso (vedi richiestaRifacibile).
  richiestaIl?: Date | null;
  // Lo SFORO nei due versi, calcolato dal motore (`calc.ts`). Qui serve per due
  // cose: non dichiarare «pareggiato» un mese che pareggiato non è, e dire cosa
  // succede adesso a quei soldi.
  pagatoInPiu?: number;
  incassatoInPiu?: number;
  // Il movimento bancario di Finance che corrisponde a questo bonifico, quando
  // se ne riconosce UNO solo. È la destinazione del link quando il pagamento
  // NON è uscito da Transactions.
  movimentoId?: string | null;
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const inviato = registraPagamentoMese.bind(null, partnerId, anno, mese, "inviato");
  const ricevuto = registraPagamentoMese.bind(null, partnerId, anno, mese, "ricevuto");
  const azzera = azzeraPagamentoMese.bind(null, partnerId, anno, mese);
  const salvaNote = salvaNoteMese.bind(null, partnerId, anno, mese);
  const richiedi = richiediPagamento.bind(null, partnerId, anno, mese, +daBonificare.toFixed(2), `/partner/${partnerId}`);

  // ⚠️ 09/09/2026 — «pareggiato» si calcolava QUI, con due voci su quattro, e
  // diceva «Mese pareggiato» sotto un mese che aveva 683,84 € usciti in più
  // (BOTTEGA 2E, giugno). Un mese con uno sforo non è pareggiato: è sbagliato
  // in un verso invece che nell'altro. Stessa condizione del motore
  // (`RiepilogoMese.pareggiato`), che guarda tutte e quattro le voci.
  const pareggiato =
    daBonificare < 0.01 && daIncassare < 0.01 && pagatoInPiu < 0.01 && incassatoInPiu < 0.01;
  const registrato = bonificoImporto != null && Math.abs(bonificoImporto) >= 0.005;
  const notaTrim = note?.trim() || null;
  // una nota vecchia di oltre 90 giorni parla di una situazione che nel frattempo
  // può essersi risolta: si apre già espansa e il recap AI la mette in verifica
  const vecchia =
    !!noteAggiornateIl && Date.now() - new Date(noteAggiornateIl).getTime() > 90 * 86400000;

  return (
    <div className="month-footer">
      <div className="pay-row">
        {daBonificare >= 0.01 && (
          <form action={inviato} className="pay-group">
            <span className="pay-title" style={{ color: "var(--orange)" }}>
              Da pagare al partner
            </span>
            <input
              type="number"
              name="importo"
              step="0.01"
              min="0"
              defaultValue={+daBonificare.toFixed(2)}
              aria-label="Importo da pagare"
            />
            <input type="date" name="data" defaultValue={oggi} aria-label="Data pagamento" />
            <BottoneInvio className="btn small secondary" inCorso="Registro…" title="Registra un bonifico GIA fatto dalla banca. Non chiede niente a nessuno.">
              Abbiamo pagato
            </BottoneInvio>
          </form>
        )}

        {/* Form a se: dentro quello sopra, premendo Invio nel campo importo
            sarebbe partita la richiesta invece della registrazione. */}
        {daBonificare >= 0.01 && trxAttiva && (!richiestaRif || richiestaRifacibile(richiestaStato, richiestaIl)) && (
          <form action={richiedi} className="pay-group">
            <span className="pay-title" style={{ color: "var(--blue)" }}>Chiedi a Transactions</span>
            {nettoCompensato != null && nettoCompensato < 0.01 ? (
              // In compensazione il partner deve ancora più di quanto Deluxy
              // deve a lui: non c'è niente da chiedere, e un bottone qui
              // manderebbe una richiesta che il server rifiuta.
              <span className="muted" style={{ fontSize: 12.5 }}>
                Niente da chiedere: in compensazione il partner deve ancora {euro(-nettoCompensato)} a Deluxy sull&apos;anno.
              </span>
            ) : (
              <BottoneInvio
                className="btn small primary"
                inCorso="Invio…"
                title={
                  nettoCompensato != null
                    ? `Chiede a Transactions il NETTO dell'anno in compensazione (${euro(nettoCompensato)}), non il dovuto del mese. NON esce denaro adesso: la richiesta va autorizzata da una persona.`
                    : "Avvia il pagamento del residuo del mese su Deluxy Transactions. NON esce denaro adesso: la richiesta va autorizzata da una persona."
                }
              >
                {nettoCompensato != null && Math.abs(nettoCompensato - daBonificare) >= 0.01
                  ? `Paga il netto ${euro(nettoCompensato)}`
                  : "Paga"}
              </BottoneInvio>
            )}
            {nettoCompensato != null && nettoCompensato >= 0.01 && Math.abs(nettoCompensato - daBonificare) >= 0.01 && (
              <span className="muted" style={{ fontSize: 12.5 }}>
                In compensazione si chiede il netto dell&apos;anno, non i {euro(daBonificare)} del mese.
              </span>
            )}
            {(richiestaStato === "invio_fallito" || richiestaStato === "invio") && (
              <span style={{ color: "var(--red)", fontSize: 12.5 }}>
                L&apos;ultimo invio non è arrivato a Transactions: il motivo è nel registro modifiche. Riprova.
              </span>
            )}
          </form>
        )}
        {richiestaRif && !richiestaRifacibile(richiestaStato, richiestaIl) && (
          <span className="pay-group" style={{ alignItems: "center" }}>
            <span className="pay-title">Richiesta a Transactions</span>
            <span className={`badge ${etichettaRichiesta(richiestaStato).badge}`} title={`${richiestaRif} — il pagamento va autorizzato in Transactions`}>
              <span className="dot" />{etichettaRichiesta(richiestaStato).label}
            </span>
          </span>
        )}

        {daIncassare >= 0.01 && (
          <form action={ricevuto} className="pay-group">
            <span className="pay-title" style={{ color: "var(--orange)" }}>
              Da incassare dal partner
            </span>
            <input
              type="number"
              name="importo"
              step="0.01"
              min="0"
              defaultValue={+daIncassare.toFixed(2)}
              aria-label="Importo da incassare"
            />
            <input type="date" name="data" defaultValue={oggi} aria-label="Data incasso" />
            <BottoneInvio className="btn small secondary" inCorso="Registro…" title="Registra il pagamento ricevuto dal partner">
              Hanno pagato
            </BottoneInvio>
          </form>
        )}

        {pareggiato && (
          <span className="badge green"><span className="dot" />Mese pareggiato — niente da registrare</span>
        )}

        {/* ⭐ 09/09/2026 (richiesta dell'utente: «non dà ancora il messaggio del
            plus che abbiamo mandato e delle conseguenze»). Lo sforo era scritto
            solo dentro la tabella, come pallino accanto al calcolo; qui sotto —
            dove si decide cosa fare del mese — non compariva, e al suo posto
            c'era un «Mese pareggiato» verde. Adesso dice quanto, e cosa succede
            adesso a quei soldi. */}
        {pagatoInPiu >= 0.01 && (
          <span className="pay-group">
            <span className="pay-title" style={{ color: "var(--red)" }}>Uscito più del dovuto</span>
            <span className="badge red">
              <span className="dot" />Inviato in più {euro(pagatoInPiu)}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              È un errore, non un anticipo concordato: viene <b>scalato dai prossimi bonifici</b> a
              questo partner, finché non rientra. Se il bonifico non è mai partito, annullalo qui: lo
              sforo si calcola da quello e sparisce da sé.
            </span>
          </span>
        )}

        {incassatoInPiu >= 0.01 && (
          <span className="pay-group">
            <span className="pay-title" style={{ color: "var(--orange)" }}>Incassato più del dovuto</span>
            <span className="badge orange">
              <span className="dot" />Ricevuto in più {euro(incassatoInPiu)}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Il partner ha versato più di quanto avesse aperto: la differenza resta a suo credito e
              si scala dalle prossime fatture.
            </span>
          </span>
        )}

        {registrato && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* ⭐ 08-09/09/2026 (richiesta dell'utente). Da qui si va dove quel
                pagamento vive DAVVERO, e le destinazioni sono due:
                  · su **Transactions**, ma SOLO se di là la richiesta risulta
                    *pagata* — è allora che il denaro è uscito da lì e che la
                    prova (autorizzazioni, allegati) sta in quella scheda;
                  · altrimenti sul **movimento bancario di Finance**, che è da
                    dove quel bonifico è stato registrato.
                Una richiesta «in attesa» non è una prova di pagamento: su
                BOTTEGA 2E giugno mostrava 769,32 € pagati e insieme «Pagamento
                in attesa», e il link portava a una richiesta che quei soldi non
                li aveva fatti uscire.
                Se non si riconosce nessuno dei due — bonifico annotato a mano,
                oppure due movimenti lo stesso giorno — resta testo: un link che
                sceglie a caso è peggio di nessun link. */}
            {(() => {
              const testo = (
                <>
                  {bonificoImporto! > 0 ? "Pagato al partner" : "Incassato dal partner"}{" "}
                  {euro(Math.abs(bonificoImporto!))}
                  {bonificoData ? ` il ${dataIt(bonificoData)}` : ""}
                </>
              );
              if (richiestaRif && richiestaStato === "pagata") {
                return (
                  <a
                    className="muted"
                    style={{ fontSize: 12.5 }}
                    href={`https://deluxy-transactions.vercel.app/richieste/${encodeURIComponent(richiestaRif)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Pagato da Deluxy Transactions — apri la richiesta ${richiestaRif}`}
                  >
                    {testo} ↗
                  </a>
                );
              }
              if (movimentoId) {
                return (
                  <a
                    className="muted"
                    style={{ fontSize: 12.5 }}
                    href={`/movimenti/${movimentoId}`}
                    title="Apri il movimento bancario da cui questo pagamento è stato registrato"
                  >
                    {testo} ↗
                  </a>
                );
              }
              // Nessun movimento agganciato (bonifico annotato a mano, o due
              // movimenti lo stesso giorno): invece di lasciare testo morto si
              // apre l'archivio banca già filtrato per IMPORTO, VERSO e GIORNO —
              // la ricerca dei movimenti accetta un importo come termine. Se in
              // banca quel bonifico c'è, la riga è lì; se non c'è, l'elenco
              // vuoto è a sua volta una risposta.
              if (bonificoData) {
                const giorno = new Date(bonificoData).toISOString().slice(0, 10);
                const q = new URLSearchParams({
                  q: Math.abs(bonificoImporto!).toFixed(2),
                  dir: bonificoImporto! > 0 ? "uscite" : "entrate",
                  dal: giorno,
                  al: giorno,
                }).toString();
                return (
                  <a
                    className="muted"
                    style={{ fontSize: 12.5 }}
                    href={`/movimenti?${q}`}
                    title="Questo pagamento non è uscito da Transactions e non è agganciato a un movimento: cercalo in banca (stesso importo, stesso giorno)"
                  >
                    {testo} ↗
                  </a>
                );
              }
              return (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {testo}
                </span>
              );
            })()}
            <form action={azzera}>
              <BottoneInvio
                className="btn small danger"
                inCorso="Annullo…"
                title="Annulla i pagamenti registrati per questo mese"
              >
                Annulla
              </BottoneInvio>
            </form>
          </span>
        )}
      </div>

      <details className="note-details" open={!!notaTrim && vecchia}>
        <summary>
          <span aria-hidden>{notaTrim ? "★" : "✎"}</span>
          {notaTrim ? (
            <>
              Nota: <span className="note-testo">{notaTrim}</span>
              {noteAggiornateIl && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {" "}· scritta il {dataIt(noteAggiornateIl)}
                  {vecchia && " — l'AI la verificherà"}
                </span>
              )}
              <span className="note-azione">modifica</span>
            </>
          ) : (
            <>
              Aggiungi una nota del mese <span className="muted">(inclusa nel recap AI, che ne verifica l&apos;attualità)</span>
            </>
          )}
        </summary>
        <form action={salvaNote} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
          <textarea
            name="note"
            rows={2}
            defaultValue={notaTrim ?? ""}
            placeholder="Es. rateizzazione concordata, ordine contestato, sconto una tantum…"
            style={{ flex: "1 1 320px", fontSize: 13, padding: "8px 10px", resize: "vertical" }}
          />
          <button className="btn small secondary" type="submit">Salva nota</button>
        </form>
      </details>
    </div>
  );
}
