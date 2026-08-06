import { euro } from "@/lib/dominio";
import { SelezionaTutti } from "./SelezionaTutti";
import {
  rimuoviProdottoDaCollezione,
  rimuoviSceltiDaCollezione,
  spostaInCollezione,
  spostaSceltiInCollezione,
} from "@/lib/azioni-vetrina-shopify";

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
 * **La fila dei prodotti di una collezione**: si spostano uno per uno con le
 * frecce, oppure **a gruppi** con le caselle e le azioni in blocco.
 *
 * Con sessanta righe spostarne dieci una alla volta vuol dire un centinaio di
 * clic: le caselle esistono per quello. La barra sta **in cima e in fondo**
 * all'elenco, così non si deve risalire per usarla.
 *
 * Sta in un componente perché la stessa fila si guarda da due posti — la scheda
 * di cura in Visual e la scheda della collezione — e con due copie le due pagine
 * finirebbero per comportarsi in modo diverso alla prima correzione.
 *
 * **Un solo `<form>` per tutto.** Le frecce e il × non sono form loro (annidare
 * form è HTML non valido): sono bottoni con la propria `formAction`. È anche
 * l'unico modo che funziona — la FormData si costruisce dal **form**, non dal
 * bottone che l'ha inviata, quindi due azioni diverse vogliono due `formAction`
 * diverse e non un `value` da leggere.
 *
 * **Niente navigazione**: tutte le azioni sono server action senza `redirect`,
 * quindi React riscrive l'elenco in posto e lo scorrimento resta dov'era.
 */
export function FilaProdotti({
  collezioneId,
  righe,
  membriAMano,
  daPosizione = 0,
  totale,
}: {
  collezioneId: string;
  righe: RigaFila[];
  /** Il × compare solo dove i membri si scelgono a mano: in una smart collection il prodotto rientrerebbe da solo. */
  membriAMano: boolean;
  /** Il numero da cui parte la numerazione mostrata, quando la fila è tagliata. */
  daPosizione?: number;
  /** Quanti sono in tutto: serve a dire fin dove può arrivare «porta alla posizione». */
  totale?: number;
}) {
  const quanti = totale ?? righe.length;
  return (
    <form>
      <BarraBlocco collezioneId={collezioneId} membriAMano={membriAMano} quanti={quanti} inElenco={righe.length} />

      <div className="vetrina-lista">
        {righe.map((vp, i) => (
          <div className="vetrina-riga" key={vp.id} id={`p-${vp.prodottoId}`}>
            <label className="vetrina-scelta" title="Scegli per le azioni in blocco">
              <input type="checkbox" name="scelti" value={vp.prodottoId} />
            </label>
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
              <button
                className="icon-btn"
                title="Sposta su"
                type="submit"
                disabled={i === 0}
                formAction={spostaInCollezione.bind(null, collezioneId, vp.prodottoId, "su")}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                title="Sposta giù"
                type="submit"
                disabled={i === righe.length - 1}
                formAction={spostaInCollezione.bind(null, collezioneId, vp.prodottoId, "giu")}
              >
                ↓
              </button>
              {membriAMano && (
                <details className="conferma-x">
                  <summary className="icon-btn" title="Togli dalla collezione (sul negozio)">×</summary>
                  <div className="conferma-x-corpo">
                    <span>Togliere «{vp.prodotto.nome}» dalla collezione sul negozio?</span>
                    <button
                      type="submit"
                      className="btn btn-secondario"
                      style={{ fontSize: 12, padding: "3px 10px" }}
                      formAction={rimuoviProdottoDaCollezione.bind(null, collezioneId, vp.prodottoId)}
                    >
                      Sì, togli
                    </button>
                  </div>
                </details>
              )}
            </span>
          </div>
        ))}
      </div>

      <BarraBlocco collezioneId={collezioneId} membriAMano={membriAMano} quanti={quanti} inElenco={righe.length} sotto />
    </form>
  );
}

/**
 * Le azioni sul gruppo scelto. **Non dice quanti sono selezionati**: contarli
 * richiederebbe JavaScript, e un numero che non si aggiorna sarebbe peggio di
 * nessun numero. Senza nessuna casella spuntata le azioni non fanno niente.
 */
function BarraBlocco({
  collezioneId,
  membriAMano,
  quanti,
  inElenco,
  sotto,
}: {
  collezioneId: string;
  membriAMano: boolean;
  /** Quanti sono in tutto: e' il massimo di «alla posizione». */
  quanti: number;
  /** Quanti sono **in questa pagina**: e' quello che «tutti» spunta davvero. */
  inElenco: number;
  sotto?: boolean;
}) {
  return (
    <div className="barra-blocco" style={sotto ? { marginTop: 12 } : { marginBottom: 12 }}>
      <SelezionaTutti quanti={inElenco} />
      <span className="page-sub" style={{ margin: 0 }}>
        poi:
      </span>
      <button type="submit" className="btn btn-secondario" formAction={spostaSceltiInCollezione.bind(null, collezioneId, "inizio")}>
        ⤒ All&apos;inizio
      </button>
      <button type="submit" className="btn btn-secondario" formAction={spostaSceltiInCollezione.bind(null, collezioneId, "fine")}>
        ⤓ Alla fine
      </button>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button
          type="submit"
          className="btn btn-secondario"
          formAction={spostaSceltiInCollezione.bind(null, collezioneId, "posizione")}
        >
          Alla posizione
        </button>
        <input
          type="number"
          name="posizione"
          min={1}
          max={Math.max(1, quanti)}
          placeholder="n"
          style={{ width: 76 }}
          aria-label="Posizione"
        />
      </span>
      {inElenco < quanti && (
        <span className="page-sub" style={{ margin: 0 }}>
          («Tutti» spunta i {inElenco} in questa pagina, non tutti i {quanti}.)
        </span>
      )}
      {membriAMano && (
        <details className="conferma-x">
          <summary className="btn btn-secondario" style={{ cursor: "pointer" }}>Togli dalla collezione</summary>
          <div className="conferma-x-corpo" style={{ maxWidth: 360, whiteSpace: "normal" }}>
            <span>
              Togliere i prodotti scelti dalla collezione <b>sul negozio</b>? Restano a catalogo e nelle altre
              collezioni.
            </span>
            <button
              type="submit"
              className="btn btn-secondario"
              style={{ fontSize: 12, padding: "3px 10px" }}
              formAction={rimuoviSceltiDaCollezione.bind(null, collezioneId)}
            >
              Sì, togli
            </button>
          </div>
        </details>
      )}
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
