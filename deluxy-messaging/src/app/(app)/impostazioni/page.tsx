import { headers } from 'next/headers'
import { leggiImpostazioni } from '@/lib/impostazioni'
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
  searchParams: Promise<{ salvato?: string }>
}) {
  const { salvato } = await searchParams
  const config = await leggiImpostazioni([
    'waToken',
    'waPhoneNumberId',
    'fbPageToken',
    'igToken',
    'metaVerifyToken',
    'metaAppSecret',
    'widgetTitolo',
    'widgetMessaggio',
  ])

  // URL pubblico dell'app: da APP_URL, altrimenti dall'host della richiesta.
  const host = (await headers()).get('host') ?? 'localhost:3140'
  const base =
    process.env.APP_URL || `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`
  const urlWebhook = `${base}/api/webhooks/meta`
  const snippetWidget = `<script src="${base}/widget.js" defer></script>`

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Impostazioni</h1>
      {salvato ? <div className="avviso-ok">Impostazioni salvate.</div> : null}

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
