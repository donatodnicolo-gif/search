"use client";

import { useActionState, useState } from "react";
import { applicaProposta, proponiRitocco, type EsitoAi } from "@/app/actions";

// «Fallo sistemare all'AI»: si sceglie un ritocco pronto (più corto, più
// formale, adattalo a WhatsApp…) o si scrive cosa cambiare. La versione nuova
// compare accanto, e sostituisce quella vera SOLO se una persona preme «usa
// questa versione». Finché non lo fa, nell'archivio resta il testo di prima.
export function AiRitocco({
  id,
  slug,
  accesa,
  ritocchi,
}: {
  id: string;
  slug: string;
  accesa: boolean;
  ritocchi: { valore: string; nome: string }[];
}) {
  const [esito, azione, inCorso] = useActionState<EsitoAi | null, FormData>(proponiRitocco, null);
  const [ritocco, setRitocco] = useState("");

  if (!accesa) {
    return (
      <div className="scheda">
        <div className="scheda-titolo">Fallo sistemare all&apos;AI</div>
        <p className="campo-aiuto">
          L&apos;AI è spenta: manca <code className="inline">OPENAI_API_KEY</code> fra le variabili d&apos;ambiente.
        </p>
      </div>
    );
  }

  const p = esito?.proposta;

  return (
    <div className="scheda scheda-ai">
      <div className="scheda-titolo">Fallo sistemare all&apos;AI</div>
      <form action={azione}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="ritocco" value={ritocco} />
        <div className="chip-riga" style={{ marginBottom: 12 }}>
          {ritocchi.map((r) => (
            <button
              type="button"
              key={r.valore}
              className={`stato-pill${ritocco === r.valore ? " attuale" : ""}`}
              onClick={() => setRitocco(ritocco === r.valore ? "" : r.valore)}
            >
              {r.nome}
            </button>
          ))}
        </div>
        <div className="azioni-modulo">
          <input
            name="istruzione"
            placeholder="Oppure scrivi tu cosa cambiare: «togli il riferimento allo sconto»"
            style={{
              flex: 1,
              font: "inherit",
              fontSize: 13.5,
              background: "var(--fill)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-m)",
              padding: "9px 12px",
            }}
          />
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Ci sto lavorando…" : "Proponi una versione"}
          </button>
        </div>
      </form>

      {esito?.errore && <div className="avviso-errore" style={{ marginTop: 14 }}>{esito.errore}</div>}

      {p && (
        <div className="proposta">
          <div className="proposta-testa">
            <span className="badge attenzione">proposta dell&apos;AI — il testo salvato non è cambiato</span>
          </div>
          {p.oggetto && (
            <div className="oggetto-riga">
              <span className="oggetto-etichetta">Oggetto</span>
              <span className="oggetto-testo">{p.oggetto}</span>
            </div>
          )}
          <pre className="messaggio">{p.corpo}</pre>
          {p.note && <p className="campo-aiuto" style={{ marginTop: 8 }}>{p.note}</p>}
          <form action={applicaProposta} className="azioni-modulo">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="oggetto" value={p.oggetto} />
            <input type="hidden" name="corpo" value={p.corpo} />
            <button className="btn" type="submit">Usa questa versione</button>
          </form>
        </div>
      )}
    </div>
  );
}
