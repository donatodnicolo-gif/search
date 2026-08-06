import { euro } from "@/lib/dominio";
import { rimuoviProdottoDaCollezione, spostaInCollezione } from "@/lib/azioni-vetrina-shopify";

/** Il minimo che serve per disegnare una riga della fila. */
export type RigaFila = {
  id: string;
  prodottoId: string;
  prodotto: {
    nome: string;
    codice: string;
    immagine: string | null;
    prezzoVendita: number;
    statoShopify: string | null;
  };
};

/**
 * **La fila dei prodotti di una collezione**, con le frecce per spostarli e il ×
 * per toglierli dal negozio.
 *
 * Sta in un componente perché la stessa fila si guarda da due posti — la scheda
 * di cura in Visual e la scheda della collezione — e con due copie le due
 * pagine finirebbero per comportarsi in modo diverso alla prima correzione. Le
 * azioni sono comunque le stesse: qui cambia solo dove si disegna.
 *
 * **Niente navigazione.** Frecce e conferma sono server action senza `redirect`:
 * React riscrive l'elenco in posto e lo scorrimento resta dov'era. Il × è un
 * `<details>` e non un link, perché un link ricarica la pagina e la riporta
 * altrove — problema segnalato due volte.
 */
export function FilaProdotti({
  collezioneId,
  righe,
  membriAMano,
  daPosizione = 0,
}: {
  collezioneId: string;
  righe: RigaFila[];
  /** Il × compare solo dove i membri si scelgono a mano: in una smart collection il prodotto rientrerebbe da solo. */
  membriAMano: boolean;
  /** Il numero da cui parte la numerazione mostrata, quando la fila è tagliata. */
  daPosizione?: number;
}) {
  return (
    <div className="vetrina-lista">
      {righe.map((vp, i) => (
        <div className="vetrina-riga" key={vp.id} id={`p-${vp.prodottoId}`}>
          <span className="vetrina-pos">{daPosizione + i + 1}</span>
          <span className="vetrina-mini">
            {vp.prodotto.immagine ? <img src={vp.prodotto.immagine} alt="" /> : "❀"}
          </span>
          <span className="vetrina-info">
            <a href={`/prodotti/${vp.prodottoId}`} className="cella-nome">{vp.prodotto.nome}</a>
            <div className="cella-sub">
              <StatoNegozio stato={vp.prodotto.statoShopify} />
              {" "}{vp.prodotto.codice}
              {vp.prodotto.prezzoVendita > 0 ? ` · ${euro(vp.prodotto.prezzoVendita)}` : ""}
            </div>
          </span>
          <span className="vetrina-azioni">
            <form action={spostaInCollezione.bind(null, collezioneId, vp.prodottoId, "su")}>
              <button className="icon-btn" title="Sposta su" type="submit" disabled={i === 0}>↑</button>
            </form>
            <form action={spostaInCollezione.bind(null, collezioneId, vp.prodottoId, "giu")}>
              <button className="icon-btn" title="Sposta giù" type="submit" disabled={i === righe.length - 1}>↓</button>
            </form>
            {membriAMano && (
              <details className="conferma-x">
                <summary className="icon-btn" title="Togli dalla collezione (sul negozio)">×</summary>
                <div className="conferma-x-corpo">
                  <span>Togliere «{vp.prodotto.nome}» dalla collezione sul negozio?</span>
                  <form action={rimuoviProdottoDaCollezione.bind(null, collezioneId, vp.prodottoId)}>
                    <button type="submit" className="btn btn-secondario" style={{ fontSize: 12, padding: "3px 10px" }}>
                      Sì, togli
                    </button>
                  </form>
                </div>
              </details>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Lo stato del prodotto **sul negozio**, letto a ogni import. Si scrive accanto
 * al codice perché è la prima cosa da sapere guardando una fila: un prodotto
 * archiviato in vetrina non ci va, per quanto qui risulti «in vendita».
 * `null` = non lo sappiamo (mai visto su un negozio), e si dice invece di
 * inventare «attivo».
 */
export function StatoNegozio({ stato }: { stato: string | null }) {
  const m: Record<string, { testo: string; colore: string }> = {
    ACTIVE: { testo: "Attivo", colore: "var(--green)" },
    DRAFT: { testo: "Bozza", colore: "var(--orange)" },
    ARCHIVED: { testo: "Archiviato", colore: "var(--text-tertiary)" },
  };
  const v = stato ? m[stato] : null;
  const testo = v?.testo ?? "Stato ignoto";
  const colore = v?.colore ?? "var(--text-tertiary)";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.2,
        textTransform: "uppercase",
        color: colore,
        background: `color-mix(in srgb, ${colore} 12%, transparent)`,
        padding: "1px 6px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {testo}
    </span>
  );
}
