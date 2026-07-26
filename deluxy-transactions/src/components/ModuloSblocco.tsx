"use client";

import { useActionState } from "react";
import { chiediCodicePagamento, sbloccaPagamento } from "@/app/actions";

// La porta da cui esce il denaro, in due tempi:
//   1. «Mandami il codice» → arriva un'email al pagatore con importo e
//      beneficiari scritti dentro: se il codice non l'hai chiesto tu, lo scopri lì;
//   2. codice + PIN → la distinta si sblocca per pochi minuti e solo in quella
//      finestra il file SEPA si genera.
//
// Chi non è il pagatore non vede questo riquadro: vede perché non lo vede.
export function ModuloSblocco({
  id,
  totale,
  sbloccoFinoA,
  codiceInCorso,
  pinImpostato,
}: {
  id: string;
  totale: string;
  sbloccoFinoA: string | null;
  codiceInCorso: boolean;
  pinImpostato: boolean;
}) {
  const [statoCodice, azioneCodice, invioInCorso] = useActionState(
    chiediCodicePagamento,
    {} as { errore?: string; ok?: string },
  );
  const [statoSblocco, azioneSblocco, sbloccoInCorso] = useActionState(
    sbloccaPagamento,
    {} as { errore?: string; ok?: string },
  );

  if (sbloccoFinoA) {
    return (
      <div className="scheda">
        <div className="scheda-titolo">Pagamento sbloccato</div>
        <div className="avviso-ok">
          Puoi generare il file SEPA fino alle {sbloccoFinoA}. Dopo serve un codice nuovo.
        </div>
      </div>
    );
  }

  return (
    <div className="scheda">
      <div className="scheda-titolo">Sblocco del pagamento</div>

      {!pinImpostato && (
        <div className="avviso-errore">
          Non hai ancora un PIN di pagamento. <a href="/pin">Impostalo</a>: senza, il denaro non esce.
        </div>
      )}
      {statoCodice?.errore && <div className="avviso-errore">{statoCodice.errore}</div>}
      {statoCodice?.ok && <div className="avviso-ok">{statoCodice.ok}</div>}
      {statoSblocco?.errore && <div className="avviso-errore">{statoSblocco.errore}</div>}

      <form action={azioneCodice} style={{ marginBottom: 18 }}>
        <input type="hidden" name="id" value={id} />
        <button className="btn btn-secondario" type="submit" disabled={invioInCorso || !pinImpostato}>
          {invioInCorso ? "Mando…" : codiceInCorso ? "Manda un altro codice" : "Mandami il codice per email"}
        </button>
      </form>

      <form action={azioneSblocco}>
        <input type="hidden" name="id" value={id} />
        <div className="firma-riga">
          <div className="campo-modulo">
            <label htmlFor="codice-pagamento">Codice ricevuto per email</label>
            <input
              id="codice-pagamento"
              className="firma-codice"
              name="codice"
              maxLength={9}
              autoComplete="one-time-code"
              placeholder="XXXX-XXXX"
              required
            />
          </div>
          <div className="campo-modulo">
            <label htmlFor="pin-pagamento">PIN</label>
            <input
              id="pin-pagamento"
              className="firma-codice"
              name="pin"
              type="password"
              inputMode="numeric"
              maxLength={12}
              autoComplete="off"
              required
            />
          </div>
          <button
            className="btn"
            type="submit"
            disabled={sbloccoInCorso || !pinImpostato}
            onClick={(e) => {
              if (!confirm(`Stai per sbloccare l'uscita di ${totale}. Confermi?`)) e.preventDefault();
            }}
          >
            {sbloccoInCorso ? "Verifico…" : `Sblocca ${totale}`}
          </button>
        </div>
      </form>

      <p className="firma-nota">
        Cinque tentativi sbagliati annullano il codice. Se la distinta cambia dopo l&apos;invio — anche di un solo
        centesimo o di un IBAN — il codice non vale più.
      </p>
    </div>
  );
}
