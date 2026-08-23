"use client";

import { useRef, useState, useTransition } from "react";

// Parole da escludere scritte A MANO.
//
// ⚠️ PERCHÉ MANCAVA E PERCHÉ SERVE. Fino a oggi si poteva escludere solo
// quello che compariva già in un elenco: una ricerca fatta da qualcuno, una
// keyword esistente. Cioè si poteva reagire, non prevenire — e per una parola
// che non è ancora stata cercata («funerale», «gratis», il nome di un
// concorrente) non c'era nessun posto in cui scriverla. Su una campagna nuova,
// che è esattamente il momento in cui si sa già cosa NON si vuole comprare,
// l'unica strada era Google Ads.
//
// ⚠️ LE NEGATIVE VIVONO SULLA CAMPAGNA. Lo script le crea con
// `campagna.createNegativeKeyword`: anche aprendo questo riquadro dalla scheda
// di un gruppo, si escludono per TUTTA la campagna. È scritto a schermo, perché
// crederle limitate al gruppo porterebbe a spegnere traffico che si voleva
// tenere altrove.
export function AggiungiNegative({
  campagnaId,
  nomeCampagna,
  azione,
  ritorno,
}: {
  campagnaId: string;
  nomeCampagna: string;
  azione: (input: {
    campagnaId: string;
    parole: string[];
    corrispondenza: string;
    motivo: string;
    ritorno: string;
  }) => Promise<{ ok: true; messe: number; gia: number } | { ok: false; errore: string }>;
  ritorno: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [testo, setTesto] = useState("");
  const [corrispondenza, setCorrispondenza] = useState("exact");
  const [motivo, setMotivo] = useState("");
  const [esito, setEsito] = useState<{ ok: true; messe: number; gia: number } | { ok: false; errore: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  const parole = testo
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  return (
    <>
      <button
        type="button"
        className="btn small btn-secondario"
        onClick={() => {
          setEsito(null);
          dialogo.current?.showModal();
        }}
        title="Scrivi le parole per cui NON vuoi comparire: vanno in coda e si applicano alla campagna"
      >
        Escludi parole
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        <div className="modale-corpo">
          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Parole da escludere</div>
              <div className="modale-titolo">{nomeCampagna}</div>
              <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                Le parole per cui <b>non</b> vuoi comparire. Valgono per tutta la campagna: Google
                tiene le esclusioni lì, non sul singolo gruppo.
              </div>
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
              ✕
            </button>
          </div>

          <div className="modale-elenco" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <label className="modale-campo" style={{ marginBottom: 4 }}>
              Una parola per riga
              <textarea
                value={testo}
                onChange={(e) => setTesto(e.target.value)}
                rows={7}
                placeholder={"gratis\nfunerale\nfai da te\nnome di un concorrente"}
                style={{
                  font: "inherit",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--hairline-strong)",
                  resize: "vertical",
                  width: "100%",
                }}
              />
            </label>
            <div className="cella-sub" style={{ marginBottom: 14 }}>
              {parole.length === 0 ? "nessuna parola" : parole.length === 1 ? "1 parola" : `${parole.length} parole`}
            </div>

            <label className="modale-campo" style={{ marginBottom: 14 }}>
              Quanto stretta
              <select value={corrispondenza} onChange={(e) => setCorrispondenza(e.target.value)}>
                <option value="exact">Esatta — spegne quella ricerca e basta</option>
                <option value="phrase">Frase — spegne le ricerche che la contengono in quell&apos;ordine</option>
                <option value="broad">Generica — spegne tutte le ricerche che contengono quelle parole</option>
              </select>
              {/* ⚠️ Il valore di partenza è ESATTA, ed è la scelta prudente: una
                  negativa generica spegne anche ricerche che avremmo voluto, e
                  quello che non compare più non lascia traccia da nessuna parte.
                  Chi vuole allargare lo fa apposta. */}
              <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                Nel dubbio lascia <b>esatta</b>: una generica spegne anche ricerche buone, e il
                traffico che non arriva non si vede da nessuna parte.
              </span>
            </label>

            <label className="modale-campo">
              Perché (finisce nello storico accanto all&apos;operazione)
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="es. non vendiamo composizioni funebri"
                style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", width: "100%" }}
              />
            </label>
          </div>

          <div className="modale-avviso">
            Vanno <b>in coda</b>, da approvare in Operazioni: da qui non si scrive niente su Google.
            Sono operazioni <b>leggere</b> (L0), quindi non fanno scattare nessun blocco.{" "}
            {/* ⚠️ L'app non importa le negative già presenti su Google: dirlo è
                meglio che far credere a un controllo che non c'è. Il doppione lo
                intercetta lo script al momento di scrivere. */}
            Se una parola è già esclusa su Google, lo script se ne accorge e lo riferisce invece di
            aggiungerla due volte.
          </div>

          {esito && (
            <div className={esito.ok ? "avviso-ok" : "modale-avviso"} style={{ margin: "0 18px 10px" }}>
              {esito.ok ? (
                <>
                  {esito.messe === 0
                    ? "Nessuna parola nuova: erano già tutte in coda."
                    : `${esito.messe === 1 ? "1 parola messa" : `${esito.messe} parole messe`} in coda.`}
                  {esito.gia > 0 && ` ${esito.gia} erano già in coda e non le ho ripetute.`}{" "}
                  <a href={`/operazioni?torna=${encodeURIComponent(ritorno)}`} style={{ textDecoration: "underline" }}>
                    Vai ad approvarle
                  </a>
                </>
              ) : (
                esito.errore
              )}
            </div>
          )}

          <div className="modale-piede">
            <button type="button" className="btn small btn-secondario" onClick={() => dialogo.current?.close()}>
              Chiudi
            </button>
            <button
              type="button"
              className="btn small"
              disabled={parole.length === 0 || inCorso}
              onClick={() => {
                setEsito(null);
                avvia(async () => {
                  const r = await azione({ campagnaId, parole, corrispondenza, motivo, ritorno });
                  setEsito(r);
                  // Le caselle si svuotano solo se è andata: su un errore si
                  // riprova senza riscrivere venti parole.
                  if (r.ok) setTesto("");
                });
              }}
            >
              {inCorso ? "Metto in coda…" : "Metti in coda"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
