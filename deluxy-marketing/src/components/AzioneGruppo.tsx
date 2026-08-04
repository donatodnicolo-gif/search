"use client";

import { useRef } from "react";

// Fermare o riaccendere un gruppo è la cosa che si viene a fare su questa
// pagina: il comando sta accanto al titolo, non in fondo alla colonna destra
// dopo dodici riquadri di numeri.
//
// Il modulo resta identico a prima (motivo + piano di rollback) perché quei
// due campi non sono decorazione: il rollback è obbligatorio sulle L2 di una
// campagna traino, e senza il guardrail blocca. Sta in un dialogo per non
// mettere un form di due campi dentro l'intestazione.
export function AzioneGruppo({
  gruppoId,
  inPausa,
  azione,
}: {
  gruppoId: string;
  inPausa: boolean;
  azione: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const etichetta = inPausa ? "Riattiva il gruppo" : "Metti in pausa il gruppo";

  return (
    <>
      <button
        type="button"
        className={`btn${inPausa ? "" : " btn-secondario"}`}
        onClick={() => dialogo.current?.showModal()}
      >
        {etichetta}
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        <form action={azione} className="modale-corpo">
          <input type="hidden" name="gruppoId" value={gruppoId} />
          <input type="hidden" name="tipo" value={inPausa ? "attiva_gruppo" : "pausa_gruppo"} />

          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Agire su Google</div>
              <div className="modale-titolo">{etichetta}</div>
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
            <label className="modale-campo" style={{ marginBottom: 14 }}>
              Perché
              <input name="motivo" placeholder={inPausa ? "Perché riaccenderlo" : "Perché fermarlo"} />
            </label>
            <label className="modale-campo">
              Come si torna indietro (richiesto sulle L2)
              <input
                name="rollbackPiano"
                placeholder="Es. si riattiva il gruppo e si rimette il budget di prima"
              />
            </label>
          </div>

          <div className="modale-avviso">
            Niente parte da qui: l&apos;operazione entra in coda, la approvi tu in Operazioni, e la
            esegue lo script alla passata dopo.
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
              Metti in coda
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
