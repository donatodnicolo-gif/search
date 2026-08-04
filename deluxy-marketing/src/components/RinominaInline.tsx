"use client";

import { useRef } from "react";

// La matita accanto al titolo: il nome si cambia dove lo si legge, non in un
// riquadro in fondo alla pagina.
//
// ⚠️ Il nome che si scrive qui vale **solo dentro l'app**. Su Google l'oggetto
// continua a chiamarsi come si chiama, ed è giusto così: quel nome è la chiave
// con cui l'import lo ritrova. Stessa idea di `stato` contro
// `statoPiattaforma` — la nostra parola e il fatto della piattaforma non sono
// la stessa cosa e non si sovrascrivono.
export function RinominaInline({
  id,
  nomeVisibile,
  nomeDiPiattaforma,
  cosa,
  azione,
}: {
  id: string;
  nomeVisibile: string | null;
  nomeDiPiattaforma: string;
  // "il gruppo" | "la campagna": entra nelle frasi
  cosa: string;
  azione: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="matita"
        title={`Cambia come si chiama ${cosa} dentro l'app`}
        aria-label={`Cambia come si chiama ${cosa} dentro l'app`}
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
              <div className="modale-occhiello">Come si chiama qui</div>
              <div className="modale-titolo">{nomeVisibile ?? nomeDiPiattaforma}</div>
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
              Nome da usare nell&apos;app
              <input
                name="nomeVisibile"
                defaultValue={nomeVisibile ?? ""}
                placeholder={nomeDiPiattaforma}
                maxLength={120}
                autoFocus
              />
            </label>
          </div>

          <div className="modale-avviso">
            Vale <b>solo dentro l&apos;app</b>: su Google Ads {cosa} continua a chiamarsi «
            {nomeDiPiattaforma}», ed è giusto così — quel nome è la chiave con cui l&apos;import lo
            ritrova. Svuota la casella per tornare a mostrare quello di Google.
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
              Salva nome
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
