import { euro, dataIt } from "@/lib/format";
import { registraPagamentoMese, azzeraPagamentoMese } from "@/lib/actions";

// Barra di registrazione pagamento del mese, dentro la scheda partner.
// Due direzioni esplicite: "Abbiamo pagato" (bonifico inviato al partner) e
// "Hanno pagato" (incasso ricevuto dal partner). L'importo è precompilato con
// il residuo del mese, la data con oggi.
export function PagamentoMese({
  partnerId,
  anno,
  mese,
  residuo,
  bonificoImporto,
  bonificoData,
}: {
  partnerId: string;
  anno: number;
  mese: number;
  residuo: number;
  bonificoImporto: number | null;
  bonificoData: Date | null;
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const daRegistrare = Math.abs(residuo) >= 0.01 ? +Math.abs(residuo).toFixed(2) : "";
  const inviato = registraPagamentoMese.bind(null, partnerId, anno, mese, "inviato");
  const ricevuto = registraPagamentoMese.bind(null, partnerId, anno, mese, "ricevuto");
  const azzera = azzeraPagamentoMese.bind(null, partnerId, anno, mese);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-end",
        flexWrap: "wrap",
        padding: "14px 18px",
        borderTop: "1px solid var(--hairline)",
        background: "var(--bg)",
      }}
    >
      <form style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <input type="hidden" name="partnerId" value={partnerId} />
        <div>
          <label className="field-label" htmlFor={`imp-${mese}`}>Importo €</label>
          <input
            id={`imp-${mese}`}
            type="number"
            name="importo"
            step="0.01"
            min="0"
            defaultValue={daRegistrare}
            placeholder="0,00"
            style={{ width: 130, padding: "6px 10px", fontSize: 13 }}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`data-${mese}`}>Data</label>
          <input
            id={`data-${mese}`}
            type="date"
            name="data"
            defaultValue={oggi}
            style={{ width: 150, padding: "6px 10px", fontSize: 13 }}
          />
        </div>
        <button
          className="btn small primary"
          formAction={inviato}
          title="Registra un bonifico inviato da Deluxy al partner"
        >
          Abbiamo pagato
        </button>
        <button
          className="btn small secondary"
          formAction={ricevuto}
          title="Registra un pagamento ricevuto dal partner"
        >
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
  );
}
