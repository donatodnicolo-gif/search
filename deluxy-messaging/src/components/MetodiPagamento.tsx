'use client'
import { useCallback, useEffect, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import { Conferma } from '@/components/Conferma'
import { descriviMetodo, type ComeNasce, type Metodo, type QuandoDovuto } from '@/lib/metodi-regole'

// ⭐ 11/09/2026 — METODI DI PAGAMENTO (richiesta dell'utente: «in nuovo ordine
// la terza opzione è altri metodi di pagamento: consentimi su impostazioni di
// stabilire per ogni metodo che viene elencato le specifiche»).
//
// Una scheda per metodo. Le specifiche sono quattro, e sono in ordine di
// conseguenza — dalla più pesante alla più leggera:
//   1. COME NASCE L'ORDINE: da incassare o già pagato. Questa muove i soldi.
//   2. QUANDO È DOVUTO (solo se da incassare): alla consegna o alla ricezione.
//   3. CHE COSA SI DICE AL CLIENTE: le istruzioni (l'IBAN, «paga al valet»).
//   4. CHE COSA RESTA SCRITTO: la nota per chi consegna e l'attributo per le
//      macchine.
// Sotto ogni scheda, in chiaro, la frase che dice che cosa succederà: la stessa
// che l'operatore leggerà in Nuovo ordine prima di creare l'ordine.
//
// ⚠️ Le regole non stanno qui: stanno in src/lib/metodi-pagamento.ts, usate
// anche dal server (la validazione è la stessa, e il server non si fida).

type Negozio = { id: string; nome: string; dominio: string }

const VUOTO: Omit<Metodo, 'id'> = {
  nome: '',
  attivo: true,
  posizione: 100,
  negozioId: null,
  comeNasce: 'da-incassare',
  quandoDovuto: 'consegna',
  istruzioni: '',
  notaConsegna: '',
  attributo: '',
}

export function MetodiPagamento({ amministratore }: { amministratore: boolean }) {
  const [metodi, setMetodi] = useState<Metodo[] | null>(null)
  const [negozi, setNegozi] = useState<Negozio[]>([])
  const [nota, setNota] = useState('')
  const [errore, setErrore] = useState('')
  const [nuovo, setNuovo] = useState<Omit<Metodo, 'id'> | null>(null)

  const carica = useCallback(async () => {
    const e = await chiediJson<{ metodi: Metodo[] }>('/api/metodi-pagamento')
    if (e.stato !== 'ok') return setNota(frasePerEsito(e))
    setMetodi(e.dati.metodi)
    setNota(
      e.dati.metodi.length
        ? ''
        : 'Nessun metodo: finché questa pagina è vuota, in Nuovo ordine la terza scelta non compare.'
    )
  }, [])

  useEffect(() => {
    carica()
    // ⚠️ I negozi servono per il campo «vale su»: un metodo può essere di UN
    // negozio solo («Bank Deposit» ce l'ha solo Cake).
    chiediJson<{ negozi?: Negozio[] }>('/api/orari-negozi').then((e) => {
      if (e.stato === 'ok') {
        setNegozi(
          (e.dati.negozi as unknown as { negozio: Negozio }[] | undefined)?.map((r) => r.negozio) ?? []
        )
      }
    })
  }, [carica])

  async function salva(m: Omit<Metodo, 'id'> & { id?: string }) {
    setErrore('')
    const res = await fetch('/api/metodi-pagamento', {
      method: m.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    })
    const d = (await res.json().catch(() => ({}))) as { errore?: string }
    if (!res.ok) {
      setErrore(d.errore || 'Non sono riuscito a salvare.')
      return false
    }
    setNuovo(null)
    await carica()
    return true
  }

  async function togli(id: string) {
    setErrore('')
    const res = await fetch('/api/metodi-pagamento?id=' + encodeURIComponent(id), { method: 'DELETE' })
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore || 'Non sono riuscito a togliere il metodo.')
      return
    }
    await carica()
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Metodi di pagamento</h1>
          <p className="page-sub">
        I modi di pagare che si possono scegliere in <a href="/nuovo-ordine">Nuovo ordine</a>, sotto
        «Altri metodi di pagamento». Per ognuno si stabilisce <strong>che cosa succede davvero</strong>:
        se l&apos;ordine nasce da incassare o già pagato, quando il pagamento è dovuto, che cosa si
            dice al cliente e che cosa resta scritto per chi consegna.
          </p>
        </div>
      </div>

      {/* ⚠️⚠️ Si dice subito dove NON arriva, perché non è dove ci si aspetta:
          Shopify non lascia scegliere il gateway chiudendo una bozza. Chi crede
          che qui si impostino i gateway del negozio cerca per mezz'ora un campo
          che non può esistere. */}
      <p className="descrizione">
        <span>
          ⚠️ Queste righe sono <strong>nostre</strong>, non sono i gateway di Shopify: Shopify non lascia
          scegliere il mezzo quando si chiude una bozza. Quello che governano è come nasce l&apos;ordine
          (da incassare o pagato), quando è dovuto, e che cosa resta scritto nella nota e negli
          attributi — che è poi quello che leggono chi consegna e la piattaforma consegne.
        </span>
      </p>

      {nota ? <p className="page-sub">{nota}</p> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {amministratore ? (
        <div style={{ margin: '12px 0' }}>
          <button className="bottone" onClick={() => setNuovo({ ...VUOTO })} disabled={Boolean(nuovo)}>
            + Nuovo metodo
          </button>
        </div>
      ) : (
        <p className="page-sub">Solo un amministratore può cambiarli: qui li vedi come sono.</p>
      )}

      {nuovo ? (
        <SchedaMetodo
          metodo={{ id: '', ...nuovo }}
          negozi={negozi}
          soloLettura={false}
          nuovo
          onSalva={salva}
          onAnnulla={() => setNuovo(null)}
        />
      ) : null}

      {(metodi ?? []).map((m) => (
        <SchedaMetodo
          key={m.id}
          metodo={m}
          negozi={negozi}
          soloLettura={!amministratore}
          onSalva={salva}
          onTogli={() => togli(m.id)}
        />
      ))}
    </div>
  )
}

function SchedaMetodo({
  metodo,
  negozi,
  soloLettura,
  nuovo = false,
  onSalva,
  onTogli,
  onAnnulla,
}: {
  metodo: Metodo
  negozi: Negozio[]
  soloLettura: boolean
  nuovo?: boolean
  onSalva: (m: Omit<Metodo, 'id'> & { id?: string }) => Promise<boolean>
  onTogli?: () => void
  onAnnulla?: () => void
}) {
  const [d, setD] = useState<Metodo>(metodo)
  const [salvando, setSalvando] = useState(false)
  const [chiediTogli, setChiediTogli] = useState(false)
  useEffect(() => setD(metodo), [metodo])
  const cambiato = JSON.stringify(d) !== JSON.stringify(metodo)
  const set = <K extends keyof Metodo>(k: K, v: Metodo[K]) => setD((x) => ({ ...x, [k]: v }))

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{d.nome.trim() || (nuovo ? 'Metodo nuovo' : '—')}</h2>
        <span className={`badge ${d.comeNasce === 'pagato' ? '' : 'verde'}`}>
          {d.comeNasce === 'pagato' ? 'nasce pagato' : 'nasce da incassare'}
        </span>
        {!d.attivo ? <span className="badge">spento</span> : null}
        {d.negozioId ? (
          <span className="badge">{negozi.find((n) => n.id === d.negozioId)?.nome ?? 'un negozio solo'}</span>
        ) : null}
      </div>

      <div className="griglia-impostazioni" style={{ marginTop: 10 }}>
        <label className="campo">
          <span>Nome</span>
          <input
            value={d.nome}
            disabled={soloLettura}
            placeholder="Contanti alla consegna"
            onChange={(e) => set('nome', e.target.value)}
          />
          <span className="cella-sub">Si legge nella tendina e finisce nella nota dell&apos;ordine.</span>
        </label>

        {/* ── 1. LA SPECIFICA CHE VALE SUI SOLDI ──
            ⚠️⚠️ Prima di tutte, perché è l'unica che può dichiarare incassati
            dei soldi che nessuno ha preso. */}
        <label className="campo">
          <span>Come nasce l&apos;ordine</span>
          <select
            value={d.comeNasce}
            disabled={soloLettura}
            onChange={(e) => {
              const v = e.target.value as ComeNasce
              set('comeNasce', v)
              // Un ordine già pagato non ha niente da incassare: la riga per chi
              // consegna si toglie da sé invece di restare a mentire.
              if (v === 'pagato') set('notaConsegna', '')
            }}
          >
            <option value="da-incassare">Da incassare — su Shopify resta «in attesa di pagamento»</option>
            <option value="pagato">Già pagato — l&apos;ordine nasce pagato</option>
          </select>
        </label>

        {d.comeNasce === 'da-incassare' ? (
          <label className="campo">
            <span>Quando è dovuto</span>
            <select
              value={d.quandoDovuto}
              disabled={soloLettura}
              onChange={(e) => set('quandoDovuto', e.target.value as QuandoDovuto)}
            >
              <option value="consegna">Alla consegna (contrassegno)</option>
              <option value="ricevuta">Alla ricezione della richiesta</option>
            </select>
            <span className="cella-sub">
              Sono i termini di pagamento di Shopify: sono loro a far nascere l&apos;ordine da incassare.
            </span>
          </label>
        ) : null}

        <label className="campo">
          <span>Vale su</span>
          <select
            value={d.negozioId ?? ''}
            disabled={soloLettura}
            onChange={(e) => set('negozioId', e.target.value || null)}
          >
            <option value="">Tutti i negozi</option>
            {negozi.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome || n.dominio}
              </option>
            ))}
          </select>
        </label>

        <label className="campo" style={{ maxWidth: 120 }}>
          <span>Posizione</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={d.posizione}
            disabled={soloLettura}
            onChange={(e) => set('posizione', Number(e.target.value))}
          />
          <span className="cella-sub">Piccolo = in alto.</span>
        </label>

        <label className="campo" style={{ alignSelf: 'end' }}>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={d.attivo}
              disabled={soloLettura}
              onChange={(e) => set('attivo', e.target.checked)}
            />
            Attivo
          </span>
          <span className="cella-sub">Spento non compare più nel modulo.</span>
        </label>
      </div>

      <label className="campo" style={{ marginTop: 8 }}>
        <span>Che cosa dire al cliente</span>
        <textarea
          rows={2}
          value={d.istruzioni}
          disabled={soloLettura}
          placeholder="Es. Bonifico a IT00… entro 3 giorni, causale il numero d'ordine."
          onChange={(e) => set('istruzioni', e.target.value)}
        />
        <span className="cella-sub">
          Si legge nel modulo prima di creare l&apos;ordine e finisce nella nota: è quello che
          l&apos;operatore ripeterà al cliente.
        </span>
      </label>

      {d.comeNasce === 'da-incassare' ? (
        <label className="campo">
          <span>Riga per chi consegna</span>
          <textarea
            rows={2}
            value={d.notaConsegna}
            disabled={soloLettura}
            placeholder="DA INCASSARE ALLA CONSEGNA — contanti: l'ordine non è pagato."
            onChange={(e) => set('notaConsegna', e.target.value)}
          />
          {/* ⚠️ L'importo non si scrive qui: lo sa Shopify, e un numero
              ricopiato a mano prima o poi diverge da quello vero. */}
          <span className="cella-sub">
            In chiaro nella nota dell&apos;ordine, per chi consegna. L&apos;importo non scriverlo: lo porta
            Shopify.
          </span>
        </label>
      ) : null}

      <label className="campo" style={{ maxWidth: 320 }}>
        <span>Attributo per le macchine</span>
        <input
          value={d.attributo}
          disabled={soloLettura}
          placeholder="Pagamento_Alla_Consegna"
          onChange={(e) => set('attributo', e.target.value)}
        />
        <span className="cella-sub">
          Lo legge Orders e da lì la piattaforma consegne (con{' '}
          <code>Pagamento_Alla_Consegna</code> nasce la «Vendita con Pagamento alla Consegna»).
          Vuoto = nessun attributo.
        </span>
      </label>

      <p className="cella-sub" style={{ marginTop: 10 }}>
        <strong>Scegliendolo:</strong> {descriviMetodo(d)}
      </p>

      {!soloLettura ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          {/* ⚠️ L'azione pericolosa a sinistra, la primaria a destra (Libro UX §4). */}
          {onTogli ? (
            <button className="bottone secondario" onClick={() => setChiediTogli(true)}>
              Togli
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          {onAnnulla ? (
            <button className="bottone secondario" onClick={onAnnulla}>
              Annulla
            </button>
          ) : null}
          <button
            className="bottone"
            disabled={salvando || (!cambiato && !nuovo)}
            onClick={async () => {
              setSalvando(true)
              await onSalva(nuovo ? { ...d, id: undefined } : d)
              setSalvando(false)
            }}
          >
            {salvando ? 'Salvo…' : nuovo ? 'Crea il metodo' : 'Salva'}
          </button>
        </div>
      ) : null}

      {chiediTogli ? (
        <Conferma
          titolo={`Togliere «${d.nome}»?`}
          verbo="Togli il metodo"
          pericoloso
          annulla="Spegnilo invece"
          onConferma={() => {
            setChiediTogli(false)
            onTogli?.()
          }}
          onAnnulla={async () => {
            setChiediTogli(false)
            await onSalva({ ...d, attivo: false })
          }}
          onChiudi={() => setChiediTogli(false)}
        >
          <p>
            Sparisce dal modulo. ⚠️ Gli ordini già fatti con questo metodo <strong>non cambiano</strong>: il
            nome resta scritto nella loro nota, ma da qui non si saprà più con che regola erano nati.
          </p>
          <p>Se serve solo smettere di usarlo, <strong>spegnerlo</strong> fa la stessa cosa e non perde niente.</p>
        </Conferma>
      ) : null}
    </div>
  )
}
