import type { Gruppo } from "@/lib/gruppi";
import { euro } from "@/lib/dominio";

// La tabella di un catalogo visto per insieme (fornitore, categoria, linea).
// La usano /anagrafica raggruppata, /fornitori e /categorie: una sola tabella,
// così le tre pagine non finiscono a mostrare colonne diverse per lo stesso
// conto. Ogni riga è cliccabile e porta ai **suoi** prodotti in anagrafica.
export function TabellaGruppi({
  gruppi,
  titoloColonna,
  ordina,
  linkOrdine,
  linkGruppo,
}: {
  gruppi: Gruppo[];
  titoloColonna: string;
  ordina: string;
  linkOrdine: (chiave: string) => string;
  linkGruppo: (g: Gruppo) => string;
}) {
  const ricavoTotale = gruppi.reduce((s, g) => s + g.ricavo, 0);
  const freccia = (chiave: string) => (ordina === chiave ? " ↓" : "");

  return (
    <div className="tabella-wrap">
      <table>
        <thead>
          <tr>
            <th>
              <a href={linkOrdine("nome")}>
                {titoloColonna}
                {freccia("nome")}
              </a>
            </th>
            <th className="num">
              <a href={linkOrdine("prodotti")}>Prodotti{freccia("prodotti")}</a>
            </th>
            <th className="num">Senza costo</th>
            <th className="num">Esclusi</th>
            <th className="num">
              <a href={linkOrdine("quantita")}>Pezzi 90gg{freccia("quantita")}</a>
            </th>
            <th className="num">
              <a href={linkOrdine("venduto")}>Venduto 90gg{freccia("venduto")}</a>
            </th>
            <th className="num">Quota</th>
          </tr>
        </thead>
        <tbody>
          {gruppi.map((g) => (
            <tr key={g.chiave} className="riga-cliccabile">
              <td>
                <a href={linkGruppo(g)} className="cella-nome link-riga">
                  {g.etichetta}
                </a>
                {g.sotto && <div className="cella-sub">{g.sotto}</div>}
              </td>
              <td className="num">{g.prodotti}</td>
              <td className="num" style={{ color: g.senzaCosto > 0 ? "var(--orange)" : undefined }}>
                {g.senzaCosto || "—"}
              </td>
              <td className="num cella-muta">{g.esclusi || "—"}</td>
              <td className="num">{g.quantita || "—"}</td>
              <td className="num">{g.ricavo > 0 ? euro(g.ricavo) : "—"}</td>
              <td className="num cella-muta">
                {ricavoTotale > 0 && g.ricavo > 0 ? `${((g.ricavo / ricavoTotale) * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
