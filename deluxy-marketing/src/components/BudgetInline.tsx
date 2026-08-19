"use client";

import { useRef, useState } from "react";

// Il budget giornaliero fra i numeri in alto, con la matita per cambiarlo.
//
// ⚠️ Qui la matita NON scrive: mette in coda. Cambiare il budget è
// un'operazione vera su Google (livello **L2**: sposta traffico), e come ogni
// scrittura passa dall'approvazione manuale e poi dallo script. Una matita che
// salvasse e basta darebbe l'impressione che il budget su Google sia già
// cambiato, mentre non lo è — è l'inganno peggiore che questa pagina possa
// fare.
export function BudgetInline({
  campagnaId,
  budgetAttuale,
  azione,
  inCoda,
}: {
  campagnaId: string;
  budgetAttuale: number | null;
  azione: (fd: FormData) => void | Promise<void>;
  /** Un cambio di budget gia in coda, se c e. */
  inCoda?: { stato: string; budget: number | null } | null;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const gia = inCoda ?? null;
  const [nuovo, setNuovo] = useState(budgetAttuale != null ? String(budgetAttuale) : "");

  const n = Number(String(nuovo).replace(",", "."));
  const valido = Number.isFinite(n) && n > 0;
  // La variazione è il numero che decide il livello e fa scattare gli avvisi:
  // si mostra PRIMA di mettere in coda, non dopo.
  const delta =
    valido && budgetAttuale != null && budgetAttuale > 0
      ? ((n - budgetAttuale) / budgetAttuale) * 100
      : null;

  return (
    <>
      <button
        type="button"
        className="matita"
        title={
          gia
            ? `Attenzione: c'è già un cambio di budget ${gia.stato === "approvata" ? "approvato" : "in attesa di approvazione"}${gia.budget != null ? ` a ${gia.budget} €/g` : ""}. Aprendo qui ne metteresti in coda un secondo.`
            : "Cambia il budget giornaliero (mette in coda, non applica)"
        }
        aria-label="Cambia il budget giornaliero"
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
          <input type="hidden" name="campagnaId" value={campagnaId} />
          <input type="hidden" name="tipo" value="budget" />
          <input type="hidden" name="livello" value="L2" />

          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Budget giornaliero su Google</div>
              <div className="modale-titolo">
                {budgetAttuale != null ? `${budgetAttuale} €/giorno` : "non impostato"}
              </div>
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
            {/* ⚠️ Se ce n'è già uno in coda va detto QUI, prima che si scriva
                un numero: due cambi di budget in coda sulla stessa campagna
                fanno vincere l'ultimo che lo script esegue, e chi ha messo il
                primo non se ne accorge mai. Non lo blocco — a volte è proprio
                quello che si vuole — ma non deve succedere per distrazione. */}
            {gia && (
              <div className="op-avvisi" style={{ marginTop: 0, marginBottom: 14 }}>
                <span aria-hidden="true">⚠</span> C&apos;è <b>già un cambio di budget</b>
                {gia.budget != null ? <> a <b>{gia.budget} €/g</b></> : null}{" "}
                {gia.stato === "approvata"
                  ? "approvato, che aspetta il prossimo giro dello script"
                  : "in attesa di approvazione"}
                . Se ne metti un altro, su Google vince quello che lo script esegue per ultimo:
                conviene annullare il primo in Operazioni, o cambiarlo lì.
              </div>
            )}
            <label className="modale-campo" style={{ marginBottom: 14 }}>
              Nuovo budget (€/giorno)
              <input
                name="budget"
                inputMode="decimal"
                value={nuovo}
                onChange={(e) => setNuovo(e.target.value)}
                placeholder="es. 18,50"
                autoFocus
              />
            </label>
            {delta != null && Math.abs(delta) >= 1 && (
              <div
                className="cella-sub"
                style={{
                  marginBottom: 14,
                  color: Math.abs(delta) > 30 ? "var(--orange)" : undefined,
                }}
              >
                Variazione <b>{delta > 0 ? "+" : ""}{delta.toFixed(0)}%</b>
                {Math.abs(delta) > 30 && " — oltre il 30% l'algoritmo riparte ad apprendere"}
              </div>
            )}
            <label className="modale-campo" style={{ marginBottom: 14 }}>
              Perché
              <input name="motivo" placeholder="Perché lo cambi" />
            </label>
            <label className="modale-campo">
              Come si torna indietro (richiesto sulle L2)
              <input
                name="rollbackPiano"
                placeholder={
                  budgetAttuale != null
                    ? `Es. si rimette a ${budgetAttuale} €/giorno`
                    : "Es. si rimette il budget di prima"
                }
              />
            </label>
          </div>

          <div className="modale-avviso">
            Niente cambia subito su Google: l&apos;operazione entra in coda, la approvi tu in
            Operazioni e la esegue lo script alla passata dopo. Il numero qui sopra resta quello
            di adesso finché non è passata davvero.
          </div>

          <div className="modale-piede">
            <button
              type="button"
              className="btn small btn-secondario"
              onClick={() => dialogo.current?.close()}
            >
              Annulla
            </button>
            <button className="btn small" type="submit" disabled={!valido || n === budgetAttuale}>
              Metti in coda
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
