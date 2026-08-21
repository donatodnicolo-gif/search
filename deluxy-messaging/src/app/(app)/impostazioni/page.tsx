import Link from 'next/link'
import { headers } from 'next/headers'
import { leggiImpostazioni } from '@/lib/impostazioni'

import { redirectUri } from '@/lib/google'
import { statoGoogle } from '@/lib/contatti'
import { lingueLette } from '@/lib/lingua-testo'
import { TESTO_DI_RISERVA } from '@/lib/primo-contatto'
import { salvaImpostazioni } from './actions'
import { DiagnosiWhatsApp } from '@/components/DiagnosiWhatsApp'
import { CampoSegreto } from '@/components/CampoSegreto'

export const dynamic = 'force-dynamic'

export default async function PaginaImpostazioni({
  searchParams,
}: {
  searchParams: Promise<{ salvato?: string; okGoogle?: string; erroreGoogle?: string }>
}) {
  const { salvato, okGoogle, erroreGoogle } = await searchParams
  const config = await leggiImpostazioni([
    'waToken',
    'waPhoneNumberId',
    'waBusinessAccountId',
    'fbPageToken',
    'igToken',
    'metaVerifyToken',
    'metaAppSecret',
    'igAppSecret',
    'widgetTitolo',
    'widgetMessaggio',
    'googleClientId',
    'googleMapsApiKey',
    'googleClientSecret',
    'googleRefreshToken',
    'ordersUrl',
    'ordersApiKey',
    'searchUrl',
    'searchApiKey',
    'anthropicApiKey',
    'openaiApiKey',
    'openaiModello',
    'openaiModelloImmagini',
    'openaiModelloRisposte',
    'lingueLette',
    'traduzioneAuto',
    'primoContattoAttivo',
    'primoContattoTesto',
    'partnerUrl',
    'partnerApiKey',
    'anagraficheUrl',
    'anagraficheApiKey',
  ])

  // URL pubblico dell'app: da APP_URL, altrimenti dall'host della richiesta.
  const host = (await headers()).get('host') ?? 'localhost:3140'
  const base =
    process.env.APP_URL || `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`
  const urlWebhook = `${base}/api/webhooks/meta`
  const snippetWidget = `<script src="${base}/widget.js" defer></script>`
  const uriRedirect = redirectUri(base)

  // ⚠️ SI CHIEDE A GOOGLE, non si guarda se la chiave è scritta in tabella.
  // Prima qui bastava `!!config.googleRefreshToken` e la pagina diceva
  // «collegato» anche quando Google quel token lo rifiutava: la bacheca degli
  // ordini, che lo usa davvero, diceva «scollegato» — due schermate con due
  // risposte opposte, e la ragione dalla parte della bacheca.
  const google = await statoGoogle()
  const googleCredenziali = !!config.googleClientId && !!config.googleClientSecret

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Impostazioni</h1>
      {salvato ? <div className="avviso-ok">Impostazioni salvate.</div> : null}
      {okGoogle ? <div className="avviso-ok">Google Contacts collegato.</div> : null}
      {erroreGoogle ? <div className="avviso-errore">{erroreGoogle}</div> : null}

      <form action={salvaImpostazioni}>
        <div className="griglia-impostazioni">
          <div className="card">
            <h2>Webhook Meta</h2>
            <p className="descrizione">
              Su developers.facebook.com, nell&apos;app Meta, imposta questo URL come webhook per
              WhatsApp, Messenger e Instagram, con il verify token qui sotto.
            </p>
            <code className="codice">{urlWebhook}</code>
            <label className="campo">
              <span>Verify token (lo scegli tu, uguale su Meta)</span>
              <input name="metaVerifyToken" defaultValue={config.metaVerifyToken} />
            </label>
            <CampoSegreto
              nome="metaAppSecret"
              etichetta="App Secret (verifica la firma dei webhook)"
              valore={config.metaAppSecret}
              aiuto="App Meta → Impostazioni → Di base → Chiave segreta dell'app. Vale per WhatsApp e per le Pagine Facebook."
            />
            {/* ⚠️ L'app «Instagram API con login di Instagram» ha una chiave
                segreta SUA: firma i webhook dei DM con quella, non con l'App
                Secret di Facebook. Senza, la firma non combacia e il webhook
                risponde 401 — cioè i messaggi Instagram non arrivano mai, e da
                fuori sembra un problema di iscrizione. */}
            <CampoSegreto
              nome="igAppSecret"
              etichetta="Chiave segreta di Instagram"
              valore={config.igAppSecret}
              aiuto="Solo se usi «Instagram API con login di Instagram»: quel prodotto ha una chiave segreta propria e firma i suoi webhook con quella. Se lasci vuoto vale l'App Secret qui sopra."
            />
          </div>

          <div className="card">
            <h2>WhatsApp</h2>
            <p className="descrizione">
              WhatsApp Cloud API: serve il token permanente e il Phone Number ID del numero
              Business (app Meta → WhatsApp → Configurazione API).
            </p>
            <CampoSegreto nome="waToken" etichetta="Token permanente" valore={config.waToken} />
            <label className="campo">
              <span>Phone Number ID</span>
              <input name="waPhoneNumberId" defaultValue={config.waPhoneNumberId} />
            </label>
            {/* L'ID del WhatsApp Business Account serve alla diagnosi: è l'unico
                modo per chiedere a Meta se la nostra app è iscritta a quel
                account. Senza iscrizione Meta non manda NIENTE, per quanto il
                webhook risulti verificato — e nell'app non si vede in nessun
                modo: si guarda un'inbox vuota senza sapere perché. */}
            <label className="campo">
              <span>WhatsApp Business Account ID (per la diagnosi)</span>
              <input
                name="waBusinessAccountId"
                defaultValue={config.waBusinessAccountId}
                placeholder="il numero lungo sotto il nome in WhatsApp Manager"
              />
            </label>
            <DiagnosiWhatsApp />
          </div>

          <div className="card">
            <h2>Messenger</h2>
            <p className="descrizione">
              Page Access Token della pagina Facebook (permessi pages_messaging), per leggere e
              rispondere ai messaggi della pagina. Vale per <strong>una sola</strong> pagina: con
              più marchi, ognuno ha il suo token e si collegano in{' '}
              <Link href="/account-meta">Facebook e Instagram</Link> — questo resta come ripiego.
            </p>
            <CampoSegreto nome="fbPageToken" etichetta="Page Access Token" valore={config.fbPageToken} />
          </div>

          <div className="card">
            <h2>Instagram</h2>
            <p className="descrizione">
              Token della pagina collegata all&apos;account Instagram professionale (permessi
              instagram_manage_messages). Può essere lo stesso token di Messenger. Con più profili
              Instagram si collegano in{' '}
              <Link href="/account-meta">Facebook e Instagram</Link>, uno per marchio.
            </p>
            <CampoSegreto nome="igToken" etichetta="Token" valore={config.igToken} />
          </div>

          <div className="card">
            <h2>Shopify (ordini)</h2>
            <p className="descrizione">
              I negozi Shopify da cui scaricare gli ordini ora si gestiscono nella pagina dedicata:
              puoi collegarne più di uno.
            </p>
            <a className="bottone secondario" href="/negozi">
              Vai a Negozi
            </a>
          </div>

          <div className="card">
            <h2>Google Contacts</h2>
            <p className="descrizione">
              Salva i contatti degli ordini nella rubrica Google. Nella console Google Cloud (OAuth
              client Web, People API attiva) aggiungi questo redirect URI:
            </p>
            <code className="codice">{uriRedirect}</code>
            {/* ⚠️ Il confronto a memoria fra due stringhe lunghe è il modo in
                cui nasce `redirect_uri_mismatch`: qui si vede ESATTAMENTE
                quello che l'app manda a Google, client id compreso. */}
            <p className="descrizione" style={{ marginTop: 6 }}>
              Google risponde <code>redirect_uri_mismatch</code>?{' '}
              <a href="/api/google/connetti?mostra=1" target="_blank" rel="noopener noreferrer">
                Guarda cosa mandiamo a Google
              </a>{' '}
              e confrontalo con la console, carattere per carattere: dev&apos;essere sul client
              OAuth con lo stesso Client ID, fra gli «URI di reindirizzamento autorizzati» — non
              fra le «Origini JavaScript».
            </p>
            <label className="campo">
              <span>Client ID</span>
              <input
                name="googleClientId"
                defaultValue={config.googleClientId}
                placeholder="…apps.googleusercontent.com"
                autoComplete="off"
              />
            </label>
            <CampoSegreto nome="googleClientSecret" etichetta="Client Secret" valore={config.googleClientSecret} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {google.collegato ? (
                <span className="badge verde">collegato</span>
              ) : google.configurato ? (
                /* Il caso che prima non esisteva: la chiave c'è ma Google la
                   rifiuta. Dirlo «non collegato» e basta mandava a cercare una
                   spunta da riattivare che non c'era. */
                <span className="badge rosso">chiave rifiutata da Google</span>
              ) : (
                <span className="badge rosso">non collegato</span>
              )}
              {/* Link, non submit: prima salva le credenziali, poi collega. */}
              <a
                className="bottone secondario"
                href="/api/google/connetti"
                aria-disabled={!googleCredenziali}
                style={
                  googleCredenziali ? undefined : { pointerEvents: 'none', opacity: 0.4 }
                }
              >
                {google.configurato ? 'Ricollega Google' : 'Collega Google'}
              </a>
            </div>
            {/* Il motivo con le parole di Google, più la causa che spiega quasi
                tutti questi casi. Senza, «non collegato» è un vicolo cieco: non
                si sa se rifare il collegamento serva a qualcosa. */}
            {google.configurato && !google.collegato ? (
              <div className="avviso-errore" style={{ marginTop: 8 }}>
                <strong>Il token salvato non funziona più.</strong> Google risponde:{' '}
                <em>{google.errore || 'nessun dettaglio'}</em>.
                <br />
                Premi <strong>Ricollega Google</strong>. Se succede di nuovo dopo pochi giorni,
                la causa quasi certa è che nella console Google Cloud la schermata di consenso
                è ancora in <strong>«Testing»</strong>: lì i permessi scadono dopo{' '}
                <strong>7 giorni</strong>. Si risolve pubblicandola («In production»), non
                ricollegando ogni settimana.
              </div>
            ) : null}
            {!googleCredenziali ? (
              <p className="descrizione" style={{ marginTop: 8, marginBottom: 0 }}>
                Salva prima Client ID e Client Secret, poi il pulsante si attiva.
              </p>
            ) : null}
          </div>

          <div className="card">
            <h2>Indirizzi (Google Maps)</h2>
            <p className="descrizione">
              Con una chiave Maps, l&apos;indirizzo di consegna in «Nuovo ordine» si sceglie da un
              elenco invece di digitarlo: via, CAP, città e provincia arrivano già separati e
              giusti. ⚠️ Serve l&apos;API <strong>Places (New)</strong> abilitata sul progetto
              Google; la chiave resta sul server e non finisce mai nella pagina.
            </p>
            <CampoSegreto
              nome="googleMapsApiKey"
              etichetta="Chiave API Google Maps"
              valore={config.googleMapsApiKey}
              segnaposto="AIza…"
            />
          </div>

          <div className="card">
            <h2>Email</h2>
            <p className="descrizione">
              Le caselle di posta si gestiscono nella pagina dedicata: puoi collegarne più di una.
            </p>
            <a className="bottone secondario" href="/caselle">
              Vai a Caselle
            </a>
          </div>

          <div className="card">
            <h2>Deluxy Partner (pagamenti)</h2>
            <p className="descrizione">
              Le richieste di pagamento vengono inoltrate a Partner, che le approva e le paga.
              L&apos;invio è idempotente: rimandare la stessa richiesta non la duplica. Serve un
              importo maggiore di zero.
            </p>
            <label className="campo">
              <span>URL dell&apos;app Partner</span>
              <input
                name="partnerUrl"
                defaultValue={config.partnerUrl}
                placeholder="https://deluxy-partner.vercel.app"
              />
            </label>
            <CampoSegreto nome="partnerApiKey" etichetta="Chiave API" valore={config.partnerApiKey} />
          </div>

          <div className="card">
            <h2>Lettura AI</h2>
            <p className="descrizione">
              Serve a leggere IBAN, intestatario e importo da un messaggio o da
              un&apos;immagine nella pagina Pagamenti. Si usa <strong>OpenAI</strong> — la stessa
              chiave delle altre app Deluxy; se manca si ripiega su Claude. In ogni caso
              l&apos;IBAN letto viene verificato col codice di controllo.
            </p>
            <CampoSegreto nome="openaiApiKey" etichetta="Chiave API OpenAI" valore={config.openaiApiKey} segnaposto="sk-proj-…" />
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="campo" style={{ flex: 1 }}>
                <span>Modello per il testo</span>
                <input
                  name="openaiModello"
                  defaultValue={config.openaiModello}
                  placeholder="gpt-4o-mini"
                />
              </label>
              <label className="campo" style={{ flex: 1 }}>
                <span>Modello per le immagini</span>
                <input
                  name="openaiModelloImmagini"
                  defaultValue={config.openaiModelloImmagini}
                  placeholder="gpt-4o"
                />
              </label>
              <label className="campo" style={{ flex: 1 }}>
                <span>Modello per le risposte ai clienti</span>
                <input
                  name="openaiModelloRisposte"
                  defaultValue={config.openaiModelloRisposte}
                  placeholder="gpt-4o"
                />
              </label>
            </div>
            <p className="descrizione" style={{ marginTop: -6 }}>
              Sulle immagini serve il modello più accurato: in prova gpt-4o-mini ha letto un
              IBAN perdendo due cifre, gpt-4o l&apos;ha letto giusto.
            </p>
            <p className="descrizione" style={{ margin: '2px 0 10px' }}>
              Anche le risposte ai clienti hanno il modello grande, e per lo stesso motivo:
              con gpt-4o-mini le istruzioni di <a href="/cs-ai" style={{ textDecoration: 'underline' }}>CS AI</a>{' '}
              venivano applicate a intermittenza e, quando c&apos;era di mezzo un brand, la firma
              spariva 6 volte su 6. Con gpt-4o le stesse prove danno la firma giusta 6 su 6.
              Costa di più a messaggio, ma è il testo che leggerà un cliente.
            </p>
            <p className="descrizione" style={{ margin: '2px 0 10px' }}>
              — in alternativa — Claude (usato solo se manca la chiave OpenAI):
            </p>
            <CampoSegreto nome="anthropicApiKey" etichetta="Chiave API Anthropic" valore={config.anthropicApiKey} segnaposto="sk-ant-…" />
          </div>

          <div className="card">
            <h2>Lingue e traduzione</h2>
            <p className="descrizione">
              La lingua di un messaggio si riconosce <strong>da sola e gratis</strong>, contando
              le parole più comuni: nessuna chiamata, nessuna attesa. La <strong>traduzione</strong>{' '}
              invece costa una chiamata a OpenAI — per questo si fa solo su quello che non
              leggiamo, e solo quando qualcuno apre la conversazione.
            </p>
            <p className="descrizione">
              Spunta le lingue che <strong>leggi già</strong>: quelle non vengono mai tradotte.
              L&apos;italiano non si traduce in nessun caso.
            </p>
            {/* Le caselle non spuntate non arrivano nel form: questo campo dice
                all'azione «la sezione c'era», così può salvare anche il vuoto —
                cioè togliere una lingua, che altrimenti sarebbe impossibile. */}
            <input type="hidden" name="sezioneLingue" value="1" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '6px 0 12px' }}>
              {['inglese', 'francese', 'spagnolo', 'tedesco', 'portoghese', 'olandese'].map((l) => (
                <label
                  key={l}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <input
                    type="checkbox"
                    name="lingueLette"
                    value={l}
                    defaultChecked={lingueLette(config.lingueLette).includes(l)}
                  />
                  <span>{l}</span>
                </label>
              ))}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                name="traduzioneAuto"
                defaultChecked={config.traduzioneAuto === 'si'}
              />
              <span>
                Traduci da solo all&apos;apertura della conversazione — altrimenti resta il
                bottone «Traduci», da premere quando serve
              </span>
            </label>
            <p className="descrizione" style={{ marginTop: 10 }}>
              ⚠️ <strong>La risposta AI esce nella lingua del cliente</strong> anche con la
              traduzione automatica spenta: chi scrive in inglese si vede rispondere in inglese, e
              la lingua riconosciuta è scritta in testa alla conversazione. Quello che scrivi tu
              invece non parte mai tradotto da solo: il bottone «Traduci in …» mette la traduzione
              nel riquadro, e la mandi tu.
            </p>
          </div>

          <div className="card">
            <h2>Risposta di primo contatto</h2>
            <p className="descrizione">
              Quando un cliente scrive per la <strong>prima volta</strong>, riceve subito questo
              messaggio: sa che è arrivato e che qualcuno lo leggerà. Parte una sola volta per
              conversazione — al primo messaggio in assoluto — e <strong>non</strong> porta il nome
              di nessun operatore: nella chat è etichettato «risposta automatica».
            </p>
            <p className="descrizione">
              Vale su <strong>WhatsApp, Instagram, Messenger e la chat dei siti</strong>. ⚠️{' '}
              <strong>Non sulla posta</strong>: in una casella email arrivano newsletter, notifiche
              e spam, e rispondere da soli lì vuol dire scrivere agli spammer — o finire in un
              ping-pong infinito con un altro risponditore automatico.
            </p>
            {/* Come per le lingue: una casella non spuntata non arriva nel form,
                quindi senza questo campo la funzione si potrebbe accendere e mai
                più spegnere. */}
            <input type="hidden" name="sezionePrimoContatto" value="1" />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input
                type="checkbox"
                name="primoContattoAttivo"
                defaultChecked={config.primoContattoAttivo === 'si'}
              />
              <span>Rispondi da solo al primo messaggio</span>
            </label>
            <label className="campo">
              <span>Testo</span>
              <textarea
                name="primoContattoTesto"
                rows={4}
                defaultValue={config.primoContattoTesto}
                placeholder={TESTO_DI_RISERVA}
              />
            </label>
            <p className="descrizione" style={{ marginTop: 8, marginBottom: 0 }}>
              Lasciandolo vuoto vale il testo di riserva qui sopra. ⚠️ Non scrivere promesse che
              non dipendono da noi («ti rispondiamo entro un&apos;ora», orari di apertura): questo
              messaggio parte anche di notte e a Ferragosto, e a incassarlo è il cliente.
              ⚠️ Parte <strong>in italiano per tutti</strong>: la lingua del cliente si conosce
              solo dopo aver letto il suo messaggio, e su una frase sola il riconoscimento sbaglia
              spesso.
            </p>
          </div>

          <div className="card">
            <h2>Ricerca fornitori</h2>
            <p className="descrizione">
              Con la chiave <code>dlxs_…</code> il bottone &quot;Fornitore&quot; sugli ordini apre
              l&apos;app già autenticata (link a tempo). Senza chiave funziona lo stesso, ma
              l&apos;app chiede l&apos;accesso.
            </p>
            <label className="campo">
              <span>URL dell&apos;app</span>
              <input
                name="searchUrl"
                defaultValue={config.searchUrl}
                placeholder="https://search-deluxy.vercel.app"
              />
            </label>
            <CampoSegreto nome="searchApiKey" etichetta="Chiave API" valore={config.searchApiKey} segnaposto="dlxs_…" />
          </div>

          <div className="card">
            <h2>Archivio ordini (Deluxy Orders)</h2>
            <p className="descrizione">
              Qui teniamo solo gli ultimi 60 giorni scaricati da Shopify. Gli ordini più vecchi si
              cercano nell&apos;app Ordini, che ha tutto lo storico. Serve una chiave di sola
              lettura, creata lì con <code>npm run chiave -- messaggi</code>.
            </p>
            <label className="campo">
              <span>URL dell&apos;app Ordini</span>
              <input
                name="ordersUrl"
                defaultValue={config.ordersUrl}
                placeholder="https://deluxy-orders.vercel.app"
              />
            </label>
            <CampoSegreto nome="ordersApiKey" etichetta="Chiave API (sola lettura)" valore={config.ordersApiKey} />
          </div>

          <div className="card">
            <h2>Registro partner (Deluxy Anagrafiche)</h2>
            <p className="descrizione">
              La pagina <strong>Partner</strong> legge i partner attivi dal registro centrale a
              ogni apertura — qui non se ne tiene copia, così un partner dismesso sparisce
              subito. Serve una chiave di sola lettura, creata in Anagrafiche.
            </p>
            <label className="campo">
              <span>URL del registro</span>
              <input
                name="anagraficheUrl"
                defaultValue={config.anagraficheUrl}
                placeholder="https://deluxy-anagrafiche.vercel.app"
              />
            </label>
            <CampoSegreto nome="anagraficheApiKey" etichetta="Chiave API (sola lettura)" valore={config.anagraficheApiKey} segnaposto="dlxk_…" />
          </div>

          <div className="card">
            <h2>Widget del sito</h2>
            <p className="descrizione">
              Incolla questo snippet prima di <code>&lt;/body&gt;</code> nel sito: appare il
              bottone di chat, e le conversazioni arrivano qui in inbox. Per scegliere tema,
              colore e posizione — e vedere come viene prima di pubblicare — c&apos;è{' '}
              <Link href="/aspetto-widget">Widget dei siti</Link>.
            </p>
            <code className="codice">{snippetWidget}</code>
            <label className="campo">
              <span>Titolo del widget</span>
              <input name="widgetTitolo" defaultValue={config.widgetTitolo} placeholder="Deluxy" />
            </label>
            <label className="campo">
              <span>Messaggio di benvenuto</span>
              <input
                name="widgetMessaggio"
                defaultValue={config.widgetMessaggio}
                placeholder="Ciao! Come possiamo aiutarti?"
              />
            </label>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="bottone">Salva impostazioni</button>
        </div>
      </form>
    </>
  )
}
