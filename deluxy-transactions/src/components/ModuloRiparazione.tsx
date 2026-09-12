"use client";

import { useActionState, useState } from "react";
import { chiudiInBlocco } from "@/app/actions";
import { leggiPiano } from "@/lib/piano-chiusura";
import { METODI_FUORI } from "@/lib/metodi-fuori";

// Chiudere in blocco richieste già pagate altrove.
//
// Il pezzo che conta non è il bottone: è l'ANTEPRIMA. Qui si chiudono decine di
// pratiche di pagamento in un colpo, e una chiusura non si riapre — si rifà. Il
// piano si legge mentre lo si incolla, riga per riga, con gli errori segnati
// prima di toccare qualsiasi cosa; e il bottone che esegue davvero compare solo
// quando non ci sono righe rotte.
export function ModuloRiparazione({ esempio }: { esempio: string }) {
  const [stato, azione, inCorso] = useActionState(chiudiInBlocco, {} as { errore?: string; ok?: string; esiti?: string[] });
  const [testo, setTesto] = useState("");

  const righe = leggiPiano(testo);
  const rotte = righe.filter((r) => r.errore);
  const pronte = righe.length > 0 && rotte.length === 0;

  return (
    <div className="scheda">
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}
      {stato?.esiti && stato.esiti.length > 0 && (
        <div className="tabella-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Esito riga per riga</th>
              </tr>
            </thead>
            <tbody>
              {stato.esiti.map((e) => (
                <tr key={e}>
                  <td className={e.endsWith("chiusa") ? "" : "cella-muta"}>{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={azione}>
        <div className="campo-modulo">
          <label htmlFor="piano">Una riga per richiesta: riferimento, data del pagamento (facoltativa), motivo</label>
          <textarea
            id="piano"
            name="piano"
            rows={10}
            spellCheck={false}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder={esempio}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13, width: "100%" }}
          />
          <p className="testo-guida">
            Senza data, la richiesta risulta pagata senza che ne resti registrato il giorno: meglio così che inventarlo.
            Le righe vuote e quelle che cominciano con <code>#</code> si saltano.
          </p>
        </div>

        <div className="firma-riga">
          <div className="campo-modulo" style={{ flex: "1 1 280px" }}>
            <label htmlFor="metodo">Come sono state pagate</label>
            <select id="metodo" name="metodo" defaultValue="altro">
              {Object.entries(METODI_FUORI).map(([valore, etichetta]) => (
                <option key={valore} value={valore}>
                  {etichetta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {righe.length > 0 && (
          <div className="tabella-wrap" style={{ margin: "14px 0" }}>
            <table>
              <thead>
                <tr>
                  <th>Riferimento</th>
                  <th>Data</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={`${r.riferimento}-${i}`}>
                    <td className="cella-nome">{r.riferimento}</td>
                    <td className="cella-muta">{r.dataPagamento || "non registrata"}</td>
                    <td className={r.errore ? "" : "cella-muta"}>
                      {r.errore ? <strong>⚠️ {r.errore}</strong> : r.motivo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="firma-nota">
          {righe.length === 0
            ? "Incolla il piano: l'anteprima compare qui sotto e non viene toccato niente finché non lo chiedi."
            : rotte.length > 0
              ? `${rotte.length} righe su ${righe.length} non vanno bene: correggile, poi si potrà eseguire.`
              : `${righe.length} richieste verranno segnate come già pagate fuori da questa app. Non fa uscire denaro: registra denaro già uscito, e ogni riga resta nel registro col tuo nome. Una richiesta chiusa non si riapre, si rifà.`}
        </p>

        <div className="azioni-modulo">
          <button className="btn btn-secondario" type="submit" name="conferma" value="prova" disabled={inCorso || righe.length === 0}>
            {inCorso ? "…" : "Controlla"}
          </button>
          <button
            className="btn"
            type="submit"
            name="conferma"
            value="esegui"
            disabled={inCorso || !pronte}
            onClick={(e) => {
              if (!confirm(`Confermi la chiusura di ${righe.length} richieste? Non si riaprono: si rifanno.`)) e.preventDefault();
            }}
          >
            {inCorso ? "Chiudo…" : `Chiudi davvero (${righe.length})`}
          </button>
        </div>
      </form>
    </div>
  );
}
