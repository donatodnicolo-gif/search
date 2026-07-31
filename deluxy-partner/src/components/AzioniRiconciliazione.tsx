"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { azioneRiconciliazione, type EsitoAzione, type StatoRiga } from "@/lib/riconciliazione-actions";

// Stato e azioni di una riga di riconciliazione, **senza ricaricare la pagina**.
//
// Confermare parla col registro Anagrafiche: prende il suo tempo. Prima quel
// tempo passava con il bottone identico a com'era, e la pagina — che interroga
// anche Fatture in Cloud e Qonto — veniva ricostruita da capo alla fine. Chi
// confermava non sapeva se aveva funzionato e ricliccava.
//
// Occupa due celle (Stato e Azioni), quindi torna un frammento di due `<td>`.
export function AzioniRiconciliazione({
  ficNome,
  partnerId,
  anagraficaId,
  campiJson,
  statoIniziale,
  esitoUltimoInvio,
  scrittura,
  nCampi,
}: {
  ficNome: string;
  partnerId: string;
  anagraficaId: string;
  campiJson: string;
  statoIniziale: StatoRiga;
  esitoUltimoInvio: string | null;
  scrittura: boolean;
  nCampi: number;
}) {
  const [esito, azione] = useActionState<EsitoAzione, FormData>(
    azioneRiconciliazione.bind(null, ficNome, partnerId, anagraficaId, campiJson),
    null
  );
  // dopo un'azione vale il suo esito; prima, quello che dice il database
  const stato = esito ? esito.stato : statoIniziale;

  return (
    <>
      <td>
        {stato === "confermata" ? (
          <span className="badge green"><span className="dot" />Inviato al registro</span>
        ) : !esito && esitoUltimoInvio && esitoUltimoInvio !== "ok" ? (
          <span className="badge red" title={esitoUltimoInvio}><span className="dot" />Invio fallito</span>
        ) : stato === "ignorata" ? (
          <span className="badge neutral"><span className="dot" />Ignorato</span>
        ) : (
          <span className="badge blue"><span className="dot" />Da confermare</span>
        )}
        {esito && (
          <div
            style={{
              fontSize: 11.5,
              marginTop: 4,
              color: esito.ok ? "var(--green)" : "var(--red)",
              lineHeight: 1.35,
            }}
          >
            {esito.ok ? "✓ " : "✕ "}
            {esito.testo}
          </div>
        )}
      </td>
      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
        <form action={azione} style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          {stato === "confermata" || stato === "ignorata" ? (
            <Bottone cosa="riapri" classe="btn small secondary" inCorso="Riapro…">
              Riapri
            </Bottone>
          ) : (
            <>
              <Bottone
                cosa="conferma"
                classe="btn small primary"
                inCorso="Invio…"
                disabilitato={!scrittura || nCampi === 0}
                titolo={
                  !scrittura
                    ? "Configura la chiave di scrittura per aggiornare il registro"
                    : nCampi === 0
                      ? "Nessun dato fiscale da inviare"
                      : "Invia al registro i dati fiscali di Fatture in Cloud"
                }
              >
                Conferma e aggiorna
              </Bottone>
              <Bottone cosa="ignora" classe="btn small secondary" inCorso="…">
                Ignora
              </Bottone>
            </>
          )}
        </form>
      </td>
    </>
  );
}

// `useFormStatus` legge il form che lo contiene: il bottone dev'essere un
// componente a sé. `pending` è vero per tutto il form, quindi mentre una
// azione gira gli altri bottoni della riga si bloccano — ed è giusto: due
// azioni sulla stessa riga insieme non hanno senso.
function Bottone({
  cosa,
  classe,
  inCorso,
  children,
  disabilitato,
  titolo,
}: {
  cosa: string;
  classe: string;
  inCorso: string;
  children: React.ReactNode;
  disabilitato?: boolean;
  titolo?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="cosa"
      value={cosa}
      className={classe}
      disabled={pending || disabilitato}
      aria-busy={pending}
      title={titolo}
      style={pending ? { opacity: 0.75, cursor: "progress" } : undefined}
    >
      {pending ? inCorso : children}
    </button>
  );
}
