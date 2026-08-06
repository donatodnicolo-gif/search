import { REGOLE } from "@/lib/ordinamento-vetrina";
import { CAMPI, etichettaPasso, RISPOSTE, type Passo } from "@/lib/regole-ordine";
import type { VociPassi, VoceValore } from "@/lib/voci-passi";
import { aggiungiPassiInBlocco, muoviPasso } from "@/lib/azioni-regole-ordine";

const NOMI_METRICHE = Object.fromEntries(REGOLE.map((r) => [r.chiave, r.nome]));

/**
 * Il costruttore di una regola: i passi già scelti, in priorità, e **una griglia
 * sola** per aggiungerne.
 *
 * Prima ogni attributo era un form a sé con il suo pulsante: per dire «prima i
 * Fiori, poi chi costa più di 200 €, a parità il più venduto» ci volevano tre
 * salvataggi e tre ricariche di pagina, e le righe — larghezze diverse, testi
 * d'aiuto in mezzo — non si leggevano una accanto all'altra. Qui è una griglia:
 * colonne allineate, si compila quello che serve, si preme una volta.
 *
 * **Uno solo**, usato dalla pagina della regola *e* dalla scheda della
 * collezione: le condizioni si scrivono dove si sta guardando la fila. Con due
 * copie le due schermate offrirebbero condizioni diverse alla prima modifica.
 *
 * `tornaA` è l'id della collezione da cui si sta lavorando: quando c'è, dopo
 * ogni modifica la regola viene riapplicata a quella collezione e si torna lì.
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
  const valori: Record<string, VoceValore[]> = {
    tipo: voci.tipi,
    categoria: voci.categorie,
    fornitore: voci.fornitori,
    linea: voci.linee,
    tag: voci.tag,
    risposta: RISPOSTE.map((x) => ({ v: x.chiave, n: null, etichetta: x.nome })),
  };

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

      <form action={aggiungiPassiInBlocco.bind(null, regolaId)} style={{ marginTop: 18 }}>
        {tornaA && <input type="hidden" name="tornaA" value={tornaA} />}
        <div className="griglia-condizioni">
          <div className="gc-testa">Condizione</div>
          <div className="gc-testa">Valori — chi corrisponde va in cima</div>

          {CAMPI.filter((c) => c.chiave !== "prezzo").map((campo) => {
            const opzioni = valori[campo.chiave] ?? [];
            return (
              <Riga key={campo.chiave} etichetta={campo.nome} aiuto={campo.spiega}>
                {opzioni.length === 0 ? (
                  <span className="page-sub" style={{ margin: 0 }}>
                    Nessun valore nei dati: questa condizione non avrebbe niente da portare in cima.
                  </span>
                ) : (
                  /* **Caselle a griglia, non un menu a selezione multipla.** Un
                     `<select multiple>` vuole il ctrl+clic per prenderne più di
                     uno — chi non lo sa ne sceglie sempre uno solo — e mostra
                     cinque righe alla volta di quattrocento tag. Qui i valori si
                     vedono tutti insieme e si spuntano uno per uno, come si
                     scelgono i prodotti. */
                  <div className="griglia-valori" role="group" aria-label={campo.nome}>
                    {opzioni.map((x) => (
                      <label className="chip-valore" key={x.v}>
                        <input type="checkbox" name={`valori:${campo.chiave}`} value={x.v} />
                        <span>{x.etichetta ?? x.v}</span>
                        {x.n != null && <b className="chip-conta">{x.n}</b>}
                      </label>
                    ))}
                  </div>
                )}
              </Riga>
            );
          })}

          <Riga etichetta="Prezzo" aiuto="Il «da» è compreso, il «a» escluso: 200 € non cade in un buco fra due passi.">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input name="prezzoDa" type="number" step="0.01" placeholder="da €" style={{ width: 110 }} />
              <input name="prezzoA" type="number" step="0.01" placeholder="a €" style={{ width: 110 }} />
            </div>
          </Riga>

          {/* La metrica sta **in fondo**, ed è dove va: mette in fila tutti i
              prodotti, quindi davanti a una condizione la renderebbe inutile —
              deciderebbe già tutto lei. */}
          <Riga etichetta="Metrica, a parità" aiuto="Mette in fila tutti i prodotti. Aggiunta come ultimo passo: spezza i pareggi lasciati dalle condizioni.">
            <select name="metrica" aria-label="Metrica" defaultValue="">
              <option value="">— nessuna —</option>
              {REGOLE.filter((x) => x.chiave !== "manuale").map((x) => (
                <option key={x.chiave} value={x.chiave}>{x.nome}</option>
              ))}
            </select>
          </Riga>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <button type="submit" className="btn btn-primario">Aggiungi le condizioni scelte</button>
          <span className="page-sub" style={{ margin: 0 }}>
            Si aggiungono <b>nell&apos;ordine in cui le vedi qui</b>, la metrica per ultima. La priorità si corregge
            dopo con le frecce. Dentro una riga i valori valgono <b>in alternativa</b> (Fiori <i>o</i> Torte); fra righe
            diverse contano <b>tutte</b>.
          </span>
        </div>
      </form>
    </>
  );
}

function Riga({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="gc-etichetta">
        {etichetta}
        {aiuto && <div className="cella-sub" style={{ fontWeight: 400 }}>{aiuto}</div>}
      </div>
      <div>{children}</div>
    </>
  );
}

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
