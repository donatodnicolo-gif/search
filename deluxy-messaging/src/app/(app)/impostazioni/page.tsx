import { headers } from 'next/headers'
import { leggiImpostazioni } from '@/lib/impostazioni'

import { redirectUri } from '@/lib/google'
import { salvaImpostazioni } from './actions'

export const dynamic = 'force-dynamic'

function BadgeConfigurato({ pieno }: { pieno: boolean }) {
  return pieno ? (
    <span className="badge verde">configurato</span>
  ) : (
    <span className="badge rosso">mancante</span>
  )
}

export default async function PaginaImpostazioni({
  searchParams,
}: {
  searchParams: Promise<{ salvato?: string; okGoogle?: string; erroreGoogle?: string }>
}) {
  const { salvato, okGoogle, erroreGoogle } = await searchParams
  const config = await leggiImpostazioni([
    'waToken',
    'waPhoneNumberId',
    'fbPageToken',
    'igToken',
    'metaVerifyToken',
    'metaAppSecret',
    'widgetTitolo',
    'widgetMessaggio',
    'googleClientId',
    'googleClientSecret',
    'googleRefreshToken',
    'ordersUrl',
    'ordersApiKey',
    'searchUrl',
    'searchApiKey',
    'anthropicApiKey',
  ])

  // URL pubblico dell'app: da APP_URL, altrimenti dall'host della richiesta.
  const host = (await headers()).get('host') ?? 'localhost:3140'
  const base =
    process.env.APP_URL || `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`
  const urlWebhook = `${base}/api/webhooks/meta`
  const snippetWidget = `<script src="${base}/widget.js" defer></script>`
  const uriRedirect = redirectUri(base)

  const googleCollegato = !!config.googleRefreshToken
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
            <label className="campo">
              <span>
                App Secret (verifica la firma dei webhook){' '}
                <BadgeConfigurato pieno={!!config.metaAppSecret} />
              </span>
              <input
                name="metaAppSecret"
                type="password"
                placeholder={config.metaAppSecret ? 'salvato — incolla per sostituire' : ''}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="card">
            <h2>WhatsApp</h2>
            <p className="descrizione">
              WhatsApp Cloud API: serve il token permanente e il Phone Number ID del numero
              Business (app Meta → WhatsApp → Configurazione API).
            </p>
            <label className="campo">
              <span>
                Token permanente <BadgeConfigurato pieno={!!config.waToken} />
              </span>
              <input
                name="waToken"
                type="password"
                placeholder={config.waToken ? 'salvato — incolla per sostituire' : ''}
                autoComplete="off"
              />
            </label>
            <label className="campo">
              <span>Phone Number ID</span>
              <input name="waPhoneNumberId" defaultValue={config.waPhoneNumberId} />
            </label>
          </div>

          <div className="card">
            <h2>Messenger</h2>
            <p className="descrizione">
              Page Access Token della pagina Facebook (permessi pages_messaging), per leggere e
              rispondere ai messaggi della pagina.
            </p>
            <label className="campo">
              <span>
                Page Access Token <BadgeConfigurato pieno={!!config.fbPageToken} />
              </span>
              <input
                name="fbPageToken"
                type="password"
                placeholder={config.fbPageToken ? 'salvato — incolla per sostituire' : ''}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="card">
            <h2>Instagram</h2>
            <p className="descrizione">
              Token della pagina collegata all&apos;account Instagram professionale (permessi
              instagram_manage_messages). Può essere lo stesso token di Messenger.
            </p>
            <label className="campo">
              <span>
                Token <BadgeConfigurato pieno={!!config.igToken} />
              </span>
              <input
                name="igToken"
                type="password"
                placeholder={config.igToken ? 'salvato — incolla per sostituire' : ''}
                autoComplete="off"
              />
            </label>
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
            <label className="campo">
              <span>Client ID</span>
              <input
                name="googleClientId"
                defaultValue={config.googleClientId}
                placeholder="…apps.googleusercontent.com"
                autoComplete="off"
              />
            </label>
            <label className="campo">
              <span>
                Client Secret <BadgeConfigurato pieno={!!config.googleClientSecret} />
              </span>
              <input
                name="googleClientSecret"
                type="password"
                placeholder={config.googleClientSecret ? 'salvato — incolla per sostituire' : ''}
                autoComplete="off"
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {googleCollegato ? (
                <span className="badge verde">collegato</span>
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
                {googleCollegato ? 'Ricollega Google' : 'Collega Google'}
              </a>
            </div>
            {!googleCredenziali ? (
              <p className="descrizione" style={{ marginTop: 8, marginBottom: 0 }}>
                Salva prima Client ID e Client Secret, poi il pulsante si attiva.
              </p>
            ) : null}
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
            <h2>Lettura AI (Claude)</h2>
            <p className="descrizione">
              Serve a leggere IBAN, intestatario e importo da un messaggio o da un&apos;immagine
              nella pagina Pagamenti. La chiave si crea su console.anthropic.com; l&apos;IBAN letto
              viene comunque verificato col codice di controllo.
            </p>
            <label className="campo">
              <span>
                Chiave API Anthropic <BadgeConfigurato pieno={!!config.anthropicApiKey} />
              </span>
              <input
                name="anthropicApiKey"
                type="password"
                placeholder={
                  config.anthropicApiKey ? 'salvata — incolla per sostituire' : 'sk-ant-…'
                }
                autoComplete="off"
              />
            </label>
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
            <label className="campo">
              <span>
                Chiave API <BadgeConfigurato pieno={!!config.searchApiKey} />
              </span>
              <input
                name="searchApiKey"
                type="password"
                placeholder={config.searchApiKey ? 'salvata — incolla per sostituire' : 'dlxs_…'}
                autoComplete="off"
              />
            </label>
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
            <label className="campo">
              <span>
                Chiave API (sola lettura) <BadgeConfigurato pieno={!!config.ordersApiKey} />
              </span>
              <input
                name="ordersApiKey"
                type="password"
                placeholder={config.ordersApiKey ? 'salvata — incolla per sostituire' : ''}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="card">
            <h2>Widget del sito</h2>
            <p className="descrizione">
              Incolla questo snippet prima di <code>&lt;/body&gt;</code> nel sito: appare il
              bottone di chat, e le conversazioni arrivano qui in inbox.
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
