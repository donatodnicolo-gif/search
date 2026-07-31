"use client";

import { useActionState } from "react";
import { chiediCodicePagamento, pagaConQonto, sbloccaPagamento, type EsitoPagamentoUI } from "@/app/actions";

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
  bancaAttiva,
}: {
  id: string;
  totale: string;
  sbloccoFinoA: string | null;
  codiceInCorso: boolean;
  pinImpostato: boolean;
  bancaAttiva: boolean;
}) {
  const [statoCodice, azioneCodice, invioInCorso] = useActionState(
    chiediCodicePagamento,
    {} as { errore?: string; ok?: string },
  );
  const [statoSblocco, azioneSblocco, sbloccoInCorso] = useActionState(
    sbloccaPagamento,
    {} as { errore?: string; ok?: string },
  );
  const [statoBanca, azioneBanca, bancaInCorso] = useActionState(
    pagaConQonto,
    {} as EsitoPagamentoUI,
  );

  // Gli esiti si disegnano una volta sola, qui, e compaiono in tutti e due i
  // riquadri. Prima stavano solo dentro «Pagamento sbloccato»: siccome pagare
  // consuma lo sblocco, la pagina si ridisegnava sull'altro riquadro e la
  // risposta della banca spariva senza che nessuno la leggesse.
  const esiti = (
    <>
      {statoBanca?.errore && <div className="avviso-errore">{statoBanca.errore}</div>}
      {statoBanca?.ok && <div className="avviso-ok">{statoBanca.ok}</div>}
      {statoBanca?.bloccate?.length ? (
        <div className="avviso-errore">
          <strong>
            {statoBanca.bloccate.length === 1
              ? "Un pagamento non è partito."
              : `${statoBanca.bloccate.length} pagamenti non sono partiti.`}{" "}
            Nessun denaro è uscito per questi:
          </strong>
          <ul className="elenco-motivi">
            {statoBanca.bloccate.map((b) => (
              <li key={b.riferimento}>
                <strong>{b.riferimento}</strong> — {b.motivo}
              </li>
            ))}
          </ul>
          <span className="aiuto-campo">
            Lo sblocco si è consumato: per riprovare, dopo aver sistemato il motivo, serve un codice nuovo.
          </span>
        </div>
      ) : null}
      {statoCodice?.errore && <div className="avviso-errore">{statoCodice.errore}</div>}
      {statoCodice?.ok && <div className="avviso-ok">{statoCodice.ok}</div>}
      {statoSblocco?.errore && <div className="avviso-errore">{statoSblocco.errore}</div>}
      {statoSblocco?.ok && <div className="avviso-ok">{statoSblocco.ok}</div>}
    </>
  );

  if (sbloccoFinoA) {
    return (
      <div className="scheda">
        <div className="scheda-titolo">Pagamento sbloccato</div>
        {esiti}
        <div className="avviso-ok">
          Fino alle {sbloccoFinoA} puoi far uscire questa distinta. Dopo serve un codice nuovo.
        </div>

        {bancaAttiva && (
          <form action={azioneBanca} style={{ marginTop: 14 }}>
            <input type="hidden" name="id" value={id} />
            <button
              className="btn"
              type="submit"
              disabled={bancaInCorso}
              onClick={(e) => {
                if (!confirm(`Stai per far partire i bonifici per ${totale} dal conto. Confermi?`)) e.preventDefault();
              }}
            >
              {bancaInCorso ? "Sto pagando…" : `Paga ${totale} dalla banca`}
            </button>
            <p className="firma-nota">
              Parte un bonifico per ogni richiesta, verso beneficiari già resi <strong>fidati</strong> dentro Qonto e
              solo se nome e IBAN corrispondono. Al primo errore mi fermo e ti dico cosa è partito. Questo bottone
              consuma lo sblocco: per un secondo tentativo serve un codice nuovo.
            </p>
          </form>
        )}
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
      {esiti}

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
