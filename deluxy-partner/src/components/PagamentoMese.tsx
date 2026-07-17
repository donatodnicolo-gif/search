import { euro, dataIt } from "@/lib/format";
import { registraPagamentoMese, azzeraPagamentoMese, salvaNoteMese } from "@/lib/actions";

// Barra di registrazione pagamento del mese, dentro la scheda partner.
// Due direzioni esplicite, ciascuna col proprio importo precompilato:
// "Abbiamo pagato" (bonifico inviato al partner, precompilato col da bonificare)
// e "Hanno pagato" (incasso ricevuto, precompilato col da incassare).
// Sotto, un campo note del mese che viene incluso nel prompt del recap AI.
export function PagamentoMese({
  partnerId,
  anno,
  mese,
  daBonificare,
  daIncassare,
  bonificoImporto,
  bonificoData,
  note,
}: {
  partnerId: string;
  anno: number;
  mese: number;
  daBonificare: number;
  daIncassare: number;
  bonificoImporto: number | null;
  bonificoData: Date | null;
  note: string | null;
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const inviato = registraPagamentoMese.bind(null, partnerId, anno, mese, "inviato");
  const ricevuto = registraPagamentoMese.bind(null, partnerId, anno, mese, "ricevuto");
  const azzera = azzeraPagamentoMese.bind(null, partnerId, anno, mese);
  const salvaNote = salvaNoteMese.bind(null, partnerId, anno, mese);
  const val = (v: number) => (v >= 0.01 ? +v.toFixed(2) : "");

  const campo = (id: string, valore: number | string) => (
    <>
      <div>
        <label className="field-label" htmlFor={`imp-${id}`}>Importo €</label>
        <input
          id={`imp-${id}`}
          type="number"
          name="importo"
          step="0.01"
          min="0"
          defaultValue={valore}
          placeholder="0,00"
          style={{ width: 120, padding: "6px 10px", fontSize: 13 }}
        />
      </div>
      <div>
        <label className="field-label" htmlFor={`data-${id}`}>Data</label>
        <input
          id={`data-${id}`}
          type="date"
          name="data"
          defaultValue={oggi}
          style={{ width: 145, padding: "6px 10px", fontSize: 13 }}
        />
      </div>
    </>
  );

  return (
    <div style={{ borderTop: "1px solid var(--hairline)", background: "var(--bg)" }}>
      <div
        style={{
          display: "flex",
          gap: 20,
          alignItems: "flex-end",
          flexWrap: "wrap",
          padding: "14px 18px",
        }}
      >
        <form action={inviato} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          {campo(`inv-${mese}`, val(daBonificare))}
          <button className="btn small primary" type="submit" title="Registra un bonifico inviato da Deluxy al partner">
            Abbiamo pagato
          </button>
        </form>

        <form action={ricevuto} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          {campo(`ric-${mese}`, val(daIncassare))}
          <button className="btn small secondary" type="submit" title="Registra un pagamento ricevuto dal partner">
            Hanno pagato
          </button>
        </form>

        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {bonificoImporto != null && Math.abs(bonificoImporto) >= 0.005 ? (
            <>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Registrato: {bonificoImporto > 0 ? "pagato al partner" : "incassato dal partner"}{" "}
                {euro(Math.abs(bonificoImporto))}
                {bonificoData ? ` il ${dataIt(bonificoData)}` : ""}
              </span>
              <form action={azzera}>
                <button className="btn small danger" type="submit" title="Annulla i pagamenti registrati per questo mese">
                  Annulla
                </button>
              </form>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12.5 }}>Nessun pagamento registrato per il mese</span>
          )}
        </span>
      </div>

      <form
        action={salvaNote}
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          padding: "0 18px 14px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <label className="field-label" htmlFor={`note-${mese}`}>
            Nota del mese <span className="muted" style={{ fontWeight: 400 }}>(inclusa nel recap AI)</span>
          </label>
          <textarea
            id={`note-${mese}`}
            name="note"
            rows={2}
            defaultValue={note ?? ""}
            placeholder="Es. rateizzazione concordata, ordine contestato, sconto una tantum…"
            style={{ width: "100%", fontSize: 13, padding: "8px 10px", resize: "vertical" }}
          />
        </div>
        <button className="btn small secondary" type="submit">Salva nota</button>
      </form>
    </div>
  );
}
