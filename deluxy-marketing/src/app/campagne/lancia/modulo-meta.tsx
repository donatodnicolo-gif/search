import { Icona } from "@/components/Icona";
import { lanciaCampagnaMeta } from "@/lib/azioni";
import { BRANDS, ETICHETTA_BRAND } from "@/lib/dominio";

// Il modulo di lancio per META — un modulo SUO, non il modulo Google con i
// nomi cambiati. La struttura segue quella della piattaforma:
//   campagna → obiettivo (ODAX), categoria speciale, budget se Advantage/CBO
//   ad set   → pubblico (geo, età, genere, Advantage+), posizionamenti,
//              ottimizzazione con l'evento del pixel, budget se ABO
//   annuncio → il creativo: NON nasce da qui (vuole un media che l'app non
//              possiede), il copy resta come brief nei parametri.
// Niente keyword, niente corrispondenze, niente RSA: su Meta non esistono.

// Gli obiettivi come li chiama Meta (ODAX), detti come li direbbe chi vende.
// «Interazioni» manca apposta: ottimizza su un post che al lancio non esiste
// ancora — l'annuncio si monta dopo — quindi sarebbe una promessa vuota.
const OBIETTIVI_META = [
  { chiave: "vendite", nome: "Vendite", icona: "vendite", nota: "Acquisti sul sito, contati dal pixel. L'asta compra conversioni: il ROAS si legge davvero." },
  { chiave: "contatti", nome: "Contatti", icona: "b2b", nota: "Lead dal pixel (evento Lead). ⚠️ Si guarda il costo per contatto, non il ROAS." },
  { chiave: "traffico", nome: "Traffico", icona: "pagina", nota: "Clic al sito. Nessun pixel richiesto: si misura col costo per clic." },
  { chiave: "notorieta", nome: "Notorietà", icona: "pubblici", nota: "Copertura: farsi vedere da più persone possibile. Niente ROAS, si giudica su copertura e frequenza." },
];

const STRATEGIE_META = [
  { chiave: "volume", nome: "Volume più alto (senza limite)" },
  { chiave: "costo_cap", nome: "Costo per risultato (cost cap)" },
  { chiave: "bid_cap", nome: "Limite d'offerta (bid cap)" },
  { chiave: "roas_min", nome: "ROAS minimo" },
];

// I paesi su cui si lavora davvero, in ISO-2 come li vuole Meta.
const PAESI = [
  { codice: "IT", nome: "Italia" },
  { codice: "US", nome: "Stati Uniti" },
  { codice: "GB", nome: "Regno Unito" },
  { codice: "FR", nome: "Francia" },
  { codice: "DE", nome: "Germania" },
  { codice: "CH", nome: "Svizzera" },
  { codice: "AE", nome: "Emirati" },
];

const CTA = [
  { chiave: "SHOP_NOW", nome: "Acquista ora" },
  { chiave: "ORDER_NOW", nome: "Ordina ora" },
  { chiave: "LEARN_MORE", nome: "Scopri di più" },
  { chiave: "GET_OFFER", nome: "Richiedi l'offerta" },
  { chiave: "CONTACT_US", nome: "Contattaci" },
];

export function ModuloLancioMeta({ brand, tornaBrand }: { brand: string; tornaBrand?: string }) {
  return (
    <form className="modulo-creazione" action={lanciaCampagnaMeta}>
      <input type="hidden" name="tornaBrand" value={tornaBrand ?? ""} />

      {/* ——— 1. Che cosa deve ottenere (obiettivo ODAX) ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="campagne" /></span>
          Che cosa deve ottenere
        </div>
        <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
          Su Meta l&apos;obiettivo NON è un&apos;etichetta: decide che cosa compra l&apos;asta
          (conversioni, clic o copertura) e se serve il pixel.
        </p>
        <div className="scelte-icona">
          {OBIETTIVI_META.map((o) => (
            <div className="scelta" key={o.chiave}>
              <input
                className="scelta-radio"
                type="radio"
                name="obiettivoTipo"
                id={`obm-${o.chiave}`}
                value={o.chiave}
                defaultChecked={o.chiave === "vendite"}
              />
              <label className="scelta-carta" htmlFor={`obm-${o.chiave}`}>
                <span className="scelta-icona"><Icona nome={o.icona} /></span>
                <span className="scelta-nome">{o.nome}</span>
                <span className="scelta-nota">{o.nota}</span>
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* ——— 2. Identità ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="impostazioni" /></span>
          Nome e marchio
        </div>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label>Nome della campagna <span className="obbligatorio">*</span></label>
            <input name="nome" required placeholder="es. [Deluxyflower] | Prospecting | ITA" />
            <span className="campo-aiuto">
              È il nome che si vedrà in Ads Manager. ⚠️ La barra «|» nei nomi è la convenzione
              Meta di casa — ma dentro le tabelle del ponte va gestita, quindi niente barre extra.
            </span>
          </div>
          <div className="campo-modulo">
            <label>Marchio <span className="obbligatorio">*</span></label>
            <select name="brand" defaultValue={brand}>
              {BRANDS.map((b) => (
                <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Categoria speciale</label>
            <select name="categoriaSpeciale" defaultValue="nessuna">
              <option value="nessuna">Nessuna (fiori, torte, regali)</option>
              <option value="credito">Credito</option>
              <option value="lavoro">Lavoro</option>
              <option value="abitazioni">Abitazioni</option>
              <option value="tematiche_sociali">Tematiche sociali / politica</option>
            </select>
            <span className="campo-aiuto">
              Meta la chiede sempre, anche quando è «nessuna»: dichiararla sbagliata fa
              rifiutare o limitare la campagna.
            </span>
          </div>
        </div>
      </section>

      {/* ——— 3. Budget e offerta ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="budget" /></span>
          Quanto può spendere, e dove vive il budget
        </div>
        <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
          Su Meta il budget può stare sulla <b>campagna</b> (Advantage/CBO: Meta lo sposta
          fra gli ad set) o su ogni <b>ad set</b> (ABO: lo decidi tu, ad set per ad set).
          Scriverlo sul livello sbagliato è la trappola classica di Meta.
        </p>
        <div className="modulo">
          <div className="campo-modulo">
            <label>Livello del budget</label>
            <div className="chip-scelte">
              <div className="chip-scelta">
                <input className="chip-check" type="radio" name="livelloBudget" id="lb-campagna" value="campagna" defaultChecked />
                <label className="chip-etichetta" htmlFor="lb-campagna">Campagna (Advantage/CBO)</label>
              </div>
              <div className="chip-scelta">
                <input className="chip-check" type="radio" name="livelloBudget" id="lb-adset" value="adset" />
                <label className="chip-etichetta" htmlFor="lb-adset">Ad set (ABO)</label>
              </div>
            </div>
          </div>
          <div className="campo-modulo">
            <label>Budget al giorno <span className="obbligatorio">*</span></label>
            <div className="campo-unita">
              <input name="budget" type="number" step="0.5" min="1" required placeholder="15" list="budget-tipici-meta" />
              <span className="unita">€ / giorno</span>
            </div>
            <datalist id="budget-tipici-meta">
              <option value="10" /><option value="15" /><option value="25" /><option value="50" /><option value="100" />
            </datalist>
            <span className="campo-aiuto">
              A Meta viaggia in centesimi: la conversione la fa l&apos;app, in un punto solo.
            </span>
          </div>
          <div className="campo-modulo">
            <label>Strategia d&apos;offerta</label>
            <select name="strategia" defaultValue="volume">
              {STRATEGIE_META.map((s) => (
                <option key={s.chiave} value={s.chiave}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Importo del limite (per cost cap / bid cap)</label>
            <div className="campo-unita">
              <input name="importoCap" type="number" step="0.5" min="0" placeholder="es. 8" />
              <span className="unita">€</span>
            </div>
            <span className="campo-aiuto">Serve solo con quelle due strategie: con le altre si ignora.</span>
          </div>
          <div className="campo-modulo">
            <label>ROAS minimo (solo per la strategia omonima)</label>
            <input name="roasMinimo" type="number" step="0.1" min="0" placeholder="es. 3,4" />
          </div>
          <div className="campo-modulo">
            <label>Inizio programmato (opzionale)</label>
            <input name="inizio" type="datetime-local" />
          </div>
          <div className="campo-modulo">
            <label>Fine programmata (opzionale)</label>
            <input name="fine" type="datetime-local" />
            <span className="campo-aiuto">
              Senza date: parte quando la accendi e va finché non la fermi. Nasce comunque in pausa.
            </span>
          </div>
        </div>
      </section>

      {/* ——— 4. Il pubblico (l'ad set) ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="pubblici" /></span>
          Chi deve raggiungere (l&apos;ad set)
        </div>
        <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
          Su Meta non ci sono keyword: si descrive un <b>pubblico</b>. Località, età e genere
          li porta il lancio; i pubblici personalizzati e i lookalike no — l&apos;app non li
          possiede — e restano scritti come promemoria.
        </p>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label>Nome dell&apos;ad set</label>
            <input name="nomeAdSet" placeholder="es. Prospecting ITA 25-54" />
            <span className="campo-aiuto">Vuoto = «{`{nome campagna}`} — pubblico 1».</span>
          </div>
        </div>
        <div className="chip-scelte" style={{ marginTop: 6 }}>
          {PAESI.map((p) => (
            <div className="chip-scelta" key={p.codice}>
              <input className="chip-check" type="checkbox" name="paesi" id={`paese-${p.codice}`} value={p.codice} defaultChecked={p.codice === "IT"} />
              <label className="chip-etichetta" htmlFor={`paese-${p.codice}`}>{p.nome}</label>
            </div>
          ))}
        </div>
        <div className="modulo" style={{ marginTop: 14 }}>
          <div className="campo-modulo">
            <label>Altri paesi — codici ISO separati da virgola</label>
            <input name="paesiAltri" placeholder="es. ES, NL, SA" />
          </div>
          <div className="campo-modulo largo">
            <label>Città — una per riga, raggio in km dopo la barra (opzionale)</label>
            <textarea name="citta" rows={3} placeholder={"Milano | 25\nRoma\n777934"} />
            <span className="campo-aiuto">
              I nomi li traduce l&apos;app quando esegue, chiedendo a Meta: se un nome è ambiguo
              non sceglie e te li elenca nell&apos;esito — riscrivi il nome esatto o incolla la
              chiave numerica (una riga di sole cifre è già la chiave).
            </span>
          </div>
          <div className="campo-modulo">
            <label>Età minima</label>
            <select name="etaMin" defaultValue="18">
              {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Età massima</label>
            <select name="etaMax" defaultValue="65">
              {[24, 30, 35, 40, 45, 50, 55, 60, 65].map((e) => (
                <option key={e} value={e}>{e === 65 ? "65 e oltre" : e}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Genere</label>
            <select name="genere" defaultValue="tutti">
              <option value="tutti">Tutti</option>
              <option value="donne">Donne</option>
              <option value="uomini">Uomini</option>
            </select>
          </div>
          <div className="campo-modulo">
            <label>Pubblico Advantage+</label>
            <div className="chip-scelte">
              <div className="chip-scelta">
                <input className="chip-check" type="checkbox" name="advantage" id="advantage" value="1" defaultChecked />
                <label className="chip-etichetta" htmlFor="advantage">Meta può allargare oltre i limiti scelti</label>
              </div>
            </div>
            <span className="campo-aiuto">
              È la dichiarazione che la Graph API oggi PRETENDE su ogni ad set nuovo:
              spuntato lascia lavorare l&apos;algoritmo, tolto blinda età/genere scelti.
            </span>
          </div>
          <div className="campo-modulo largo">
            <label>Pubblici personalizzati / lookalike — solo promemoria</label>
            <textarea name="pubblici" rows={2} placeholder={"es. Lookalike 1% acquirenti Flowers 180g\nEscludere acquirenti ultimi 30g"} />
            <span className="campo-aiuto">
              ⚠️ Il lancio NON li applica: l&apos;app non possiede i pubblici. Restano nei
              parametri dell&apos;operazione, si agganciano a mano in Ads Manager.
            </span>
          </div>
        </div>
      </section>

      {/* ——— 5. Posizionamenti ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="destinazioni" /></span>
          Dove compaiono gli annunci
        </div>
        <div className="modulo">
          <div className="campo-modulo">
            <label>Posizionamenti</label>
            <div className="chip-scelte">
              <div className="chip-scelta">
                <input className="chip-check" type="radio" name="posizionamentiTipo" id="pos-auto" value="auto" defaultChecked />
                <label className="chip-etichetta" htmlFor="pos-auto">Advantage+ (automatici)</label>
              </div>
              <div className="chip-scelta">
                <input className="chip-check" type="radio" name="posizionamentiTipo" id="pos-manuali" value="manuali" />
                <label className="chip-etichetta" htmlFor="pos-manuali">Manuali</label>
              </div>
            </div>
            <span className="campo-aiuto">Automatici è la scelta che Meta premia in asta; i manuali costano di più.</span>
          </div>
          <div className="campo-modulo largo">
            <label>Se manuali, su quali piattaforme</label>
            <div className="chip-scelte">
              {[
                { v: "facebook", n: "Facebook" },
                { v: "instagram", n: "Instagram" },
                { v: "messenger", n: "Messenger" },
                { v: "audience_network", n: "Audience Network" },
              ].map((p) => (
                <div className="chip-scelta" key={p.v}>
                  <input className="chip-check" type="checkbox" name="posizionamenti" id={`pos-${p.v}`} value={p.v} />
                  <label className="chip-etichetta" htmlFor={`pos-${p.v}`}>{p.n}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ——— 6. Tracciamento ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="analisi" /></span>
          Che risultato conta (il pixel)
        </div>
        <div className="modulo">
          <div className="campo-modulo">
            <label>Evento di conversione (per Vendite)</label>
            <select name="eventoConversione" defaultValue="acquisto">
              <option value="acquisto">Acquisto</option>
              <option value="carrello">Aggiunta al carrello</option>
            </select>
            <span className="campo-aiuto">Con obiettivo «Contatti» l&apos;evento è Lead, deciso da Meta.</span>
          </div>
          <div className="campo-modulo">
            <label>Pixel (id) — vuoto: lo trova l&apos;app</label>
            <input name="pixelId" placeholder="es. 1234567890" />
            <span className="campo-aiuto">
              Se sull&apos;account il pixel è uno solo l&apos;app lo usa; se sono di più si ferma
              e li elenca nell&apos;esito — con due pixel «prendo il primo» conterebbe le
              conversioni di un altro sito.
            </span>
          </div>
        </div>
      </section>

      {/* ——— 7. Il creativo (brief) ——— */}
      <section className="scheda">
        <div className="scheda-titolo">
          <span className="titolo-icona"><Icona nome="copy" /></span>
          Che cosa dice l&apos;annuncio (brief per Ads Manager)
        </div>
        <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
          ⚠️ L&apos;annuncio NON nasce dal lancio: vuole un&apos;immagine o un video, e l&apos;app non
          possiede media. Il copy scritto qui passa dal lint 7.2/7.3 e resta nei parametri
          dell&apos;operazione come brief per chi monta il creativo.
        </p>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label>Testo principale — una variante per riga (le prime ~125 battute si vedono senza «altro»)</label>
            <textarea
              name="testi"
              rows={4}
              placeholder={"Composizioni dell'atelier, consegnate in guanti bianchi anche in giornata.\nIl regalo che arriva perfetto: bouquet Deluxy con consegna curata a mano."}
            />
          </div>
          <div className="campo-modulo largo">
            <label>Titolo (consigliato entro 40 battute)</label>
            <input name="titolo" placeholder="Fiori d'atelier, consegna in giornata" />
          </div>
          <div className="campo-modulo largo">
            <label>Descrizione (facoltativa, si vede solo su alcuni posizionamenti)</label>
            <input name="descrizione" placeholder="Ordina entro le 20" />
          </div>
          <div className="campo-modulo">
            <label>Bottone (call to action)</label>
            <select name="cta" defaultValue="SHOP_NOW">
              {CTA.map((c) => (
                <option key={c.chiave} value={c.chiave}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo largo">
            <label>URL di destinazione</label>
            <input name="finalUrl" type="url" placeholder="https://deluxyflowers.com/collections/milano" />
          </div>
          <div className="campo-modulo largo">
            <label>Perché questa campagna</label>
            <input name="motivo" placeholder="La baseline e il motivo restano nello storico (doc 10 §1)" />
          </div>
        </div>
      </section>

      <div className="azioni-modulo" style={{ marginBottom: 18 }}>
        <a className="btn btn-secondario" href={`/campagne${tornaBrand ? `?brand=${tornaBrand}` : ""}`}>Annulla</a>
        <button className="btn" type="submit">Metti in coda per l&apos;approvazione</button>
      </div>
    </form>
  );
}
