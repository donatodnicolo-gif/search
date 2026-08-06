import { salvaCampoNegozio } from "@/lib/azioni-campi-negozio";
import type { CampoNegozio as Campo, TipoScheda } from "@/lib/campi-negozio";

/**
 * Un campo **del negozio** con la matita per correggerlo.
 *
 * Chiuso mostra il valore; aperto (la matita mette `?modifica=<chiave>`
 * nell'indirizzo) mostra la casella. Nessun JavaScript: è una pagina che si
 * ricarica, come tutto il resto dell'app.
 *
 * Salvando si scrive **su Shopify** e poi qui. È detto sul pulsante — «Salva sul
 * negozio» e non «Salva» — perché è una differenza che l'utente deve vedere
 * prima di premere, non scoprire dopo.
 */
export function CampoNegozioModificabile({
  tipo,
  id,
  campo,
  valore,
  percorso,
  aperto,
  puoScrivere,
}: {
  tipo: TipoScheda;
  id: string;
  campo: Campo;
  valore: string | null;
  /** L'indirizzo di questa pagina: la matita ci aggiunge `?modifica=`. */
  percorso: string;
  aperto: boolean;
  /** Senza un token con write_products non si scrive: la matita non compare. */
  puoScrivere: boolean;
}) {
  const sep = percorso.includes("?") ? "&" : "?";

  if (!aperto) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div className="cella-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {campo.etichetta}
          {puoScrivere && (
            <a
              href={`${percorso}${sep}modifica=${campo.chiave}`}
              title={`Correggi «${campo.etichetta}» sul negozio`}
              style={{ textDecoration: "none", fontSize: 12, opacity: 0.75 }}
            >
              ✎
            </a>
          )}
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {valore ? valore : <span className="cella-muta">—</span>}
        </div>
      </div>
    );
  }

  return (
    <form
      action={salvaCampoNegozio.bind(null, tipo, id, campo.chiave)}
      style={{ marginBottom: 14, display: "grid", gap: 8, maxWidth: 640 }}
    >
      <div className="cella-sub">{campo.etichetta}</div>
      {campo.multiriga ? (
        <textarea name="valore" defaultValue={valore ?? ""} rows={6} />
      ) : (
        <input name="valore" defaultValue={valore ?? ""} />
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primario">Salva sul negozio</button>
        <a className="btn btn-secondario" href={percorso}>Annulla</a>
        <span className="page-sub" style={{ margin: 0 }}>
          Scrive <b>su Shopify</b>: se il negozio rifiuta, qui non cambia niente.
          {campo.aiuto ? ` ${campo.aiuto}` : ""}
        </span>
      </div>
    </form>
  );
}
