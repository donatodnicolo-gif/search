"use client";

import { useRef, useState, useTransition } from "react";

// Dove esce la campagna: si aggiungono e si tolgono località.
//
// ⚠️ PERCHÉ NON BASTAVA LEGGERLE. L'app mostrava le località da settimane —
// «Milan (City)» — e per cambiarle si andava in Google Ads. Ma dove esce un
// annuncio è una delle poche cose che cambiano davvero la spesa, ed è la più
// facile da dimenticare: una campagna nata per Milano che deve coprire l'Italia
// resta su Milano finché qualcuno non se ne accorge dai numeri.
//
// ⚠️ TOGLIERE NON È AGGIUNGERE AL CONTRARIO. Se si tolgono tutte le località,
// la campagna resta senza targeting geografico e Google la fa uscire OVUNQUE —
// l'opposto di quello che uno crede di aver chiesto. Lo dice il dialogo, e lo
// script rifiuta comunque l'ultima rimozione.
export function CambiaLocalita({
  campagnaId,
  nomeCampagna,
  attuali,
  azione,
  ritorno,
}: {
  campagnaId: string;
  nomeCampagna: string;
  /** Quelle mirate adesso, come le ha lette lo script. */
  attuali: { idEsterno: string; nome: string; tipo: string | null }[];
  azione: (input: {
    campagnaId: string;
    aggiungi: string[];
    togli: string[];
    motivo: string;
    ritorno: string;
  }) => Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }>;
  ritorno: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [testo, setTesto] = useState("");
  const [togli, setTogli] = useState<string[]>([]);
  const [motivo, setMotivo] = useState("");
  const [esito, setEsito] = useState<{ ok: true; messaggio: string } | { ok: false; errore: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  const aggiungi = testo
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  const restanti = attuali.length + aggiungi.length - togli.length;
  const svuoterebbe = attuali.length > 0 && restanti <= 0;

  return (
    <>
      <button
        type="button"
        className="btn small btn-secondario"
        onClick={() => {
          setEsito(null);
          dialogo.current?.showModal();
        }}
        title="Aggiungi o togli le località in cui esce questa campagna"
      >
        Cambia località
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
              <div className="modale-occhiello">Dove esce la campagna</div>
              <div className="modale-titolo">{nomeCampagna}</div>
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
              ✕
            </button>
          </div>

          <div className="modale-elenco" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="brief-sotto" style={{ marginBottom: 8 }}>
              Adesso esce su ({attuali.length})
            </div>
            {attuali.length === 0 ? (
              <div className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
                Nessuna località letta. ⚠️ Una campagna senza targeting geografico esce{" "}
                <b>ovunque</b>: se non è voluto, aggiungine una qui sotto.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {attuali.map((l) => {
                  const scelta = togli.includes(l.idEsterno);
                  return (
                    <label
                      key={l.idEsterno}
                      className="pill-opt"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        opacity: scelta ? 0.5 : 1,
                        textDecoration: scelta ? "line-through" : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={scelta}
                        onChange={(e) =>
                          setTogli((v) => (e.target.checked ? [...v, l.idEsterno] : v.filter((x) => x !== l.idEsterno)))
                        }
                      />
                      {l.nome}
                      {l.tipo && <span className="cella-sub">{l.tipo}</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <label className="modale-campo" style={{ marginBottom: 4 }}>
              Aggiungi — una per riga (nome o id di Google)
              <textarea
                value={testo}
                onChange={(e) => setTesto(e.target.value)}
                rows={4}
                placeholder={"Italy\nRome\n2380"}
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
            {/* ⚠️ I nomi li risolve GOOGLE, non una tabella nostra: e quando un
                nome dà più risultati («Como» città e provincia, «Valencia» in
                Spagna e in Venezuela) lo script NON sceglie — li elenca
                nell'esito e non tocca niente. */}
            <div className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
              I nomi li cerca Google, in inglese o in italiano. Se un nome dà più risultati — «Como»
              è una città e una provincia — lo script <b>non sceglie</b>: te li elenca nell&apos;esito
              e non cambia niente, così puoi incollare l&apos;id giusto.
            </div>

            <label className="modale-campo">
              Perché (finisce nello storico)
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="es. estendiamo a tutta l'Italia per il periodo natalizio"
                style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", width: "100%" }}
              />
            </label>
          </div>

          <div className="modale-avviso">
            {svuoterebbe ? (
              <>
                ⚠️ Così <b>togli tutte le località</b>: la campagna resterebbe senza targeting
                geografico, e Google la farebbe uscire <b>ovunque</b>. Aggiungi prima dove deve
                uscire. Lo script si rifiuterebbe comunque di eseguirla.
              </>
            ) : (
              <>
                Va <b>in coda</b>, da approvare in Operazioni: da qui non si scrive niente su
                Google. È un&apos;operazione <b>L2</b> — cambiare dove esce un annuncio sposta la
                spesa.
              </>
            )}
          </div>

          {esito && (
            <div className={esito.ok ? "avviso-ok" : "modale-avviso"} style={{ margin: "0 18px 10px" }}>
              {esito.ok ? (
                <>
                  {esito.messaggio}{" "}
                  <a href={`/operazioni?torna=${encodeURIComponent(ritorno)}`} style={{ textDecoration: "underline" }}>
                    Vai ad approvarla
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
              disabled={inCorso || svuoterebbe || (aggiungi.length === 0 && togli.length === 0)}
              onClick={() => {
                setEsito(null);
                avvia(async () => {
                  const r = await azione({ campagnaId, aggiungi, togli, motivo, ritorno });
                  setEsito(r);
                  if (r.ok) {
                    setTesto("");
                    setTogli([]);
                  }
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
