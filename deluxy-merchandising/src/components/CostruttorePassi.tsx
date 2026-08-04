import { REGOLE } from "@/lib/ordinamento-vetrina";
import { CAMPI, etichettaPasso, RISPOSTE, type Passo } from "@/lib/regole-ordine";
import type { VociPassi, VoceValore } from "@/lib/voci-passi";
import { aggiungiPasso, muoviPasso } from "@/lib/azioni-regole-ordine";

const NOMI_METRICHE = Object.fromEntries(REGOLE.map((r) => [r.chiave, r.nome]));

/**
 * Il costruttore di una regola: i passi in priorità e i moduli per aggiungerne.
 *
 * **Uno solo**, usato dalla pagina della regola *e* dalla scheda della
 * collezione: le condizioni si scrivono dove si sta guardando la fila, non solo
 * in una pagina a parte. Con due copie le due schermate offrirebbero condizioni
 * diverse e finirebbero per divergere alla prima modifica.
 *
 * `tornaA` è l'id della collezione da cui si sta lavorando: quando c'è, dopo
 * ogni modifica la regola viene **riapplicata a quella collezione** e si torna
 * lì. Senza, aggiungere una condizione non muoverebbe niente a schermo e
 * sembrerebbe che non abbia funzionato.
 */
export function CostruttorePassi({
  regolaId,
  passi,
  voci,
  tornaA,
}: {
  regolaId: string;
  passi: Passo[];
  voci: VociPassi;
  tornaA?: string;
}) {
  return (
    <>
      {passi.length === 0 ? (
        <div className="vuoto-mini">
          Nessun passo: la regola non ordina ancora niente. <b>Una regola vuota non è «tutti i prodotti»</b>, è una
          regola da finire.
        </div>
      ) : (
        <div className="vetrina-lista">
          {passi.map((p, i) => (
            <div className="vetrina-riga" key={i}>
              <span className="vetrina-pos">{i + 1}</span>
              <span className="vetrina-info">
                <span className="cella-nome">{etichettaPasso(p, NOMI_METRICHE)}</span>
                <div className="cella-sub">
                  {p.t === "metrica"
                    ? REGOLE.find((x) => x.chiave === p.m)?.spiega
                    : i === 0
                      ? "Decide l'ordine: chi corrisponde va in cima."
                      : "Spezza i pareggi rimasti dai passi sopra."}
                </div>
              </span>
              <span className="vetrina-azioni">
                <Muovi regolaId={regolaId} i={i} dove="su" tornaA={tornaA} disabilitato={i === 0} />
                <Muovi regolaId={regolaId} i={i} dove="giu" tornaA={tornaA} disabilitato={i === passi.length - 1} />
                <Muovi regolaId={regolaId} i={i} dove="via" tornaA={tornaA} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
        <form action={aggiungiPasso.bind(null, regolaId)} style={riga}>
          <input type="hidden" name="tipo" value="metrica" />
          {tornaA && <input type="hidden" name="tornaA" value={tornaA} />}
          <b style={etichetta}>Metrica</b>
          <select name="metrica" aria-label="Metrica">
            {REGOLE.filter((x) => x.chiave !== "manuale").map((x) => (
              <option key={x.chiave} value={x.chiave}>{x.nome}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondario">Aggiungi</button>
          <span className="page-sub" style={{ margin: 0 }}>Mette in fila tutti i prodotti.</span>
        </form>

        <Attributo regolaId={regolaId} campo="tipo" valori={voci.tipi} tornaA={tornaA} />
        <Attributo regolaId={regolaId} campo="categoria" valori={voci.categorie} tornaA={tornaA} />
        <Attributo regolaId={regolaId} campo="fornitore" valori={voci.fornitori} tornaA={tornaA} />
        <Attributo regolaId={regolaId} campo="linea" valori={voci.linee} tornaA={tornaA} />
        <Attributo regolaId={regolaId} campo="tag" valori={voci.tag} tornaA={tornaA} />
        <Attributo
          regolaId={regolaId}
          campo="risposta"
          valori={RISPOSTE.map((x) => ({ v: x.chiave, n: null, etichetta: x.nome }))}
          tornaA={tornaA}
        />

        <form action={aggiungiPasso.bind(null, regolaId)} style={riga}>
          <input type="hidden" name="tipo" value="attr" />
          <input type="hidden" name="campo" value="prezzo" />
          {tornaA && <input type="hidden" name="tornaA" value={tornaA} />}
          <b style={etichetta}>Prezzo</b>
          <input name="da" type="number" step="0.01" placeholder="da €" style={{ width: 100 }} />
          <input name="a" type="number" step="0.01" placeholder="a €" style={{ width: 100 }} />
          <button type="submit" className="btn btn-secondario">Aggiungi</button>
          <span className="page-sub" style={{ margin: 0 }}>
            Il <b>da</b> è compreso, il <b>a</b> escluso: 200 € non cade in un buco fra due passi.
          </span>
        </form>
      </div>
    </>
  );
}

const riga: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" };
const etichetta: React.CSSProperties = { minWidth: 96, paddingTop: 6 };

function Muovi({
  regolaId,
  i,
  dove,
  tornaA,
  disabilitato,
}: {
  regolaId: string;
  i: number;
  dove: "su" | "giu" | "via";
  tornaA?: string;
  disabilitato?: boolean;
}) {
  const titoli = { su: "Più importante", giu: "Meno importante", via: "Togli il passo" };
  const segni = { su: "↑", giu: "↓", via: "×" };
  return (
    <form action={muoviPasso.bind(null, regolaId, i, dove)}>
      {tornaA && <input type="hidden" name="tornaA" value={tornaA} />}
      <button className="icon-btn" title={titoli[dove]} type="submit" disabled={disabilitato}>
        {segni[dove]}
      </button>
    </form>
  );
}

/**
 * Una condizione su un attributo. I valori si scelgono da un `<select multiple>`
 * e valgono **in alternativa** dentro lo stesso passo (categoria Fiori *o*
 * Torte) — stessa convenzione dei criteri delle tipologie, non una nuova.
 */
function Attributo({
  regolaId,
  campo,
  valori,
  tornaA,
}: {
  regolaId: string;
  campo: string;
  valori: VoceValore[];
  tornaA?: string;
}) {
  const def = CAMPI.find((c) => c.chiave === campo);
  return (
    <form action={aggiungiPasso.bind(null, regolaId)} style={riga}>
      <input type="hidden" name="tipo" value="attr" />
      <input type="hidden" name="campo" value={campo} />
      {tornaA && <input type="hidden" name="tornaA" value={tornaA} />}
      <b style={etichetta}>{def?.nome ?? campo}</b>
      {valori.length === 0 ? (
        <span className="page-sub" style={{ margin: 0, paddingTop: 6 }}>
          Nessun valore nei dati: questa condizione non avrebbe niente da portare in cima.
        </span>
      ) : (
        <>
          <select name="valori" multiple size={Math.min(6, valori.length)} style={{ minWidth: 280 }} aria-label={def?.nome}>
            {valori.map((x) => (
              <option key={x.v} value={x.v}>
                {x.etichetta ?? x.v}
                {x.n != null ? ` (${x.n})` : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondario" style={{ marginTop: 2 }}>Aggiungi</button>
          <span className="page-sub" style={{ margin: 0, paddingTop: 6, maxWidth: 300 }}>{def?.spiega}</span>
        </>
      )}
    </form>
  );
}
