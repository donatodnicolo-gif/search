import { copiaSeoDalNegozio, salvaSeoCollezione, salvaSeoProdotto, spingiSeoSuShopify } from "@/lib/azioni-seo";

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
  sincronia,
  percorso,
  conferma,
}: {
  tipo: "prodotto" | "collezione";
  id: string;
  daNegozio: { titolo: string | null; descrizione: string | null };
  nostro: { titolo: string | null; descrizione: string | null };
  sincronia: { modificatoIl: Date | null; spintoIl: Date | null };
  /** L'indirizzo di questa pagina: serve al passaggio di conferma, che sta nella query. */
  percorso: string;
  conferma?: boolean;
}) {
  const salva = tipo === "prodotto" ? salvaSeoProdotto : salvaSeoCollezione;
  const vuotoNostro = !nostro.titolo && !nostro.descrizione;
  const cSulNegozio = !daNegozio.titolo && !daNegozio.descrizione;
  const daMandare =
    !vuotoNostro && sincronia.modificatoIl != null && (sincronia.spintoIl == null || sincronia.modificatoIl > sincronia.spintoIl);
  const sep = percorso.includes("?") ? "&" : "?";

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
      {/* **Mandarlo al negozio cambia quello che il cliente legge su Google**,
          quindi si conferma prima: il bottone porta a uno stato di conferma
          nella query, non esegue. Stessa idea del × che toglie un prodotto. */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--hairline, rgba(0,0,0,.08))", paddingTop: 14 }}>
        {vuotoNostro ? (
          <p className="page-sub" style={{ margin: 0 }}>
            Quando avrai scritto il tuo testo potrai <b>mandarlo al negozio</b> da qui.
          </p>
        ) : conferma ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <form action={spingiSeoSuShopify.bind(null, tipo, id)}>
              <button type="submit" className="btn btn-primario">Sì, manda al negozio</button>
            </form>
            <a className="btn btn-secondario" href={percorso}>Annulla</a>
            <span className="page-sub" style={{ margin: 0 }}>
              Sovrascrive il SEO che il negozio ha adesso. Si può rifare quando vuoi.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a className="btn btn-secondario" href={`${percorso}${sep}seoConferma=1`}>Manda al negozio</a>
            <span className="page-sub" style={{ margin: 0 }}>
              {daMandare ? (
                <b>Il negozio ha ancora la versione precedente.</b>
              ) : sincronia.spintoIl ? (
                <>Già mandato il {sincronia.spintoIl.toLocaleDateString("it-IT")}.</>
              ) : (
                <>Non è ancora stato mandato.</>
              )}{" "}
              Un import <b>non</b> lo manda da solo: succede solo premendo qui.
            </span>
          </div>
        )}
      </div>
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
