"use client";

import { useRef } from "react";

// La matita accanto alla parola di un'operazione in coda: si corregge il testo
// prima di approvarlo, dove lo si legge.
//
// ⚠️ **Qui è l'opposto di `RinominaInline`.** Là il nome vale solo dentro
// l'app e su Google l'oggetto continua a chiamarsi come si chiama. Qui il
// testo È quello che finirà su Google: si corregge una parola che entra in
// un'asta vera, non un'etichetta. Per questo il dialogo lo dice, e per questo
// si può fare solo finché l'operazione non è approvata.
export function ModificaTestoOperazione({
  id,
  testo,
  tipo,
  campagna,
  azione,
}: {
  id: string;
  testo: string;
  // nuova_keyword | negativa: cambia cosa succede su Google
  tipo: string;
  campagna: string;
  azione: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const eNegativa = tipo === "negativa";

  return (
    <>
      <button
        type="button"
        className="matita"
        title="Correggi il testo prima di approvarlo"
        aria-label="Correggi il testo prima di approvarlo"
        onClick={() => dialogo.current?.showModal()}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
          <path d="M14.5 6.5l3 3" />
        </svg>
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        <form action={azione} className="modale-corpo">
          <input type="hidden" name="id" value={id} />

          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">
                {eNegativa ? "Parola da escludere" : "Parola da aggiungere"}
              </div>
              <div className="modale-titolo">{testo}</div>
              <div className="cella-sub" style={{ marginTop: 4 }}>su {campagna}</div>
            </div>
            <button
              type="button"
              className="modale-chiudi"
              aria-label="Chiudi"
              onClick={() => dialogo.current?.close()}
            >
              ✕
            </button>
          </div>

          <div className="modale-elenco" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <label className="modale-campo">
              Testo che finirà su Google
              <input name="testo" defaultValue={testo} maxLength={80} autoFocus required />
            </label>
          </div>

          <div className="modale-avviso">
            {eNegativa ? (
              <>
                Questo testo diventerà una <b>negativa</b> sulla campagna: spegnerà del traffico.
                Scrivilo come lo vuoi — la <b>corrispondenza</b> si sceglie a parte, dal menù sulla
                riga.
              </>
            ) : (
              <>
                Questo testo diventerà una <b>keyword vera</b> su Google e comincerà a comprare
                ricerche. Non è un&apos;etichetta dentro l&apos;app: quello che scrivi qui è quello
                che va in asta. La <b>corrispondenza</b> si sceglie a parte, dal menù sulla riga.
              </>
            )}
          </div>

          <div className="modale-piede">
            <button
              type="button"
              className="btn small btn-secondario"
              onClick={() => dialogo.current?.close()}
            >
              Annulla
            </button>
            <button className="btn small" type="submit">
              Salva il testo
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
