import { REGOLE } from "@/lib/ordinamento-vetrina";
import { CAMPI, etichettaPasso, RISPOSTE, type Passo } from "@/lib/regole-ordine";
import type { VociPassi, VoceValore } from "@/lib/voci-passi";
import { aggiungiPassiInBlocco, muoviPasso, sostituisciPasso } from "@/lib/azioni-regole-ordine";
import type { ProdottoAnteprima } from "./AnteprimaCella";
import { CostruttoreCella } from "./CostruttoreCella";

// **I primi cinque, e col nome.** Di una vetrina si guardano i primi: e' li' che
// la regola si giudica. Ventiquattro miniature senza nome erano un altro elenco
// di prodotti sopra a quello che c'e' gia' in pagina, e non si capiva **chi**
// fosse davvero in cima.
const MAX_FILA = 5;

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
  perAnteprima,
  suCosa = "in vendita",
  campione,
  fila,
  quantiEntrano = 0,
  quantiDietro = 0,
  suChe,
  idsCollezione,
  nomeCollezione,
  modifica,
  indirizzoBase = "",
}: {
  regolaId: string;
  passi: Passo[];
  voci: VociPassi;
  tornaA?: string;
  /** I prodotti su cui si vede l'anteprima mentre si costruisce la cella. */
  perAnteprima?: ProdottoAnteprima[];
  suCosa?: string;
  campione?: boolean;
  /** **Come usciranno** i prodotti, gia' in ordine. */
  fila?: ProdottoAnteprima[];
  /** Quanti di quelli in fila **non sono ancora dentro** e ci entrerebbero da soli. */
  quantiEntrano?: number;
  /** Quanti stanno nella vetrina ma **nessun passo prende**: restano dietro. */
  quantiDietro?: number;
  /** Di cosa e' la fila: ««Fast Delivery»» sulla collezione, il campione sulla pagina della regola. */
  suChe?: string;
  /** L'indice del passo che si sta **modificando**: la griglia si apre già compilata. */
  modifica?: number;
  /** Da dove ripartono i link della matita (la pagina che sta mostrando i passi). */
  indirizzoBase?: string;
  /** Quando si lavora da una collezione: per dire anche quanti ne tocca **qui dentro**. */
  idsCollezione?: string[];
  nomeCollezione?: string;
}) {
  // **Che cosa c'era dentro il passo che si sta modificando**, tradotto nella
  // forma che la griglia sa mostrare. Un passo di sola metrica non ha condizioni:
  // la griglia si apre vuota, con le sue metriche già scelte.
  const inModifica = modifica != null && modifica >= 0 && modifica < passi.length;
  const iniziali = (() => {
    if (!inModifica) return undefined;
    const p = passi[modifica as number];
    if (p.t === "metrica") return { metriche: [p.m] };
    const cs = p.t === "cella" ? p.c : [{ campo: p.campo, valori: p.valori, da: p.da, a: p.a }];
    const scelti: Record<string, string[]> = {};
    let da = "";
    let a = "";
    for (const c of cs) {
      if (c.campo === "prezzo") {
        da = c.da != null ? String(c.da) : "";
        a = c.a != null ? String(c.a) : "";
      } else if (c.valori?.length) scelti[c.campo] = [...c.valori];
    }
    return { scelti, da, a, metriche: p.t === "cella" ? [...(p.m ?? [])] : [] };
  })();

  const valori: Record<string, VoceValore[]> = {
    tipo: voci.tipi,
    categoria: voci.categorie,
    fornitore: voci.fornitori,
    linea: voci.linee,
    tag: voci.tag,
    zona: voci.zone,
    citta: voci.citta,
    occasione: voci.occasioni,
    classificazione: voci.classificazioni,
    tipologiaMeta: voci.tipologieMeta,
    dataConsegna: voci.date,
    orario: voci.orari,
    bestseller: voci.bestseller,
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
                  {/* **I passi si alternano**, non si esauriscono: il primo di
                      ognuno apre la vetrina, uno per posizione, e poi si
                      ricomincia. Scritto qui perche' prima diceva «spezza i
                      pareggi», che descriveva il comportamento vecchio. */}
                  {p.t === "metrica"
                    ? REGOLE.find((x) => x.chiave === p.m)?.spiega
                    : i === 0
                      ? "Apre la vetrina: il suo primo prodotto sta in posizione 1."
                      : `Il suo primo prodotto sta in posizione ${i + 1}, poi si va a turno con gli altri passi.`}
                </div>
              </span>
              <span className="vetrina-azioni">
                {/* **Modificare invece di rifare.** Per cambiare una spunta su una
                    cella da cinque condizioni si ricominciava da capo, e nel
                    frattempo la vetrina restava ordinata da una regola a metà. */}
                <a
                  className="icon-btn"
                  href={`${indirizzoBase}${indirizzoBase.includes("?") ? "&" : "?"}modifica=${i}#regola`}
                  title="Modifica questa condizione"
                  aria-current={modifica === i ? "true" : undefined}
                >
                  ✎
                </a>
                <Muovi regolaId={regolaId} i={i} dove="su" tornaA={tornaA} disabilitato={i === 0} />
                <Muovi regolaId={regolaId} i={i} dove="giu" tornaA={tornaA} disabilitato={i === passi.length - 1} />
                <Muovi regolaId={regolaId} i={i} dove="via" tornaA={tornaA} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* **Come usciranno davvero.** I passi qui sopra si leggono in italiano, ma
          una regola si giudica dalla fila che produce. Questa e' calcolata dal
          server con la **stessa** `ordinaPerPassi` che poi scrive le posizioni —
          quindi comprende anche le metriche (piu' venduti, novita'), che nel
          browser non si potrebbero calcolare. Sotto, nel costruttore, c'e'
          l'altra domanda: chi prenderebbe la cella che stai scrivendo. */}
      {fila && passi.length > 0 && (
        <div className="anteprima-cella" style={{ marginTop: 14 }}>
          <div className="anteprima-conto">
            <b>{fila.length}</b> {fila.length === 1 ? "prodotto" : "prodotti"}
            <span className="page-sub" style={{ margin: 0 }}>
              {" "}· <b>presi</b> {passi.length === 1 ? "dal passo" : `dai ${passi.length} passi`} qui sopra
              {suChe ? ` in ${suChe}` : ""}, in quest&apos;ordine
              {quantiEntrano > 0 && (
                <>
                  {" "}· di cui <b>{quantiEntrano}</b> entrerebbero dalla regola
                </>
              )}
            </span>
          </div>
          {fila.length === 0 ? (
            <span className="page-sub" style={{ margin: 0 }}>
              <b>Nessuno.</b> Nessun passo prende niente di quello che c&apos;è qui dentro: la regola non sposta questa
              vetrina{quantiDietro > 0 ? `, e i suoi ${quantiDietro} prodotti restano come sono` : ""}.
            </span>
          ) : (
            <div className="fila-top">
              {fila.slice(0, MAX_FILA).map((p, i) => (
                <span className="fila-top-voce" key={p.id} title={p.nome}>
                  <b className="fila-top-pos">{i + 1}</b>
                  {p.immagine ? <img src={p.immagine} alt="" /> : <i className="fila-top-vuota">❀</i>}
                  <span className="fila-top-nome">{p.nome}</span>
                </span>
              ))}
              {fila.length > MAX_FILA && (
                <span className="page-sub" style={{ alignSelf: "center", margin: 0 }}>
                  e altri {fila.length - MAX_FILA} presi, a seguire
                </span>
              )}
            </div>
          )}
          {quantiDietro > 0 && (
            <div className="page-sub" style={{ marginTop: 8, marginBottom: 0 }}>
              Altri <b>{quantiDietro}</b> stanno nella vetrina ma <b>nessun passo li prende</b>: restano dietro,
              nell&apos;ordine in cui erano. Con <b>Estendi alla collezione</b> vanno dal più venduto in giù.
            </div>
          )}
        </div>
      )}

      {/* **La griglia sta chiusa finche' non la chiedi.** Con sei righe di
          valori aperta sempre, l'elenco dei passi e la fila che producono
          finivano sotto la piega: si costruiva senza vedere cosa si stava
          costruendo. `<details>` e non un parametro nell'indirizzo, cosi'
          aprire non ricarica la pagina e non perde la posizione. */}
      <details className="apri-condizione" style={{ marginTop: 18 }} open={inModifica}>
        <summary className="btn btn-primario" style={{ display: "inline-block", listStyle: "none" }}>
          {inModifica ? `Stai modificando la condizione ${(modifica as number) + 1}` : "+ Aggiungi condizione"}
        </summary>
      <form
        action={
          inModifica
            ? sostituisciPasso.bind(null, regolaId, modifica as number)
            : aggiungiPassiInBlocco.bind(null, regolaId)
        }
        style={{ marginTop: 14 }}
      >
        {tornaA && <input type="hidden" name="tornaA" value={tornaA} />}
        {/* **La griglia è un componente client**: a ogni spunta rifà i conti e
            spegne i valori che non stanno insieme a quello che hai scelto — le
            condizioni di una cella valgono tutte insieme, quindi non sono
            indipendenti. Dentro c'è anche l'anteprima, perché condivide la stessa
            selezione: tenerle separate avrebbe voluto dire due stati da tenere
            allineati. */}
        <CostruttoreCella
          iniziali={iniziali}
          voci={voci}
          prodotti={perAnteprima ?? []}
          suCosa={suCosa}
          campione={campione}
          idsCollezione={idsCollezione}
          nomeCollezione={nomeCollezione}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <button type="submit" className="btn btn-primario">
            {inModifica ? "Salva la condizione" : "Aggiungi come cella"}
          </button>
          {inModifica && (
            <a className="btn btn-secondario" href={`${indirizzoBase}#regola`}>
              Annulla
            </a>
          )}
          <span className="page-sub" style={{ margin: 0 }}>
            Quello che spunti qui diventa <b>una cella</b>: «Fiori <i>e</i> Bouquet <i>e</i> urgenti» è una casella
            sola, non tre priorità. Dentro una riga i valori valgono <b>in alternativa</b>; fra righe diverse contano{" "}
            <b>tutte insieme</b>, ed è per questo che spuntando qualcosa gli altri valori si restringono. Premi di
            nuovo per una <b>seconda cella</b>: la prima decide l&apos;ordine, le successive spezzano i pareggi.
          </span>
        </div>
      </form>
      </details>
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
