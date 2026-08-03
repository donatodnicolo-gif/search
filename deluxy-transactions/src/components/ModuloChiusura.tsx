"use client";

import { useActionState, useState } from "react";
import { chiudiRichiesta } from "@/app/actions";
import { METODI_FUORI } from "@/lib/metodi-fuori";

// Chiudere una richiesta senza pagarla da qui.
//
// Sta sotto la firma e non accanto, di proposito: la strada normale è
// approvare e pagare dall'app. Questa è la scorciatoia per il mondo reale — un
// bonifico partito dal portale della banca, un fornitore pagato in contanti,
// una fattura che non si paga più.
//
// Due cose sono volutamente scomode: il motivo è obbligatorio (fra sei mesi è
// l'unica traccia di cosa è successo) e il codice a 6 cifre si digita ogni
// volta, come per una firma.
export function ModuloChiusura({
  id,
  richiedeCodice,
  importo,
  distinta,
  oggi,
}: {
  id: string;
  richiedeCodice: boolean;
  importo: string;
  distinta: string | null;
  oggi: string;
}) {
  const [stato, azione, inCorso] = useActionState(chiudiRichiesta, {} as { errore?: string; ok?: string });
  const [esito, setEsito] = useState<"pagata_fuori" | "annullata">("pagata_fuori");
  const pagata = esito === "pagata_fuori";

  return (
    <div className="firma">
      <div className="firma-testa">
        <div className="firma-titolo">Chiudere senza pagarla da qui</div>
      </div>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}

      <form action={azione}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="esito" value={esito} />

        <div className="selettore-stato" style={{ marginBottom: 14 }}>
          {(
            [
              ["pagata_fuori", "Già pagata altrove"],
              ["annullata", "Annulla la richiesta"],
            ] as const
          ).map(([valore, etichetta]) => (
            <button
              key={valore}
              type="button"
              className={`stato-pill${esito === valore ? " attuale" : ""}`}
              onClick={() => setEsito(valore)}
            >
              <span className="stato-label">{etichetta}</span>
            </button>
          ))}
        </div>

        {pagata && (
          <div className="firma-riga" style={{ marginBottom: 12 }}>
            <div className="campo-modulo" style={{ flex: "1 1 260px" }}>
              <label htmlFor="metodo">Come è stata pagata</label>
              <select id="metodo" name="metodo" defaultValue="bonifico_banca">
                {Object.entries(METODI_FUORI).map(([valore, testo]) => (
                  <option key={valore} value={valore}>
                    {testo}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label htmlFor="dataPagamento">Quando</label>
              <input id="dataPagamento" name="dataPagamento" type="date" max={oggi} defaultValue={oggi} />
            </div>
          </div>
        )}

        <div className="firma-riga">
          {richiedeCodice && (
            <div className="campo-modulo">
              <label htmlFor="codice-chiusura">Codice a 6 cifre</label>
              <input
                id="codice-chiusura"
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
          <div className="campo-modulo" style={{ flex: "1 1 300px" }}>
            <label htmlFor="motivo-chiusura">
              {pagata ? "Dove e da chi (numero dell'operazione, conto…)" : "Perché la annulli"}
            </label>
            <input id="motivo-chiusura" name="motivo" required minLength={3} />
          </div>
          <button
            className={`btn${pagata ? "" : " btn-rifiuta"}`}
            type="submit"
            disabled={inCorso}
            onClick={(e) => {
              const domanda = pagata
                ? `Confermi che ${importo} sono già stati pagati fuori da questa app? La richiesta risulterà pagata e l'app che l'ha chiesta lo darà per fatto.`
                : `Confermi l'annullamento di ${importo}? Non si paga più da qui.`;
              if (!confirm(domanda)) e.preventDefault();
            }}
          >
            {inCorso ? "Registro…" : pagata ? "Segna pagata altrove" : "Annulla la richiesta"}
          </button>
        </div>

        <p className="firma-nota">
          {pagata ? (
            <>
              Questo non fa uscire denaro: <strong>registra</strong> denaro già uscito da un&apos;altra parte. Non
              sostituisce il file SEPA né il bonifico dalla banca, e resta nel registro col tuo nome — se il pagamento
              non è mai avvenuto davvero, il fornitore resta senza soldi e la coda non lo ricorda più.
            </>
          ) : (
            <>Annullare chiude la partita senza pagamento: l&apos;app che l&apos;ha chiesta potrà richiederla di nuovo.</>
          )}
          {distinta && (
            <>
              {" "}
              La richiesta esce dalla distinta <strong>{distinta}</strong>, così non viene pagata una seconda volta; se
              quella distinta era sbloccata, lo sblocco decade.
            </>
          )}
        </p>
      </form>
    </div>
  );
}
