import { copiaSeoDalNegozio, salvaSeoCollezione, salvaSeoProdotto } from "@/lib/azioni-seo";

// Le lunghezze oltre le quali Google taglia il testo nei risultati. Non sono
// limiti: sono un avviso, perché scrivere più lungo non è un errore — è solo
// una parte che il cliente non leggerà.
const LIMITE_TITOLO = 60;
const LIMITE_DESCRIZIONE = 160;

/**
 * Il SEO di un prodotto o di una collezione, in **due colonne affiancate**:
 * a sinistra quello che dice il negozio oggi, a destra il nostro.
 *
 * Sono separati perché un import riscrive il primo e non deve mai toccare il
 * secondo. Affiancarli serve a correggere avendo davanti il testo di partenza:
 * un campo vuoto senza il testo del negozio accanto vorrebbe dire riscrivere a
 * memoria.
 */
export function RiquadroSeo({
  tipo,
  id,
  daNegozio,
  nostro,
}: {
  tipo: "prodotto" | "collezione";
  id: string;
  daNegozio: { titolo: string | null; descrizione: string | null };
  nostro: { titolo: string | null; descrizione: string | null };
}) {
  const salva = tipo === "prodotto" ? salvaSeoProdotto : salvaSeoCollezione;
  const vuotoNostro = !nostro.titolo && !nostro.descrizione;
  const cSulNegozio = !daNegozio.titolo && !daNegozio.descrizione;

  return (
    <div className="scheda">
      <div className="scheda-titolo">SEO — titolo e descrizione</div>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr 1fr", alignItems: "start" }} className="seo-griglia">
        <div>
          <div className="cella-sub" style={{ marginBottom: 6, fontWeight: 600 }}>Sul negozio adesso</div>
          {cSulNegozio ? (
            <p className="page-sub" style={{ marginTop: 0 }}>
              Il negozio non ha né titolo né descrizione SEO: Shopify userà il nome e la descrizione del{" "}
              {tipo === "prodotto" ? "prodotto" : "la collezione"}.
            </p>
          ) : (
            <>
              <Testo etichetta="Titolo" valore={daNegozio.titolo} limite={LIMITE_TITOLO} />
              <Testo etichetta="Descrizione" valore={daNegozio.descrizione} limite={LIMITE_DESCRIZIONE} />
            </>
          )}
          <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Letto a ogni import: <b>si sovrascrive da solo</b>, non si corregge qui.
          </p>
        </div>

        <div>
          <div className="cella-sub" style={{ marginBottom: 6, fontWeight: 600 }}>Il nostro, da migliorare</div>
          <form action={salva.bind(null, id)} style={{ display: "grid", gap: 8 }}>
            <input
              name="seoTitolo"
              defaultValue={nostro.titolo ?? ""}
              placeholder={`Titolo (consigliati max ${LIMITE_TITOLO} caratteri)`}
              maxLength={200}
            />
            <textarea
              name="seoDescrizione"
              defaultValue={nostro.descrizione ?? ""}
              placeholder={`Descrizione (consigliati max ${LIMITE_DESCRIZIONE} caratteri)`}
              rows={4}
              maxLength={600}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primario">Salva</button>
            </div>
          </form>
          {vuotoNostro && !cSulNegozio && (
            <form action={copiaSeoDalNegozio.bind(null, tipo, id)} style={{ marginTop: 8 }}>
              <button type="submit" className="btn btn-secondario">Parti dal testo del negozio</button>
            </form>
          )}
          {!vuotoNostro && (
            <p className="page-sub" style={{ marginTop: 8, marginBottom: 0 }}>
              Titolo {lung(nostro.titolo)}/{LIMITE_TITOLO} · descrizione {lung(nostro.descrizione)}/{LIMITE_DESCRIZIONE}
              {(lung(nostro.titolo) > LIMITE_TITOLO || lung(nostro.descrizione) > LIMITE_DESCRIZIONE) && (
                <> — oltre il limite Google taglia, non è un errore ma quella parte non si legge.</>
              )}
            </p>
          )}
        </div>
      </div>
      <p className="page-sub" style={{ marginTop: 14, marginBottom: 0 }}>
        Il testo che scrivi qui <b>non viene ancora mandato a Shopify</b>: per ora è il nostro, e un import non lo tocca.
      </p>
    </div>
  );
}

const lung = (s: string | null) => (s ?? "").length;

function Testo({ etichetta, valore, limite }: { etichetta: string; valore: string | null; limite: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="cella-sub">{etichetta}</div>
      {valore ? (
        <>
          <div style={{ fontSize: 14 }}>{valore}</div>
          <div className="cella-sub">
            {valore.length}/{limite}
            {valore.length > limite ? " · oltre il limite, Google taglia" : ""}
          </div>
        </>
      ) : (
        <div className="cella-muta">—</div>
      )}
    </div>
  );
}
