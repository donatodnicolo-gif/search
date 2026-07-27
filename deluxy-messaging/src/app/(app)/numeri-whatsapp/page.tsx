import { db } from '@/lib/db'
import { numeriCollegati } from '@/lib/numeri-whatsapp'
import { DiagnosiWhatsApp } from '@/components/DiagnosiWhatsApp'
import { RegistraNumero } from '@/components/RegistraNumero'
import { salvaNumeroAction, eliminaNumeroAction } from './actions'

export const dynamic = 'force-dynamic'

// I numeri WhatsApp Business collegati, uno per marchio.
//
// Prima la configurazione era singola (un token e un Phone Number ID nelle
// Impostazioni): con due marchi si rispondeva a tutti dal numero impostato,
// cioè per metà dei clienti dal marchio sbagliato.

export default async function PaginaNumeriWhatsApp() {
  const [numeri, negozi] = await Promise.all([
    numeriCollegati(),
    db.negozioShopify.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ])

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Numeri WhatsApp</h1>
          <p className="page-sub">
            Un numero per marchio. Il messaggio che arriva su una linea resta su quella: in Inbox
            si vede a chi ha scritto il cliente, e la risposta esce dallo stesso numero — non da
            un altro marchio del gruppo.
          </p>
        </div>
      </div>

      {numeri.length === 0 ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Nessun numero collegato</h2>
          <p className="descrizione">
            Aggiungi il primo qui sotto. Il <strong>Phone Number ID</strong> si trova nell&apos;app
            Meta → WhatsApp → Configurazione API; il <strong>WhatsApp Business Account ID</strong>{' '}
            è il numero lungo sotto il nome dell&apos;account in WhatsApp Manager.
          </p>
        </div>
      ) : null}

      {numeri.map((n) => (
        <div className="card" key={n.id} style={{ marginBottom: 14, opacity: n.attivo ? 1 : 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{n.nome}</h2>
            {n.brand ? <span className="badge">{n.brand}</span> : null}
            {!n.attivo ? <span className="badge rosso">sospeso</span> : null}
            {!n.tokenProprio ? (
              <span className="cella-sub">token generale (Impostazioni)</span>
            ) : null}
          </div>

          <form action={salvaNumeroAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={n.id} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="campo">
                <span>Nome (come lo chiami tu)</span>
                <input name="nome" defaultValue={n.nome} />
              </label>
              <label className="campo">
                <span>Numero visibile al cliente</span>
                <input name="numeroVisibile" defaultValue={n.numeroVisibile} placeholder="+39 …" />
              </label>
              <label className="campo">
                <span>Phone Number ID</span>
                <input name="phoneNumberId" defaultValue={n.phoneNumberId} inputMode="numeric" />
              </label>
              <label className="campo">
                <span>WhatsApp Business Account ID</span>
                <input name="wabaId" defaultValue={n.wabaId} inputMode="numeric" />
              </label>
              <label className="campo">
                <span>Marchio</span>
                <select name="negozioId" defaultValue={n.negozioId ?? ''}>
                  <option value="">Nessuno</option>
                  {negozi.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Token di questo numero (facoltativo)</span>
                <input
                  name="token"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    n.tokenProprio ? 'salvato — incolla per sostituire' : 'vuoto = token generale'
                  }
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="bottone">Salva</button>
            </div>
          </form>

          <RegistraNumero phoneNumberId={n.phoneNumberId} etichetta={n.brand || n.nome} />

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {/* Sospendi/riattiva riusa la stessa action cambiando solo `attivo`. */}
            <form action={salvaNumeroAction}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="nome" value={n.nome} />
              <input type="hidden" name="phoneNumberId" value={n.phoneNumberId} />
              <input type="hidden" name="numeroVisibile" value={n.numeroVisibile} />
              <input type="hidden" name="wabaId" value={n.wabaId} />
              <input type="hidden" name="negozioId" value={n.negozioId ?? ''} />
              <input type="hidden" name="attivo" value={n.attivo ? '0' : '1'} />
              <button className="bottone secondario mini">
                {n.attivo ? 'Sospendi' : 'Riattiva'}
              </button>
            </form>
            <form action={eliminaNumeroAction}>
              <input type="hidden" name="id" value={n.id} />
              <button className="bottone secondario mini" style={{ color: 'var(--red)' }}>
                Elimina
              </button>
            </form>
          </div>
        </div>
      ))}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Aggiungi un numero</h2>
        <form action={salvaNumeroAction}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Nome</span>
              <input name="nome" placeholder="Deluxy Flowers" />
            </label>
            <label className="campo">
              <span>Numero visibile al cliente</span>
              <input name="numeroVisibile" placeholder="+39 …" />
            </label>
            <label className="campo">
              <span>Phone Number ID</span>
              <input name="phoneNumberId" inputMode="numeric" placeholder="Meta → Configurazione API" />
            </label>
            <label className="campo">
              <span>WhatsApp Business Account ID</span>
              <input name="wabaId" inputMode="numeric" placeholder="WhatsApp Manager" />
            </label>
            <label className="campo">
              <span>Marchio</span>
              <select name="negozioId" defaultValue="">
                <option value="">Nessuno</option>
                {negozi.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Token di questo numero (facoltativo)</span>
              <input
                name="token"
                type="password"
                autoComplete="off"
                placeholder="vuoto = token generale delle Impostazioni"
              />
            </label>
          </div>
          <button className="bottone">Aggiungi</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Non arrivano i messaggi?</h2>
        <p className="descrizione">
          Il controllo interroga Meta con le credenziali salvate e dice a che punto si ferma: la
          domanda che conta è se la nostra app è <strong>iscritta</strong> al WhatsApp Business —
          senza quella, Meta non manda niente per quanto il webhook risulti verificato.
        </p>
        <DiagnosiWhatsApp />
      </div>
    </main>
  )
}
