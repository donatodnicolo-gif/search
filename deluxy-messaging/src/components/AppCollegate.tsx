'use client'
import { useCallback, useEffect, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'

// ⭐ 11/09/2026 — APP COLLEGATE (richiesta dell'utente: «dammi possibilità di
// aggiungere tue chiavi ad altre app»).
//
// Una riga per app sorella: a che cosa serve qui dentro, dove abita la chiave,
// se c'è, e com'è andata l'ultima prova. Le schermate per metterle esistevano
// già ma erano sparse in cinque riquadri di Impostazioni, ognuno con parole sue
// — e per Transactions non esisteva affatto.
//
// ⚠️⚠️ La chiave non torna MAI a schermo: si vede solo se c'è. Un campo che
// ripropone un segreto è un segreto che finisce negli screenshot, nei log del
// browser e nelle mani di chi passa dietro la sedia.

type Riga = {
  chiave: string
  nome: string
  aCosaServe: string
  url: string
  urlDefault: string
  haChiave: boolean
  dove: 'ambiente' | 'database' | 'nessuna'
  stato: 'da-collegare' | 'da-provare' | 'non-risponde' | 'collegata'
  provataIl: string
  provaEsito: string
  soloAmbiente?: boolean
}

const COLORE: Record<Riga['stato'], string> = {
  collegata: 'verde',
  'non-risponde': 'rosso',
  'da-provare': '',
  'da-collegare': '',
}
const PAROLA: Record<Riga['stato'], string> = {
  collegata: 'collegata',
  'non-risponde': 'non risponde',
  'da-provare': 'da provare',
  'da-collegare': 'da collegare',
}

export function AppCollegate() {
  const [righe, setRighe] = useState<Riga[] | null>(null)
  const [nota, setNota] = useState('')
  const [errore, setErrore] = useState('')
  const [inProva, setInProva] = useState('')

  const carica = useCallback(async () => {
    const e = await chiediJson<{ app: Riga[] }>('/api/app-collegate')
    if (e.stato !== 'ok') return setNota(frasePerEsito(e))
    setRighe(e.dati.app)
  }, [])
  useEffect(() => {
    carica()
  }, [carica])

  async function prova(app: string) {
    setErrore('')
    setInProva(app)
    const res = await fetch('/api/app-collegate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app }),
    })
    const d = (await res.json().catch(() => ({}))) as { errore?: string; app?: Riga[] }
    setInProva('')
    if (!res.ok) return setErrore(d.errore || 'Prova non riuscita.')
    if (d.app) setRighe(d.app)
  }

  async function salva(app: string, dati: { url?: string; apiKey?: string; svuota?: boolean }) {
    setErrore('')
    const res = await fetch('/api/app-collegate', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, ...dati }),
    })
    const d = (await res.json().catch(() => ({}))) as { errore?: string; app?: Riga[] }
    if (!res.ok) {
      setErrore(d.errore || 'Non sono riuscito a salvare.')
      return false
    }
    if (d.app) setRighe(d.app)
    return true
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">App collegate</h1>
          <p className="page-sub">
            Le app sorelle a cui il Customer Service parla, e con che chiave. Per ognuna:{' '}
            <strong>a che cosa serve qui dentro</strong>, dove abita la chiave, e un bottone che{' '}
            <strong>prova davvero</strong> il collegamento — perché «c&apos;è una chiave» e «risponde» non
            sono la stessa cosa.
          </p>
        </div>
      </div>

      <p className="descrizione" style={{ marginTop: 0 }}>
        ⚠️ Le chiavi non si rileggono da qui: si vede solo se ci sono. Un campo che ripropone un segreto
        è un segreto che finisce negli screenshot. Per cambiarne una, si riscrive.
      </p>

      {nota ? <div className="avviso-errore">{nota}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}
      {righe === null && !nota ? <p style={{ color: 'var(--text-secondary)' }}>Carico…</p> : null}

      {(righe ?? []).map((r) => (
        <SchedaApp
          key={r.chiave}
          riga={r}
          inProva={inProva === r.chiave}
          onProva={() => prova(r.chiave)}
          onSalva={(d) => salva(r.chiave, d)}
        />
      ))}
    </div>
  )
}

function SchedaApp({
  riga,
  inProva,
  onProva,
  onSalva,
}: {
  riga: Riga
  inProva: boolean
  onProva: () => void
  onSalva: (d: { url?: string; apiKey?: string; svuota?: boolean }) => Promise<boolean>
}) {
  const [url, setUrl] = useState(riga.url)
  const [apiKey, setApiKey] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setUrl(riga.url), [riga.url])

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{riga.nome}</h2>
        <span className={`badge ${COLORE[riga.stato]}`}>{PAROLA[riga.stato]}</span>
        {riga.haChiave ? (
          <span className="badge">
            chiave {riga.dove === 'ambiente' ? 'nell’ambiente' : 'nel database'}
          </span>
        ) : null}
      </div>
      <p className="descrizione" style={{ margin: '6px 0' }}>{riga.aCosaServe}</p>

      {/* ⚠️ L'esito dell'ultima prova resta scritto, con la data: la schermata
          di Scout lo perdeva alla chiusura, e la volta dopo nessuno sapeva più
          se quella prova fosse mai stata fatta. */}
      {riga.provaEsito ? (
        <p className="cella-sub" style={{ color: 'var(--red)' }}>
          Ultima prova{riga.provataIl ? ` (${new Date(riga.provataIl).toLocaleString('it-IT')})` : ''}:{' '}
          {riga.provaEsito}
        </p>
      ) : riga.provataIl ? (
        <p className="cella-sub">
          Provata il {new Date(riga.provataIl).toLocaleString('it-IT')}: rispondeva.
        </p>
      ) : (
        <p className="cella-sub">Mai provata da qui.</p>
      )}

      {riga.soloAmbiente ? (
        // ⚠️⚠️ Transactions: le sue credenziali fanno uscire denaro e stanno
        // SOLO nell'ambiente, mai nel database — che è condiviso con altre
        // tredici app. Non è una mancanza della schermata: è una decisione, e
        // qui si dice anche come si fa, perché altrimenti «non si può» diventa
        // «nessuno sa dove».
        <div className="nota-ambiente">
          <p className="cella-sub" style={{ margin: 0 }}>
            <strong>Le credenziali di questa app non si scrivono da qui, di proposito</strong>: fanno
            uscire denaro, e il database è condiviso con le altre app dell&apos;ecosistema. Vivono
            nell&apos;ambiente — <code>TRANSACTIONS_API_KEY</code> e <code>TRANSACTIONS_HMAC_SECRET</code>{' '}
            — e si mettono con:
          </p>
          <pre className="blocco-comando">
            npx vercel env add TRANSACTIONS_API_KEY production{'\n'}
            npx vercel env add TRANSACTIONS_HMAC_SECRET production
          </pre>
          <p className="cella-sub" style={{ margin: 0 }}>
            Per farle valere anche <strong>in locale</strong> (gli script del repo), le stesse due righe
            nel <code>.env</code> dell&apos;app — che è in <code>.gitignore</code> e non va mai committato.
            La chiave la genera Transactions, non questa app.
          </p>
        </div>
      ) : (
        <div className="griglia-impostazioni" style={{ marginTop: 8 }}>
          <label className="campo">
            <span>Indirizzo</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={riga.urlDefault} />
            <span className="cella-sub">Solo https. Vuoto = {riga.urlDefault}</span>
          </label>
          <label className="campo">
            <span>Chiave</span>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder={riga.haChiave ? '•••••••• (c’è: lascia vuoto per non toccarla)' : 'incolla la chiave'}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="cella-sub">
              {riga.dove === 'ambiente'
                ? '⚠️ Adesso vince quella dell’ambiente: quello che scrivi qui resta inerte finché c’è.'
                : 'Si salva cifrata. Vuota = non la tocco.'}
            </span>
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        {!riga.soloAmbiente && riga.haChiave && riga.dove === 'database' ? (
          <button
            className="bottone secondario"
            onClick={async () => {
              setSalvando(true)
              await onSalva({ svuota: true })
              setSalvando(false)
            }}
          >
            Togli la chiave
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        <button className="bottone secondario" onClick={onProva} disabled={inProva || !riga.haChiave}>
          {inProva ? 'Provo…' : 'Prova il collegamento'}
        </button>
        {!riga.soloAmbiente ? (
          <button
            className="bottone"
            disabled={salvando || (url === riga.url && !apiKey.trim())}
            onClick={async () => {
              setSalvando(true)
              const ok = await onSalva({ url, apiKey })
              if (ok) setApiKey('')
              setSalvando(false)
            }}
          >
            {salvando ? 'Salvo…' : 'Salva'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
