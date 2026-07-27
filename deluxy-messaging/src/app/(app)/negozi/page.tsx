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
        I brand degli ordini. <strong>Gli ordini li scarica da Shopify solo l&apos;app Deluxy
        Orders</strong>, e quest&apos;app li legge da lì: è una regola, non una preferenza — due
        sorgenti vorrebbero dire due verità sullo stesso ordine. Per questo qui non si chiedono
        credenziali Shopify: non servono e non potrebbero servire. I brand nuovi compaiono da soli
        al primo aggiornamento; quello che si imposta è la <strong>sigla</strong> usata in rubrica
        (FL, CK, DL) e il <strong>brand su Ricerca fornitori</strong>.
      </p>

      <div className="griglia-impostazioni">
        {negozi.map((n) => (
          <div className="card" key={n.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, flex: 1 }}>{n.nome || n.dominio}</h2>
              <Badge ok={n.attivo} testo={n.attivo ? 'attivo' : 'sospeso'} />
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
              {/* Il numero WhatsApp non si imposta piu qui: sta in Numeri WhatsApp,
                  perche i numeri sono piu di uno e ognuno ha il suo account.
                  Due posti per lo stesso dato = due verita che divergono. */}
              <button className="bottone">Salva</button>
            </form>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {/* Attiva/sospendi riusa la stessa action, cambiando solo attivo. */}
              <form action={salvaNegozioAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="nome" value={n.nome} />
                <input type="hidden" name="dominio" value={n.dominio} />
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
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '2px 0 10px' }}>
              Di solito non serve aggiungerli a mano: un brand nuovo di Deluxy Orders compare da
              solo al primo aggiornamento.
            </p>
            <button className="bottone">Aggiungi negozio</button>
          </form>
        </div>
      </div>
    </>
  )
}
