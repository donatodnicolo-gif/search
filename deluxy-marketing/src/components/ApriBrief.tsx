"use client";

import { useRef } from "react";

// Il bottone «Vedi brief» in cima alla scheda campagna, con il brief dentro
// una finestra.
//
// ⚠️ PERCHÉ IN UNA FINESTRA E NON A PAGINA. Il brief è un documento: si
// consulta quando serve — «che cosa avevamo deciso?» — e nel frattempo occupava
// il secondo blocco della scheda, davanti ai numeri che invece si guardano ogni
// giorno. Un dato importante ma raro va raggiungibile in un click, non messo
// sulla strada di quelli frequenti.
//
// ⚠️ Il contenuto arriva come `children` GIÀ RENDERIZZATO dal server: qui
// dentro non si legge niente dal database. Così la finestra resta un pezzo di
// interfaccia e il brief resta un componente server, senza portare query nel
// browser.
export function ApriBrief({
  titolo,
  sottotitolo,
  children,
}: {
  titolo: string;
  sottotitolo?: string;
  children: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondario"
        onClick={() => dialogo.current?.showModal()}
        title="Il brief con cui questa campagna è stata lanciata dall'app, e che cosa è arrivato su Google"
      >
        Vedi brief
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          // Click sullo sfondo = chiudi. Il bersaglio è il <dialog> stesso solo
          // quando si colpisce l'area fuori dal corpo.
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        {/* ⚠️ `.modale-elenco` scorre solo se è FIGLIO DIRETTO di
            `.modale-corpo`: mettendoci in mezzo un altro contenitore, il piede
            con «Chiudi» finisce fuori schermo sui brief lunghi. Costata già
            una volta, con PortaKeyword. */}
        <div className="modale-corpo">
          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Come è nata questa campagna</div>
              <div className="modale-titolo">{titolo}</div>
              {sottotitolo && <div className="cella-sub">{sottotitolo}</div>}
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
            {children}
          </div>

          <div className="modale-piede">
            <button
              type="button"
              className="btn small btn-secondario"
              onClick={() => dialogo.current?.close()}
            >
              Chiudi
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
