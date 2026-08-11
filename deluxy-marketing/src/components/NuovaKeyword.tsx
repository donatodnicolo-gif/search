"use client";

import { useRef, useState } from "react";

// «Aggiungi keyword»: scriverne di nuove a mano in questo gruppo, una per
// riga. Passa dalla coda come tutto il resto — l'app non scrive mai su
// Google in diretta.
//
// ⚠️ La corrispondenza è ESATTA di default: una parola nuova non ha storia,
// e la generica compra ricerche che nessuno ha ancora guardato.
export function NuovaKeyword({
  campagnaId,
  nomeGruppo,
  ritorno,
  azione,
}: {
  campagnaId: string;
  nomeGruppo: string;
  ritorno: string;
  // La stessa porta di «Porta altrove»: accetta più parole (`getAll`) e una
  // sola campagna di destinazione.
  azione: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [testo, setTesto] = useState("");

  // Una per riga, senza vuoti né doppioni: quello che si incolla da un
  // foglio arriva così, e ripulirlo qui evita di accodare righe vuote.
  const parole = [...new Set(testo.split("\n").map((r) => r.trim()).filter(Boolean))];

  return (
    <>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          setTesto("");
          dialogo.current?.showModal();
        }}
        title={`Aggiungi keyword nuove a ${nomeGruppo}: vanno in coda, da approvare in Operazioni`}
      >
        Aggiungi keyword
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        <form action={azione} className="modale-corpo">
          <input type="hidden" name="campagne" value={campagnaId} />
          <input type="hidden" name="ritorno" value={ritorno} />
          <input type="hidden" name={`gruppo_${campagnaId}`} value={nomeGruppo} />
          <input
            type="hidden"
            name="motivo"
            value={`Keyword scritte a mano per ${nomeGruppo}`}
          />
          {parole.map((p) => (
            <input key={p} type="hidden" name="testo" value={p} />
          ))}

          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Aggiungi keyword</div>
              <div className="modale-titolo">{nomeGruppo}</div>
              <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                Una per riga. Vanno in coda e partono solo dopo la tua approvazione in Operazioni.
              </div>
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
              ✕
            </button>
          </div>

          <label className="modale-campo" style={{ margin: "0 18px 10px" }}>
            Le parole
            <textarea
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              rows={7}
              placeholder={"torta compleanno milano\nconsegna torte in giornata\ntorta personalizzata a domicilio"}
              style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", resize: "vertical" }}
            />
          </label>

          <div className="modale-barra">
            <label className="modale-campo" title="Esatta di default: una parola nuova non ha storia, e la generica compra ricerche che nessuno ha ancora guardato">
              Corrispondenza
              <select name="corrispondenza" defaultValue="exact">
                <option value="exact">esatta</option>
                <option value="phrase">a frase</option>
                <option value="broad">generica ⚠</option>
              </select>
            </label>
            <span className="cella-sub">
              {parole.length === 0
                ? "nessuna parola scritta"
                : `${parole.length} parol${parole.length === 1 ? "a" : "e"} da mettere in coda`}
            </span>
          </div>

          <div className="modale-piede">
            <button type="button" className="btn small btn-secondario" onClick={() => dialogo.current?.close()}>
              Annulla
            </button>
            <button className="btn small" type="submit" disabled={parole.length === 0}>
              Metti in coda{parole.length > 0 && ` (${parole.length})`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
