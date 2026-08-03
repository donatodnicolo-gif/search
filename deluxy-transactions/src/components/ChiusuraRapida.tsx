"use client";

import { useActionState, useRef, useState } from "react";
import { chiudiRichiesta } from "@/app/actions";
import { METODI_FUORI } from "@/lib/metodi-fuori";

// Gli stessi due tasti della pagina di dettaglio, ma dentro la coda: da lì si
// smaltiscono venti righe senza aprirne venti.
//
// I campi restano quelli — motivo obbligatorio, codice a 6 cifre — e per non
// allargare la tabella stanno in una finestrella. La finestra serve anche a
// un'altra cosa: mostra riferimento, beneficiario e importo mentre si scrive,
// così non si chiude la riga sbagliata avendo cliccato una riga sopra.
export function ChiusuraRapida({
  id,
  riferimento,
  beneficiario,
  importo,
  richiedeCodice,
  oggi,
}: {
  id: string;
  riferimento: string;
  beneficiario: string;
  importo: string;
  richiedeCodice: boolean;
  oggi: string;
}) {
  const [stato, azione, inCorso] = useActionState(chiudiRichiesta, {} as { errore?: string; ok?: string });
  const [esito, setEsito] = useState<"pagata_fuori" | "annullata">("pagata_fuori");
  const finestra = useRef<HTMLDialogElement>(null);
  const pagata = esito === "pagata_fuori";

  function apri(quale: "pagata_fuori" | "annullata") {
    setEsito(quale);
    finestra.current?.showModal();
  }

  return (
    <>
      <div className="cella-azioni">
        <button type="button" className="btn btn-secondario small" onClick={() => apri("pagata_fuori")}>
          Pagata altrove
        </button>
        <button type="button" className="btn btn-secondario small" onClick={() => apri("annullata")}>
          Annulla
        </button>
      </div>

      {/* La finestra si chiude con Esc da sola: è un <dialog> vero, non un finto
          riquadro sovrapposto. */}
      <dialog className="finestra" ref={finestra}>
        <div className="finestra-corpo">
          <div className="scheda-titolo">{pagata ? "Già pagata altrove" : "Annullare la richiesta"}</div>
          <p className="testo-guida" style={{ marginTop: 0 }}>
            <strong>{riferimento}</strong> · {beneficiario} · <strong>{importo}</strong>
          </p>

          {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}

          <form action={azione}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="esito" value={esito} />
            {/* Alla fine si torna in coda: la riga sparisce, e senza questo
                sparirebbe anche la risposta senza che nessuno l'abbia letta. */}
            <input type="hidden" name="torna" value="/" />

            {pagata && (
              <div className="firma-riga" style={{ marginBottom: 12 }}>
                <div className="campo-modulo" style={{ flex: "1 1 240px" }}>
                  <label htmlFor={`metodo-${id}`}>Come è stata pagata</label>
                  <select id={`metodo-${id}`} name="metodo" defaultValue="bonifico_banca">
                    {Object.entries(METODI_FUORI).map(([valore, testo]) => (
                      <option key={valore} value={valore}>
                        {testo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo">
                  <label htmlFor={`data-${id}`}>Quando</label>
                  <input id={`data-${id}`} name="dataPagamento" type="date" max={oggi} defaultValue={oggi} />
                </div>
              </div>
            )}

            <div className="firma-riga">
              <div className="campo-modulo" style={{ flex: "1 1 240px" }}>
                <label htmlFor={`motivo-${id}`}>
                  {pagata ? "Dove e da chi (numero dell'operazione, conto…)" : "Perché la annulli"}
                </label>
                <input id={`motivo-${id}`} name="motivo" required minLength={3} />
              </div>
              {richiedeCodice && (
                <div className="campo-modulo">
                  <label htmlFor={`codice-${id}`}>Codice a 6 cifre</label>
                  <input
                    id={`codice-${id}`}
                    className="firma-codice"
                    name="codice"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    required
                  />
                </div>
              )}
            </div>

            <p className="firma-nota">
              {pagata
                ? "Non fa uscire denaro: registra denaro già uscito da un'altra parte. Resta nel registro col tuo nome."
                : "Chiude la partita senza pagamento: l'app che l'ha chiesta potrà richiederla di nuovo."}
            </p>

            <div className="azioni-modulo">
              <button type="button" className="btn btn-secondario" onClick={() => finestra.current?.close()}>
                Lascia stare
              </button>
              <button
                className={`btn${pagata ? "" : " btn-rifiuta"}`}
                type="submit"
                disabled={inCorso}
                onClick={(e) => {
                  const domanda = pagata
                    ? `Confermi che ${importo} a ${beneficiario} sono già stati pagati fuori da questa app?`
                    : `Confermi l'annullamento di ${importo} a ${beneficiario}?`;
                  if (!confirm(domanda)) e.preventDefault();
                }}
              >
                {inCorso ? "Registro…" : pagata ? "Segna pagata altrove" : "Annulla la richiesta"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
