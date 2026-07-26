"use client";

import { useActionState, useState } from "react";
import { creaScript, proponiBozza, type EsitoAi } from "@/app/actions";
import { CANALI, CATEGORIE } from "@/lib/variabili";

// Il brief: le domande che farebbe chi scrive per mestiere prima di mettere giù
// una parola. Obbligatorio è solo «cosa deve dire»; ogni altro campo compilato
// toglie un margine di invenzione al modello.
// La bozza che torna resta a schermo: non si salva niente finché una persona
// non preme «crea il testo».
export function AiBozza({ accesa }: { accesa: boolean }) {
  const [esito, azione, inCorso] = useActionState<EsitoAi | null, FormData>(proponiBozza, null);
  // Categoria e canale servono due volte: per chiedere la bozza e per creare il
  // testo con quella bozza. Si tengono qui, così le due form dicono la stessa cosa.
  const [categoria, setCategoria] = useState("vendite");
  const [canale, setCanale] = useState("email");

  if (!accesa) {
    return (
      <div className="scheda">
        <div className="scheda-titolo">Chiedi all&apos;AI</div>
        <p className="campo-aiuto">
          L&apos;AI è spenta: manca <code className="inline">OPENAI_API_KEY</code> fra le variabili
          d&apos;ambiente. Il testo si scrive comunque a mano da{" "}
          <a href="/script/nuovo" style={{ color: "var(--blue)" }}>Nuovo testo</a>.
        </p>
      </div>
    );
  }

  const p = esito?.proposta;

  return (
    <>
      <div className="scheda scheda-ai">
        <div className="scheda-titolo">Il brief</div>
        <form action={azione}>
          <div className="modulo">
            <div className="campo-modulo largo">
              <label htmlFor="brief">Cosa deve dire *</label>
              <textarea
                id="brief"
                name="brief"
                rows={3}
                required
                placeholder="In due righe, come lo spiegheresti a un collega. Es: invito ai clienti B2B per la presentazione della collezione di Natale, incontro riservato in showroom su appuntamento."
              />
            </div>
            <div className="campo-modulo">
              <label htmlFor="destinatario">A chi si manda</label>
              <input id="destinatario" name="destinatario" placeholder="Es. hotel e ristoranti già clienti" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="obiettivo">Cosa deve ottenere</label>
              <input id="obiettivo" name="obiettivo" placeholder="Es. far confermare la presenza" />
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
            <div className="campo-modulo">
              <label htmlFor="tono">Tono</label>
              <input id="tono" name="tono" placeholder="Es. formale ma caloroso" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="lunghezza">Lunghezza</label>
              <select id="lunghezza" name="lunghezza" defaultValue="media">
                <option value="breve">Breve</option>
                <option value="media">Media</option>
                <option value="lunga">Distesa</option>
              </select>
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="daDire">Deve dire per forza</label>
              <textarea
                id="daDire"
                name="daDire"
                rows={2}
                placeholder="I punti che non possono mancare: l'indirizzo dello showroom, che si entra su appuntamento…"
              />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="daNonDire">Non deve dire</label>
              <textarea
                id="daNonDire"
                name="daNonDire"
                rows={2}
                placeholder="I limiti: niente sconti, niente tempi di consegna, non nominare i concorrenti…"
              />
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
      </div>

      {p && (
        <div className="scheda scheda-ai">
          <div className="proposta" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
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
              <span className="campo-aiuto" style={{ marginRight: "auto" }}>
                Lo crei ora e poi lo sistemi riga per riga: niente viene mandato a nessuno.
              </span>
              <button className="btn" type="submit">Crea il testo con questa bozza</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
