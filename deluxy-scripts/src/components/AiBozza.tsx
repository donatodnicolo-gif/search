"use client";

import { useActionState, useState } from "react";
import { creaScript, proponiBozza, type EsitoAi } from "@/app/actions";
import { CANALI, CATEGORIE } from "@/lib/variabili";

// «Fatti scrivere una bozza»: si spiega a parole cosa serve, l'AI propone
// titolo, oggetto e testo con le variabili già al posto dei dati che cambiano.
// La bozza resta a schermo finché una persona non decide: non si salva niente
// da sola, e il testo creato è comunque modificabile riga per riga.
export function AiBozza({ accesa }: { accesa: boolean }) {
  const [esito, azione, inCorso] = useActionState<EsitoAi | null, FormData>(proponiBozza, null);
  // Categoria e canale servono due volte: per chiedere la bozza e per creare il
  // testo con quella bozza. Si tengono qui, così le due form dicono la stessa cosa.
  const [categoria, setCategoria] = useState("vendite");
  const [canale, setCanale] = useState("email");

  if (!accesa) {
    return (
      <div className="scheda">
        <div className="scheda-titolo">Fatti scrivere una bozza</div>
        <p className="campo-aiuto">
          L&apos;AI è spenta: manca <code className="inline">OPENAI_API_KEY</code> fra le variabili
          d&apos;ambiente. Il testo si scrive comunque a mano, qui sotto.
        </p>
      </div>
    );
  }

  const p = esito?.proposta;

  return (
    <div className="scheda scheda-ai">
      <div className="scheda-titolo">Fatti scrivere una bozza</div>
      <form action={azione}>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="brief">Cosa deve dire</label>
            <textarea
              id="brief"
              name="brief"
              rows={3}
              required
              placeholder="A chi si manda, in che occasione, cosa deve ottenere. Es: invito ai clienti B2B per la presentazione della collezione di Natale, incontro riservato in showroom, chiedere conferma."
            />
          </div>
          <div className="campo-modulo">
            <label htmlFor="ai-categoria">Categoria</label>
            <select
              id="ai-categoria"
              name="categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIE.map((c) => (
                <option key={c.valore} value={c.valore}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label htmlFor="ai-canale">Canale</label>
            <select id="ai-canale" name="canale" value={canale} onChange={(e) => setCanale(e.target.value)}>
              {CANALI.map((c) => (
                <option key={c.valore} value={c.valore}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="tono">Tono (facoltativo)</label>
            <input id="tono" name="tono" placeholder="Es. molto formale, oppure confidenziale con un cliente storico" />
          </div>
        </div>
        <div className="azioni-modulo">
          <span className="campo-aiuto" style={{ marginRight: "auto" }}>
            L&apos;AI non inventa nomi, date o prezzi: dove non sa, mette una variabile.
          </span>
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Sto scrivendo…" : "Scrivi la bozza"}
          </button>
        </div>
      </form>

      {esito?.errore && <div className="avviso-errore" style={{ marginTop: 14 }}>{esito.errore}</div>}

      {p && (
        <div className="proposta">
          <div className="proposta-testa">
            <span className="badge attenzione">bozza dell&apos;AI — da rileggere</span>
            {p.titolo && <strong>{p.titolo}</strong>}
          </div>
          {p.oggetto && (
            <div className="oggetto-riga">
              <span className="oggetto-etichetta">Oggetto</span>
              <span className="oggetto-testo">{p.oggetto}</span>
            </div>
          )}
          <pre className="messaggio">{p.corpo}</pre>
          {p.variabili.length > 0 && (
            <ul className="elenco-variabili">
              {p.variabili.map((v) => (
                <li key={v.chiave}>
                  <code className="inline">{`{{${v.chiave}}}`}</code> {v.aCosaServe}
                </li>
              ))}
            </ul>
          )}
          {p.note && <p className="campo-aiuto" style={{ marginTop: 8 }}>{p.note}</p>}

          <form action={creaScript} className="azioni-modulo">
            <input type="hidden" name="nome" value={p.titolo || "Testo senza titolo"} />
            <input type="hidden" name="oggetto" value={p.oggetto} />
            <input type="hidden" name="corpo" value={p.corpo} />
            <input type="hidden" name="categoria" value={categoria} />
            <input type="hidden" name="canale" value={canale} />
            <button className="btn" type="submit">Crea il testo con questa bozza</button>
          </form>
        </div>
      )}
    </div>
  );
}
