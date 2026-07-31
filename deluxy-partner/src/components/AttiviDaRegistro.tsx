import { attiviDaImportare } from "@/lib/importa-registro";
import { importaAttiviOra } from "@/lib/importa-actions";
import { BottoneInvio } from "./BottoneInvio";

// «Nel registro ci sono N partner attivi che qui non ci sono».
//
// L'import gira da solo ogni notte (cron `/api/cron/anagrafiche`), ma chi
// attiva un'anagrafica alle dieci di mattina non deve aspettare la notte per
// registrarci una vendita: da qui si porta dentro subito.
//
// Non compare nulla quando non c'è niente da fare: un riquadro fisso che dice
// «0 da importare» è solo rumore in cima all'elenco.
export async function AttiviDaRegistro() {
  const mancanti = await attiviDaImportare();
  if (mancanti.length === 0) return null;

  const nomi = mancanti.slice(0, 6).map((a) => a.nome).join(", ");
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge blue">
          <span className="dot" />
          {mancanti.length} {mancanti.length === 1 ? "partner attivo" : "partner attivi"} in Anagrafiche non {mancanti.length === 1 ? "è" : "sono"} qui
        </span>
        <form action={importaAttiviOra} style={{ display: "inline" }}>
          <BottoneInvio className="btn small primary" inCorso="Importo…">
            Portali in Finance
          </BottoneInvio>
        </form>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
        {nomi}
        {mancanti.length > 6 ? ` e altri ${mancanti.length - 6}` : ""}. Entrano da soli ogni notte:
        questo bottone serve solo a non aspettare. Vengono create le schede con nome, categoria,
        città e dati bancari del registro — fee e condizioni di pagamento restano da scrivere,
        perché sono patti commerciali, non dati anagrafici.
      </p>
    </div>
  );
}
