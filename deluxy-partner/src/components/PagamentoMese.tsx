import { euro, dataIt } from "@/lib/format";
import { registraPagamentoMese, azzeraPagamentoMese, salvaNoteMese } from "@/lib/actions";

// Footer del blocco mese nella scheda partner.
// Mostra SOLO ciò che serve: un riquadro "Da pagare al partner" se c'è un
// dovuto aperto, un riquadro "Da incassare" se ci sono fatture aperte, una riga
// verde se il mese è pareggiato. Sotto, la nota del mese (compatta, espandibile),
// che viene inclusa nel prompt del recap AI.
export function PagamentoMese({
  partnerId,
  anno,
  mese,
  daBonificare,
  daIncassare,
  bonificoImporto,
  bonificoData,
  note,
  noteAggiornateIl,
}: {
  partnerId: string;
  anno: number;
  mese: number;
  daBonificare: number;
  daIncassare: number;
  bonificoImporto: number | null;
  bonificoData: Date | null;
  note: string | null;
  noteAggiornateIl?: Date | null;
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const inviato = registraPagamentoMese.bind(null, partnerId, anno, mese, "inviato");
  const ricevuto = registraPagamentoMese.bind(null, partnerId, anno, mese, "ricevuto");
  const azzera = azzeraPagamentoMese.bind(null, partnerId, anno, mese);
  const salvaNote = salvaNoteMese.bind(null, partnerId, anno, mese);

  const pareggiato = daBonificare < 0.01 && daIncassare < 0.01;
  const registrato = bonificoImporto != null && Math.abs(bonificoImporto) >= 0.005;
  const notaTrim = note?.trim() || null;
  // una nota vecchia di oltre 90 giorni parla di una situazione che nel frattempo
  // può essersi risolta: si apre già espansa e il recap AI la mette in verifica
  const vecchia =
    !!noteAggiornateIl && Date.now() - new Date(noteAggiornateIl).getTime() > 90 * 86400000;

  return (
    <div className="month-footer">
      <div className="pay-row">
        {daBonificare >= 0.01 && (
          <form action={inviato} className="pay-group">
            <span className="pay-title" style={{ color: "var(--orange)" }}>
              Da pagare al partner
            </span>
            <input
              type="number"
              name="importo"
              step="0.01"
              min="0"
              defaultValue={+daBonificare.toFixed(2)}
              aria-label="Importo da pagare"
            />
            <input type="date" name="data" defaultValue={oggi} aria-label="Data pagamento" />
            <button className="btn small primary" type="submit" title="Registra il bonifico inviato al partner">
              Abbiamo pagato
            </button>
          </form>
        )}

        {daIncassare >= 0.01 && (
          <form action={ricevuto} className="pay-group">
            <span className="pay-title" style={{ color: "var(--orange)" }}>
              Da incassare dal partner
            </span>
            <input
              type="number"
              name="importo"
              step="0.01"
              min="0"
              defaultValue={+daIncassare.toFixed(2)}
              aria-label="Importo da incassare"
            />
            <input type="date" name="data" defaultValue={oggi} aria-label="Data incasso" />
            <button className="btn small secondary" type="submit" title="Registra il pagamento ricevuto dal partner">
              Hanno pagato
            </button>
          </form>
        )}

        {pareggiato && (
          <span className="badge green"><span className="dot" />Mese pareggiato — niente da registrare</span>
        )}

        {registrato && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {bonificoImporto! > 0 ? "Pagato al partner" : "Incassato dal partner"}{" "}
              {euro(Math.abs(bonificoImporto!))}
              {bonificoData ? ` il ${dataIt(bonificoData)}` : ""}
            </span>
            <form action={azzera}>
              <button
                className="btn small danger"
                type="submit"
                title="Annulla i pagamenti registrati per questo mese"
              >
                Annulla
              </button>
            </form>
          </span>
        )}
      </div>

      <details className="note-details" open={!!notaTrim && vecchia}>
        <summary>
          <span aria-hidden>{notaTrim ? "★" : "✎"}</span>
          {notaTrim ? (
            <>
              Nota: <span className="note-testo">{notaTrim}</span>
              {noteAggiornateIl && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {" "}· scritta il {dataIt(noteAggiornateIl)}
                  {vecchia && " — l'AI la verificherà"}
                </span>
              )}
              <span className="note-azione">modifica</span>
            </>
          ) : (
            <>
              Aggiungi una nota del mese <span className="muted">(inclusa nel recap AI, che ne verifica l&apos;attualità)</span>
            </>
          )}
        </summary>
        <form action={salvaNote} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
          <textarea
            name="note"
            rows={2}
            defaultValue={notaTrim ?? ""}
            placeholder="Es. rateizzazione concordata, ordine contestato, sconto una tantum…"
            style={{ flex: "1 1 320px", fontSize: 13, padding: "8px 10px", resize: "vertical" }}
          />
          <button className="btn small secondary" type="submit">Salva nota</button>
        </form>
      </details>
    </div>
  );
}
