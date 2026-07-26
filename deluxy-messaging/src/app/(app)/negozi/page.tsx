import { db } from '@/lib/db'
import { brandRicercaDaNegozio, prefissoDaNegozio } from '@/lib/negozi'
import { eliminaNegozioAction, salvaNegozioAction } from './actions'

export const dynamic = 'force-dynamic'

function Badge({ ok, testo }: { ok: boolean; testo: string }) {
  return <span className={`badge ${ok ? 'verde' : ''}`}>{testo}</span>
}

export default async function PaginaNegozi() {
  const negozi = await db.negozioShopify.findMany({ orderBy: { nome: 'asc' } })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Negozi Shopify</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {negozi.length} {negozi.length === 1 ? 'negozio' : 'negozi'}
        </span>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 0, maxWidth: 760 }}>
        I brand degli ordini. <strong>Gli ordini arrivano dal registro Deluxy Orders</strong>, non
        più da Shopify: qui non servono credenziali, e i brand nuovi compaiono da soli al primo
        aggiornamento. Quello che conta è la <strong>sigla</strong> usata in rubrica (FL, CK, DL) e
        il <strong>brand su Ricerca fornitori</strong>. I campi Shopify restano solo per le
        configurazioni vecchie e si possono lasciare vuoti.
      </p>

      <div className="griglia-impostazioni">
        {negozi.map((n) => (
          <div className="card" key={n.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, flex: 1 }}>{n.nome || n.dominio}</h2>
              <Badge ok={n.attivo} testo={n.attivo ? 'attivo' : 'sospeso'} />
              <Badge
                ok={!!(n.token || (n.clientId && n.clientSecret))}
                testo={n.token ? 'token' : n.clientId ? 'client creds' : 'da configurare'}
              />
            </div>

            <form action={salvaNegozioAction}>
              <input type="hidden" name="id" value={n.id} />
              <label className="campo">
                <span>Nome</span>
                <input name="nome" defaultValue={n.nome} />
              </label>
              <label className="campo">
                <span>
                  Sigla in rubrica — ora: <strong>{prefissoDaNegozio(n.nome, n.dominio, n.prefisso)}</strong>
                </span>
                <input
                  name="prefisso"
                  defaultValue={n.prefisso}
                  maxLength={4}
                  placeholder="vuoto = dedotta (FL, CK, DL)"
                />
              </label>
              <label className="campo">
                <span>
                  Brand su Ricerca fornitori — ora:{' '}
                  <strong>{brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca) || '—'}</strong>
                </span>
                <input
                  name="brandRicerca"
                  defaultValue={n.brandRicerca}
                  placeholder="vuoto = dedotto (deluxyflowers.com…)"
                />
              </label>
              <label className="campo">
                <span>Dominio</span>
                <input name="dominio" defaultValue={n.dominio} />
              </label>
              <label className="campo">
                <span>A) Admin API token statico (shpat_…)</span>
                <input
                  name="token"
                  type="password"
                  placeholder={n.token ? 'salvato — incolla per sostituire' : 'app legacy'}
                  autoComplete="off"
                />
              </label>
              <label className="campo">
                <span>B) Client ID (app Dev Dashboard)</span>
                <input name="clientId" defaultValue={n.clientId} autoComplete="off" />
              </label>
              <label className="campo">
                <span>B) Client Secret</span>
                <input
                  name="clientSecret"
                  type="password"
                  placeholder={n.clientSecret ? 'salvato — incolla per sostituire' : ''}
                  autoComplete="off"
                />
              </label>
              <button className="bottone">Salva</button>
            </form>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {/* Attiva/sospendi riusa la stessa action, cambiando solo attivo. */}
              <form action={salvaNegozioAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="nome" value={n.nome} />
                <input type="hidden" name="dominio" value={n.dominio} />
                <input type="hidden" name="clientId" value={n.clientId} />
                <input type="hidden" name="attivo" value={n.attivo ? '' : '1'} />
                <button className="bottone secondario" style={{ padding: '5px 14px', fontSize: 13 }}>
                  {n.attivo ? 'Sospendi' : 'Riattiva'}
                </button>
              </form>
              <form action={eliminaNegozioAction}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  className="bottone secondario"
                  style={{ padding: '5px 14px', fontSize: 13, color: 'var(--red)' }}
                >
                  Elimina
                </button>
              </form>
            </div>
          </div>
        ))}

        {/* Card di aggiunta */}
        <div className="card" style={{ borderStyle: 'dashed' }}>
          <h2 style={{ marginTop: 0 }}>Aggiungi un negozio</h2>
          <form action={salvaNegozioAction}>
            <label className="campo">
              <span>Nome</span>
              <input name="nome" placeholder="Deluxy Flowers" />
            </label>
            <label className="campo">
              <span>Sigla in rubrica (facoltativa)</span>
              <input name="prefisso" maxLength={4} placeholder="vuoto = dedotta (FL, CK, DL)" />
            </label>
            <label className="campo">
              <span>Dominio dello store</span>
              <input name="dominio" placeholder="fb72b1-2.myshopify.com" required />
            </label>
            <label className="campo">
              <span>A) Admin API token statico (shpat_…)</span>
              <input name="token" type="password" placeholder="app legacy" autoComplete="off" />
            </label>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '2px 0 10px' }}>
              — oppure — app Dev Dashboard:
            </p>
            <label className="campo">
              <span>B) Client ID</span>
              <input name="clientId" autoComplete="off" />
            </label>
            <label className="campo">
              <span>B) Client Secret</span>
              <input name="clientSecret" type="password" autoComplete="off" />
            </label>
            <button className="bottone">Aggiungi negozio</button>
          </form>
        </div>
      </div>
    </>
  )
}
