import { BriefCampagnaAi } from "@/components/BriefCampagnaAi";
import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { lanciaCampagna } from "@/lib/azioni";
import { proponiBriefCampagna } from "@/lib/azioni-brief";
import { BRANDS, ETICHETTA_BRAND } from "@/lib/dominio";
import { ModuloLancioMeta } from "./modulo-meta";

export const dynamic = "force-dynamic";
// ⚠️ Una server action che chiama il modello vuole `maxDuration` sulla pagina
// che la invoca, o in produzione muore a metà mentre in locale sembra a posto
// (trappola già pagata su campagne/[id] con «Estendi con AI»).
export const maxDuration = 60;

// Gli obiettivi di Google Ads, detti come li direbbe chi vende — non come li
// chiama Google. «Vendite» e «Contatti» non sono due nomi per la stessa cosa:
// cambiano la conversione che si conta e quindi il ROAS, e su una campagna a
// contatti il valore conversione è simbolico (1,00 €), per cui il ROAS
// sembrerebbe una perdita. È la distinzione che l'app tiene in
// `tipoConversione`: sbagliarla qui la porta sbagliata fino in fondo.
const OBIETTIVI = [
  { chiave: "vendite", nome: "Vendite", icona: "vendite", nota: "Acquisti sul sito. La conversione vale quanto l'ordine e il ROAS si legge davvero." },
  { chiave: "contatti", nome: "Contatti", icona: "b2b", nota: "Lead B2B, richieste, preventivi. ⚠️ Il valore conversione è simbolico: si guarda il costo per contatto, non il ROAS." },
  { chiave: "traffico", nome: "Traffico", icona: "pagina", nota: "Visite qualificate a una pagina. Nessuna vendita da contare: si misura col costo per clic." },
  { chiave: "notorieta", nome: "Notorietà", icona: "pubblici", nota: "Farsi conoscere. Si giudica su impressioni e copertura — chiederle un ROAS non ha senso." },
];

// Le città su cui si lavora davvero. Sono le stesse che l'app riconosce nei
// nomi di campagna e keyword (`CITTA_NOTE`): tenerle allineate evita che una
// campagna nasca su una città che poi nessuna deduzione sa più riconoscere.
const CITTA = ["Milano", "Roma", "Napoli", "Torino", "Firenze", "Bologna", "Venezia", "Como", "Verona", "Bari"];

const STRATEGIE = [
  { chiave: "max_conversioni", nome: "Massimizza conversioni" },
  { chiave: "target_roas", nome: "ROAS target" },
  { chiave: "max_clic", nome: "Massimizza clic" },
  { chiave: "cpc_manuale", nome: "CPC manuale" },
];

// Creazione di una campagna NUOVA su Google Ads, tutto dall'app.
// Il percorso è quello sicuro: qui si prepara, in /operazioni si approva, lo
// script la crea via bulk upload e la campagna nasce IN PAUSA — si accende a
// mano in interfaccia solo dopo la checklist 4.1. Il copy passa dal lint
// 7.2/7.3 prima ancora di entrare in coda.
export default async function CreaCampagna({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; brand?: string; canale?: string }>;
}) {
  const sp = await searchParams;
  // ⚠️ Il brand arriva dall'elenco da cui si è partiti: se si stava guardando
  // Flowers, la campagna nasce Flowers. Senza questo, il modulo ripartiva
  // sempre da «gifts» e bastava non accorgersene per creare la campagna sul
  // marchio sbagliato — un errore che si scopre solo quando è già su Google.
  const seguendo = (BRANDS as readonly string[]).includes(sp.brand ?? "");
  const brand = seguendo ? sp.brand! : "gifts";
  // ⚠️ Il canale NON è un filtro: cambia il modulo intero. Google chiede
  // keyword e RSA, Meta chiede pubblico, posizionamenti ed evento del pixel —
  // presentare l'uno per l'altro fa raccogliere dati che la piattaforma non
  // sa nemmeno ricevere.
  const meta = sp.canale === "meta";
  const linkCanale = (c: string) =>
    `/campagne/lancia?${new URLSearchParams({ ...(sp.brand ? { brand: sp.brand } : {}), ...(c === "meta" ? { canale: "meta" } : {}) }).toString()}`;

  return (
    <div className="layout">
      <Sidebar attiva="campagne" brandAttivo={sp.brand} />
      <main className="main" style={{ maxWidth: 1100 }}>
        <a className="ritorno" href={`/campagne${sp.brand ? `?brand=${sp.brand}` : ""}`}>← Campagne</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Crea campagna
              {seguendo && <span className="titolo-brand"> · {ETICHETTA_BRAND[brand]}</span>}
            </h1>
            <p className="page-sub">
              {meta ? (
                <>Si prepara qui, si approva in Operazioni, la crea <b>l&apos;app</b> via Graph API —
                campagna, ad set e (con l&apos;immagine) l&apos;annuncio nascono <b>in pausa</b>.</>
              ) : (
                <>Si prepara qui, si approva in Operazioni, la crea lo script — e nasce <b>in pausa</b>:
                l&apos;accensione resta un gesto manuale dopo la checklist 4.1 (mai lanciare al buio).</>
              )}
            </p>
          </div>
        </div>

        {/* Il canale si sceglie PRIMA di compilare: i due moduli non hanno
            un campo in comune oltre a nome, marchio e budget. */}
        <div className="pill-scelta" style={{ marginBottom: 16 }}>
          <a className={`pill-opt${meta ? "" : " attuale"}`} href={linkCanale("google")}>Google Ads</a>
          <a className={`pill-opt${meta ? " attuale" : ""}`} href={linkCanale("meta")}>Meta · Facebook e Instagram</a>
        </div>

        {sp.errore && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span><b>Non accodata:</b> {sp.errore}</span>
          </div>
        )}

        {meta ? (
          <>
            <ModuloLancioMeta brand={brand} tornaBrand={sp.brand} />

            {/* ⚠️ La stessa distinzione che regge il modulo Google: che cosa
                arriva davvero sulla piattaforma e che cosa resta a mano. Su
                Meta cambia anche CHI esegue: non lo script, l'app. */}
            <div className="nota-info">
              <span className="nota-icona">◈</span>
              <span>
                <b>Che cosa arriva su Meta, e come.</b> Ad approvazione data, <b>l&apos;app</b> crea
                via Graph API la <b>campagna</b> (obiettivo, categoria speciale, budget se
                Advantage/CBO) e l&apos;<b>ad set</b> (località, età, genere, posizionamenti,
                ottimizzazione con l&apos;evento del pixel, budget se ABO) — e, se il modulo porta
                l&apos;<b>immagine</b>, anche creative e <b>annuncio</b>. Tutto nasce
                <b> IN PAUSA</b>, e l&apos;esito si rilegge da Meta, non si presume. Le città dette
                per nome le traduce l&apos;app chiedendo a Meta: un nome ambiguo non si indovina,
                si elenca nell&apos;esito. Senza immagine l&apos;annuncio resta un brief da montare
                in Ads Manager, e i <b>pubblici personalizzati</b> restano promemoria:
                si completano in Ads Manager prima dell&apos;accensione, con la checklist 4.1.
                ⚠️ Prima di scrivere, l&apos;app chiede a Meta il permesso vero (`ads_management`)
                e controlla l&apos;interruttore `META_SCRITTURA`: se una delle due cose manca, il
                lancio approvato resta in coda e la coda dice perché — quando ci sono, viene
                eseguito davvero al primo giro di esecuzione.
              </span>
            </div>

            <div className="nota-info">
              <span className="nota-icona">◈</span>
              <span>
                Il copy del brief passa dal lint dei documenti 7.2/7.3 <b>prima</b> di entrare in
                coda, come su Google: parole vietate per il brand bloccano l&apos;accodamento con il
                suggerimento di sostituzione.
              </span>
            </div>
          </>
        ) : (
          <>
        {/* Il pannello sta FUORI dal <form>: un <form> dentro un altro non è
            HTML valido, e il bottone «Compila con l'AI» finirebbe per essere
            un submit del modulo grande. Scrive nei campi per nome. */}
        <BriefCampagnaAi brand={brand} azione={proponiBriefCampagna} />

        <form className="modulo-creazione" action={lanciaCampagna}>
          {/* Il brand viaggia anche negli errori: un redirect che lo perdesse
              riporterebbe il modulo su «gifts» senza dirlo. */}
          <input type="hidden" name="tornaBrand" value={sp.brand ?? ""} />

          {/* ——— 1. Che cosa deve ottenere ——— */}
          <section className="scheda">
            <div className="scheda-titolo">
              <span className="titolo-icona"><Icona nome="campagne" /></span>
              Che cosa deve ottenere
            </div>
            <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
              Decide quale conversione si conta, e quindi quale numero vorrà dire «sta andando bene».
            </p>
            <div className="scelte-icona">
              {OBIETTIVI.map((o) => (
                <div className="scelta" key={o.chiave}>
                  <input
                    className="scelta-radio"
                    type="radio"
                    name="obiettivoTipo"
                    id={`ob-${o.chiave}`}
                    value={o.chiave}
                    defaultChecked={o.chiave === "vendite"}
                  />
                  <label className="scelta-carta" htmlFor={`ob-${o.chiave}`}>
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
                <input name="nome" required placeholder="es. [Deluxy] Fiori Napoli" />
                <span className="campo-aiuto">
                  È il nome che si vedrà su Google. Se ci metti dentro la città e la lingua,
                  l&apos;app le riconosce da sola e non dovrai dirgliele a mano.
                </span>
              </div>
              <div className="campo-modulo">
                <label>Marchio <span className="obbligatorio">*</span></label>
                <select name="brand" defaultValue={brand}>
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                  ))}
                </select>
                {seguendo && (
                  <span className="campo-aiuto">
                    Preso dall&apos;elenco che stavi guardando ({ETICHETTA_BRAND[brand]}).
                  </span>
                )}
              </div>
              <div className="campo-modulo">
                <label>Lingua degli annunci</label>
                <select name="lingua" defaultValue="ita">
                  <option value="ita">Italiano</option>
                  <option value="eng">Inglese</option>
                </select>
                <span className="campo-aiuto">
                  È la lingua in cui sono scritti gli annunci, non quella di chi cerca.
                </span>
              </div>
            </div>
          </section>

          {/* ——— 3. Quanto ——— */}
          <section className="scheda">
            <div className="scheda-titolo">
              <span className="titolo-icona"><Icona nome="budget" /></span>
              Quanto può spendere
            </div>
            <div className="modulo">
              <div className="campo-modulo">
                <label>Budget al giorno <span className="obbligatorio">*</span></label>
                <div className="campo-unita">
                  <input name="budget" type="number" step="0.5" min="1" required placeholder="15" list="budget-tipici" />
                  <span className="unita">€ / giorno</span>
                </div>
                <datalist id="budget-tipici">
                  <option value="10" /><option value="15" /><option value="25" /><option value="50" /><option value="100" />
                </datalist>
                <span className="campo-aiuto">
                  Google può spendere fino al doppio in un singolo giorno, ma nel mese resta nella media.
                </span>
              </div>
              <div className="campo-modulo">
                <label>Strategia di offerta</label>
                <select name="strategia" defaultValue="max_conversioni">
                  {STRATEGIE.map((s) => (
                    <option key={s.chiave} value={s.chiave}>{s.nome}</option>
                  ))}
                </select>
                <span className="campo-aiuto">Da impostare a mano: vedi la nota in fondo.</span>
              </div>
            </div>
          </section>

          {/* ——— 4. Dove ——— */}
          <section className="scheda">
            <div className="scheda-titolo">
              <span className="titolo-icona"><Icona nome="destinazioni" /></span>
              Dove deve erogare
            </div>
            <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
              Spunta le città, oppure scrivile sotto. Vale anche «Italia» per tutto il Paese.
            </p>
            <div className="chip-scelte">
              {CITTA.map((c) => (
                <div className="chip-scelta" key={c}>
                  <input className="chip-check" type="checkbox" name="localita" id={`loc-${c}`} value={c} />
                  <label className="chip-etichetta" htmlFor={`loc-${c}`}>{c}</label>
                </div>
              ))}
              <div className="chip-scelta">
                <input className="chip-check" type="checkbox" name="localita" id="loc-italia" value="Italia" />
                <label className="chip-etichetta" htmlFor="loc-italia">Tutta Italia</label>
              </div>
            </div>
            <div className="modulo" style={{ marginTop: 14 }}>
              <div className="campo-modulo largo">
                <label>Altre località — separate da virgola (vale anche l&apos;id di Google)</label>
                <input name="localitaAltre" placeholder="es. Marbella, Lugano, Principato di Monaco, 2724" />
              </div>
            </div>
          </section>

          {/* ——— 5. Dove manda ——— */}
          <section className="scheda">
            <div className="scheda-titolo">
              <span className="titolo-icona"><Icona nome="landing" /></span>
              Dove manda chi clicca
            </div>
            <div className="modulo">
              <div className="campo-modulo largo">
                <label>URL di destinazione</label>
                <input name="finalUrl" type="url" placeholder="https://deluxyflowers.com/collections/napoli" />
                <span className="campo-aiuto">
                  Obbligatoria se scrivi i titoli dell&apos;annuncio. La pagina deve promettere
                  la stessa cosa dell&apos;annuncio, o si paga il clic due volte.
                </span>
              </div>
            </div>
          </section>

          {/* ——— 6. Le parole ——— */}
          <section className="scheda">
            <div className="scheda-titolo">
              <span className="titolo-icona"><Icona nome="analisi" /></span>
              Su quali ricerche comparire
            </div>
            <div className="modulo">
              <div className="campo-modulo">
                <label>Gruppo di annunci</label>
                <input name="gruppo" placeholder="Gruppo 1" />
              </div>
              <div className="campo-modulo largo">
                <label>Keyword — una per riga, corrispondenza dopo la barra (generica se omessa)</label>
                <textarea
                  name="keywords"
                  rows={6}
                  placeholder={"consegna fiori napoli | phrase\nfiorista napoli domicilio | exact\nfiori a domicilio napoli"}
                />
              </div>
              <div className="campo-modulo largo">
                <label>Parole da escludere subito — una per riga</label>
                <textarea name="negative" rows={3} placeholder={"gratis\nfunerale\nfai da te"} />
                <span className="campo-aiuto">
                  Registrate come promemoria: le negative si aggiungono dalla scheda campagna
                  una volta che esiste su Google.
                </span>
              </div>
            </div>
          </section>

          {/* ——— 7. L'annuncio ——— */}
          <section className="scheda">
            <div className="scheda-titolo">
              <span className="titolo-icona"><Icona nome="copy" /></span>
              Che cosa dice l&apos;annuncio
            </div>
            <div className="modulo">
              <div className="campo-modulo largo">
                <label>Titoli — uno per riga, max 30 caratteri (min 3, meglio 8-10)</label>
                <textarea
                  name="titoli"
                  rows={6}
                  placeholder={"Fiori a Napoli in Giornata\nConsegna in Guanti Bianchi\nBouquet dell'Atelier Deluxy"}
                />
              </div>
              <div className="campo-modulo largo">
                <label>Descrizioni — una per riga, max 90 caratteri (min 2)</label>
                <textarea
                  name="descrizioni"
                  rows={4}
                  placeholder={"Composizioni dell'atelier consegnate con cura, anche in giornata. Ordina entro le 20."}
                />
              </div>
              <div className="campo-modulo largo">
                <label>Perché questa campagna</label>
                <input name="motivo" placeholder="La baseline e il motivo restano nello storico (doc 10 §1)" />
              </div>
            </div>
          </section>

          <div className="azioni-modulo" style={{ marginBottom: 18 }}>
            <a className="btn btn-secondario" href={`/campagne${sp.brand ? `?brand=${sp.brand}` : ""}`}>Annulla</a>
            <button className="btn" type="submit">Metti in coda per l&apos;approvazione</button>
          </div>
        </form>

        {/* ⚠️ La distinzione più importante della pagina: che cosa lo script sa
            fare da solo e che cosa resta a mano. Un modulo che chiede dieci
            cose e ne applica sei, senza dirlo, fa credere che la campagna
            nasca configurata — e qualcuno la accende convinto che il
            targeting ci sia. */}
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            <b>Che cosa arriva su Google, e come.</b> Il caricamento porta <b>nome, budget, tipo
            Ricerca, strategia di offerta, lingua, località, gruppo, keyword e un annuncio
            RSA</b>, e la campagna nasce <b>in pausa</b>. Le <b>parole da escludere</b> non
            viaggiano lì: vanno in coda da sole <b>appena Google conferma che la campagna
            esiste</b>, e da approvare come le altre — il caricamento non dice se le accetta, e
            una negativa che sparisce in silenzio farebbe erogare la campagna proprio sulle
            ricerche che volevi escludere. L&apos;<b>obiettivo</b> resta un&apos;etichetta nostra:
            su Google è un involucro dell&apos;interfaccia, non un campo che uno script possa
            scrivere. Una località che l&apos;app non conosce <b>la chiede a Google lo script</b>
            quando lancia, e nell&apos;esito dell&apos;operazione trovi cosa ha trovato: ⚠️ se un
            nome dà <b>più risultati</b> (Como è una città e una provincia) non ne sceglie nessuno
            e te li elenca — riscrivi il nome esatto o incolla direttamente l&apos;id, che qui
            sotto è accettato. Resta la <b>checklist 4.1</b> prima di accendere.
          </span>
        </div>

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Il copy viene controllato col lint dei documenti 7.2/7.3 <b>prima</b> di entrare in coda:
            parole vietate per il brand (es. «gratis» fuori Flowers, «last minute», sconti urlati)
            bloccano l&apos;accodamento con il suggerimento di sostituzione. Il tono è il maggiordomo
            dell&apos;emozione: l&apos;urgenza è affidabilità del servizio, non corsa.
          </span>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
