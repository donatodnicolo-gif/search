'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChipsPeriodo } from './ChipsPeriodo'
import { DettaglioOrdine } from './DettaglioOrdine'
import type { Periodo } from '@/lib/periodo'
import {
  STATI_DA_LAVORARE,
  STATI_RIMBORSO,
  STATI_STORICO,
  avvisoPagamento,
  azioneRimborso,
  coloreStatoRimborso,
  nomeStatoRimborso,
  soldi,
} from '@/lib/rimborsi'

// Le richieste di rimborso. Questa pagina NON rimborsa: registra chi lo ha
// chiesto, chi lo ha approvato e come è stato reso. I soldi li muove una
// persona, da Shopify o dalla banca.

type Rimborso = {
  id: string
  ordineId: string
  ordineNumero: string
  negozioNome: string
  clienteNome: string
  importoOrdine: number
  importo: number
  valuta: string
  tipo: string
  motivo: string
  stato: string
  richiestoDa: string
  decisoDa: string
  esito: string
  creatoIl: string
}

/**
 * Quello che risponde `GET /api/rimborsi/[id]/shopify`: che cosa succederebbe
 * a premere «Conferma il rimborso», senza che succeda.
 */
type Anteprima = {
  ok?: boolean
  /** Quando `ok` è falso: perché il rimborso non partirebbe. */
  stato?: string
  messaggio?: string
  ordineNome?: string
  restante?: number
  valuta?: string
  /** Quanto riceve il cliente, nella valuta con cui ha pagato. */
  importoCliente?: number
  valutaCliente?: string
  /** Il cliente ha pagato in una valuta diversa da quella del negozio. */
  conversione?: boolean
  incassi?: number
}

/**
 * ⭐ 11/09/2026 — LE DUE SEZIONI (utente: «crea una sezione storico dove far
 * andare i rimborsi approvati o meno»).
 *
 * ⚠️⚠️ «Approvato» NON è storico: la decisione è presa, ma i soldi al cliente
 * non sono ancora usciti. Toglierlo dalla coda vorrebbe dire promettere un
 * rimborso e poi dimenticarsene — il caso che questa pagina esiste per evitare.
 * Passa in storico quando è «Rimborsato».
 */
const VISTE = [
  { chiave: 'aperti' as const, nome: 'Da lavorare', spiega: 'Da approvare, e approvati con i soldi ancora dentro' },
  { chiave: 'storico' as const, nome: 'Storico', spiega: 'Finiti: rimborsati, rifiutati, annullati' },
  { chiave: 'tutti' as const, nome: 'Tutti', spiega: 'Ogni richiesta, per cercare' },
]

export type PrefillRimborso = {
  ordineId?: string
  ordineNumero?: string
  negozioNome?: string
  clienteNome?: string
  telefono?: string
  email?: string
  importoOrdine?: string
  statoPagamento?: string
}

const VUOTO = {
  id: '',
  ordineId: '',
  ordineNumero: '',
  negozioNome: '',
  clienteNome: '',
  telefono: '',
  email: '',
  importoOrdine: 0,
  importo: '',
  motivo: '',
  note: '',
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function RimborsiLista({
  prefill,
  ruolo = 'operatore',
}: {
  prefill?: PrefillRimborso
  /** ⚠️ Il rimborso VERO lo puo far partire solo un admin: qui serve a non
   *  mostrare un bottone che poi la rotta rifiuterebbe. Il controllo che conta
   *  resta quello del server. */
  ruolo?: string
}) {
  const [rimborsi, setRimborsi] = useState<Rimborso[]>([])
  const [perStato, setPerStato] = useState<Record<string, { conteggio: number; importo: number }>>({})
  /** Che cosa succederebbe premendo «Conferma il rimborso» (vedi caricaAnteprima). */
  const [anteprima, setAnteprima] = useState<(Anteprima & { id: string }) | null>(null)
  const [importoDaPagare, setImportoDaPagare] = useState(0)
  const [caricato, setCaricato] = useState(false)
  const [bozza, setBozza] = useState<typeof VUOTO>(VUOTO)
  const [formAperto, setFormAperto] = useState(false)
  const [avvisoPag, setAvvisoPag] = useState('')
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  /**
   * ⭐ 11/09/2026 — DUE SEZIONI (utente: «crea una sezione storico dove far
   * andare i rimborsi approvati o meno»): «Da lavorare» è la coda (da
   * approvare, e approvati con i soldi ancora dentro), «Storico» è quello che
   * è finito — reso, rifiutato, annullato. «Tutti» resta per cercare.
   * ⚠️ Un approvato non ancora reso NON va in storico: la decisione c'è, ma il
   * cliente aspetta ancora i suoi soldi.
   */
  const [vista, setVista] = useState<'aperti' | 'storico' | 'tutti'>('aperti')
  /** Il filtro fine dentro la vista ('' = tutti gli stati della vista). */
  const [soloStato, setSoloStato] = useState('')
  const filtroStato = soloStato || (vista === 'tutti' ? '' : vista)
  // La scorciatoia di periodo (Libro v1.9 §8-bis), sulla DATA DELLA RICHIESTA
  // (`creatoIl`). ⚠️ Filtra il SERVER: l'elenco è tagliato a 300.
  const [periodo, setPeriodo] = useState<Periodo>('')

  // Riga in cui si sta scrivendo l'esito prima di segnare "rimborsato".
  /** La richiesta su cui si sta per far partire il rimborso vero. */
  const [rimborsoDi, setRimborsoDi] = useState('')
  /** Se Shopify deve mandare al cliente la SUA email di rimborso. */
  const [avvisaCliente, setAvvisaCliente] = useState(false)
  const [inCorso, setInCorso] = useState('')
  const [esitoDi, setEsitoDi] = useState('')
  const [testoEsito, setTestoEsito] = useState('')
  /**
   * ⭐ 11/09/2026 — LA RIGA SI APRE COL CLICK (Libro UX v1.6, segnalazione
   * dell'utente: «al click non apre i dettagli»). Qui serviva più che altrove:
   * il MOTIVO è la cosa su cui si decide se approvare, e in tabella è tagliato
   * a 110 caratteri — «Unico fiorista che farebbe consegna ha minimo di ordine
   * superiore a quello pagato dal cliente che non accetta …» finiva proprio
   * dove comincia la ragione. Il pannello lo mostra per intero, con l'esito e
   * chi ha chiesto e deciso; da lì si apre anche l'ordine.
   */
  const [aperto, setAperto] = useState<Rimborso | null>(null)
  /** L'ordine aperto nel suo pannello ('' = nessuno). */
  const [ordineAperto, setOrdineAperto] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (filtroStato) p.set('stato', filtroStato)
      if (periodo) p.set('periodo', periodo)
      const res = await fetch('/api/rimborsi?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as {
        rimborsi: Rimborso[]
        perStato: Record<string, { conteggio: number; importo: number }>
        importoDaPagare: number
      }
      setRimborsi(d.rimborsi)
      setPerStato(d.perStato)
      setImportoDaPagare(d.importoDaPagare)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, filtroStato, periodo])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  // Esc chiude il pannello: aperto qualcosa, è il gesto che si prova per primo.
  useEffect(() => {
    if (!aperto) return
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAperto(null)
    }
    document.addEventListener('keydown', tasto)
    return () => document.removeEventListener('keydown', tasto)
  }, [aperto])

  // ⚠️ L'elenco si ricarica sotto (Approva, Rifiuta, rimborso eseguito): il
  // pannello deve mostrare la riga NUOVA, non quella con cui era stato aperto.
  useEffect(() => {
    if (!aperto) return
    const fresco = rimborsi.find((x) => x.id === aperto.id)
    if (fresco && fresco !== aperto) setAperto(fresco)
  }, [rimborsi, aperto])

  useEffect(() => {
    carica()
  }, [carica])

  // Arrivando dal pulsante "Rimborso" di un ordine, il modulo si apre già pieno.
  useEffect(() => {
    if (prefill && (prefill.ordineNumero || prefill.ordineId)) {
      const totale = Number(prefill.importoOrdine) || 0
      setBozza({
        ...VUOTO,
        ordineId: prefill.ordineId ?? '',
        ordineNumero: prefill.ordineNumero ?? '',
        negozioNome: prefill.negozioNome ?? '',
        clienteNome: prefill.clienteNome ?? '',
        telefono: prefill.telefono ?? '',
        email: prefill.email ?? '',
        importoOrdine: totale,
        // Si propone il rimborso TOTALE, che è il caso più frequente, ma resta
        // scritto in un campo modificabile: niente parte da solo.
        importo: totale ? String(totale) : '',
      })
      setAvvisoPag(avvisoPagamento(prefill.statoPagamento ?? ''))
      setFormAperto(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/rimborsi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bozza,
          id: bozza.id || undefined,
          importo: Number(bozza.importo),
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Richiesta non salvata.')
        return
      }
      setAvviso('Rimborso richiesto. Ora va approvato da qualcuno.')
      setBozza(VUOTO)
      setFormAperto(false)
      setAvvisoPag('')
      await carica()
    } catch {
      setErrore('Richiesta non salvata: problema di rete.')
    }
  }

  async function cambiaStato(id: string, stato: string, esito?: string) {
    setErrore('')
    try {
      const res = await fetch(`/api/rimborsi/${id}/stato`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato, esito }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Stato non salvato.')
        return
      }
      setEsitoDi('')
      setTestoEsito('')
      await carica()
    } catch {
      setErrore('Stato non salvato: problema di rete.')
    }
  }

  /**
   * Fa partire il rimborso VERO su Shopify.
   *
   * ⚠️⚠️ Da qui escono soldi. Il bottone non rimborsa al primo clic: apre la
   * riga di conferma, e solo il secondo clic parte. L'errore di Shopify si
   * mostra com'è — «non riuscito» non direbbe se i soldi sono usciti o no.
   */
  async function rimborsaShopify(id: string) {
    setErrore('')
    setAvviso('')
    setInCorso(id)
    try {
      const res = await fetch(`/api/rimborsi/${id}/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avvisaCliente }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; refundId?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Rimborso non partito.')
        return
      }
      setAvviso('Rimborsato su Shopify. I soldi tornano sul metodo con cui il cliente ha pagato.')
      setRimborsoDi('')
      setAvvisaCliente(false)
    } catch {
      // ⚠️ La rete è caduta DOPO l'invio: non si sa se il rimborso è passato.
      // Si dice, e si manda a guardare — non si invita a riprovare.
      setErrore(
        'Non so se il rimborso è partito (la connessione è caduta): controlla l’ordine su Shopify prima di riprovare.'
      )
    } finally {
      setInCorso('')
      await carica()
    }
  }
  /**
   * ⭐ 11/09/2026 — L'ANTEPRIMA del rimborso, chiesta al server quando si apre
   * la riga di conferma.
   *
   * ⚠️⚠️ Serve agli ordini in valuta straniera: l'app scrive 138,20 € perché
   * quello incassa il negozio, ma il cliente ha pagato 160,00 $ e 160,00 $
   * riceve. La cifra vera va letta PRIMA del clic. Se l'anteprima non arriva il
   * bottone resta com'era: non si blocca un rimborso perché una lettura in più
   * è andata storta.
   */
  async function caricaAnteprima(id: string) {
    setAnteprima(null)
    try {
      const res = await fetch(`/api/rimborsi/${id}/shopify`)
      const d = (await res.json().catch(() => ({}))) as Anteprima
      if (res.ok) setAnteprima({ ...d, id })
    } catch {
      /* l'anteprima è un di più: si tace e si lascia la conferma di sempre */
    }
  }

  async function elimina(id: string) {
    await fetch('/api/rimborsi?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  const daApprovare = perStato['richiesto']?.conteggio ?? 0
  const approvati = perStato['approvato']?.conteggio ?? 0
  const eseguiti = perStato['eseguito'] ?? { conteggio: 0, importo: 0 }
  const filtriAttivi = !!(qCercata || periodo || soloStato || vista !== 'aperti')

  // Quanto resta rimborsabile sull'ordine in bozza (solo indicativo: il tetto
  // vero lo ricontrolla il server, che vede anche le altre richieste).
  const residuo = bozza.importoOrdine
  const chiesto = Number(bozza.importo) || 0
  // ⚠️ I conteggi delle sezioni arrivano da `perStato`, che l'API calcola su
  // TUTTE le righe e non sul filtro: un numero che cambia col filtro non
  // direbbe quanto lavoro c'è.
  const quanti = (stati: readonly string[]) =>
    stati.reduce((s, x) => s + (perStato[x]?.conteggio ?? 0), 0)
  const contaDaLavorare = quanti(STATI_DA_LAVORARE)
  const contaStorico = quanti(STATI_STORICO)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Rimborsi</h1>
          <p className="page-sub">
            Le richieste di rimborso sugli ordini. Qui si chiede e si approva;{' '}
            <strong>i soldi non escono da quest’app</strong>: il rimborso lo fa una persona su
            Shopify o in banca, e poi lo si segna come fatto.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setBozza(VUOTO)
            setAvvisoPag('')
            setFormAperto(true)
          }}
        >
          Nuovo rimborso
        </button>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="kpi-riga" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#c93400' }}>
            {daApprovare}
          </div>
          <div className="kpi-etichetta">Da approvare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#0071e3' }}>
            {approvati}
          </div>
          <div className="kpi-etichetta">Approvati, da pagare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{soldi(importoDaPagare)}</div>
          <div className="kpi-etichetta">Promesso e non ancora uscito</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#248a3d' }}>
            {soldi(eseguiti.importo)}
          </div>
          <div className="kpi-etichetta">Rimborsato ({eseguiti.conteggio})</div>
        </div>
      </div>

      {formAperto ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>{bozza.id ? 'Modifica richiesta' : 'Chiedi un rimborso'}</h2>

          {/* Quello che Shopify dice del pagamento: non blocca, avvisa. */}
          {avvisoPag ? <div className="avviso-errore">{avvisoPag}</div> : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Ordine</span>
              <input
                value={bozza.ordineNumero}
                onChange={(e) => setBozza({ ...bozza, ordineNumero: e.target.value })}
                placeholder="#1042"
              />
            </label>
            <label className="campo">
              <span>Cliente</span>
              <input
                value={bozza.clienteNome}
                onChange={(e) => setBozza({ ...bozza, clienteNome: e.target.value })}
                placeholder="Mario Rossi"
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Importo da rimborsare</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bozza.importo}
                onChange={(e) => setBozza({ ...bozza, importo: e.target.value })}
                placeholder="0,00"
              />
            </label>
            <div className="campo">
              <span>Valore dell&apos;ordine</span>
              <div style={{ padding: '9px 0', fontSize: 15 }}>
                {residuo ? soldi(residuo) : '—'}
                {residuo && chiesto > 0 ? (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {' '}
                    · {chiesto >= residuo ? 'rimborso totale' : 'rimborso parziale'}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {residuo > 0 && chiesto > residuo ? (
            <p className="descrizione" style={{ color: 'var(--red)', marginTop: -4 }}>
              Stai chiedendo più del valore dell&apos;ordine: non si può rendere più di quanto
              incassato.
            </p>
          ) : null}

          <label className="campo">
            <span>Perché si rimborsa</span>
            <textarea
              rows={3}
              value={bozza.motivo}
              onChange={(e) => setBozza({ ...bozza, motivo: e.target.value })}
              placeholder="Consegna mai arrivata, fiori appassiti, ordine doppio…"
            />
          </label>
          {bozza.importoOrdine > 0 && !bozza.motivo.trim() ? (
            <p className="descrizione" style={{ marginTop: -4 }}>
              Serve: un rimborso senza motivo scritto è impossibile da spiegare fra sei mesi.
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={salva}
              disabled={!bozza.motivo.trim() || !(Number(bozza.importo) > 0)}
            >
              Chiedi il rimborso
            </button>
            <button
              className="btn btn-secondario"
              onClick={() => {
                setFormAperto(false)
                setBozza(VUOTO)
                setAvvisoPag('')
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): sulla data della
          richiesta di rimborso. */}
      <ChipsPeriodo valore={periodo} cambia={setPeriodo} campo="la data della richiesta" />

      {/* ── LE DUE SEZIONI ──
          ⚠️ Prima c'era solo la tendina, e lo storico si raggiungeva scegliendo
          uno stato alla volta: «com'è finita quella richiesta di settembre» era
          una domanda senza una schermata. Le chip dicono anche QUANTE sono. */}
      {/* ⚠️ Le pillole sono quelle dell'app (`stato-pill` + `attuale`, Libro
          UX&UI v1.9 §8-bis): non si apre un secondo sistema di chip. A
          differenza del periodo, qui una vista è sempre accesa — non esiste
          «nessuna sezione», e ripremerla non la spegne. */}
      <div className="filtri-passi riga-chips-scorri">
        <span className="etichetta-ordina">Sezione</span>
        {VISTE.map((v) => (
          <button
            key={v.chiave}
            type="button"
            className={`stato-pill${vista === v.chiave ? ' attuale' : ''}`}
            aria-pressed={vista === v.chiave}
            title={v.spiega}
            onClick={() => {
              setVista(v.chiave)
              setSoloStato('')
            }}
          >
            {v.nome}
            {v.chiave === 'aperti' && contaDaLavorare ? ` (${contaDaLavorare})` : ''}
            {v.chiave === 'storico' && contaStorico ? ` (${contaStorico})` : ''}
          </button>
        ))}
      </div>

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per ordine, cliente o motivo…"
          aria-label="Cerca rimborsi"
        />
        {/* ⚠️ La tendina filtra DENTRO la sezione scelta: le viste stanno nelle
            chip qui sopra, e due controlli che dicono la stessa cosa in due modi
            diversi sono il modo di non sapere più che cosa si sta guardando. */}
        <select value={soloStato} onChange={(e) => setSoloStato(e.target.value)} aria-label="Stato">
          <option value="">
            {vista === 'aperti' ? 'Ogni stato da lavorare' : vista === 'storico' ? 'Ogni stato chiuso' : 'Ogni stato'}
          </option>
          {STATI_RIMBORSO.map((s) => (
            <option key={s.chiave} value={s.chiave}>
              Solo: {s.nome}
            </option>
          ))}
        </select>
        {filtriAttivi ? (
          <button
            className="bottone secondario"
            onClick={() => {
              setQ('')
              setVista('aperti')
              setSoloStato('')
              setPeriodo('')
            }}
          >
            Azzera
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : rimborsi.length === 0 ? (
        <div className="vuoto">
          {vista === 'storico' && !soloStato && !qCercata && !periodo
            ? 'Nello storico non c’è ancora niente: qui finiscono i rimborsi resi, rifiutati o annullati.'
            : filtriAttivi
              ? 'Nessun rimborso corrisponde ai filtri.'
              : 'Nessun rimborso da lavorare. Se ne apre uno dal pulsante “Rimborso” su un ordine.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th>
                <th className="num">Importo</th>
                <th>Motivo</th>
                <th>Stato</th>
                {/* ⭐ Che cosa succede davvero: approvare e rimborsare si
                    somigliano e fanno cose opposte (utente, 11/09/2026). */}
                <th>Cosa si fa</th>
                <th>Chiesto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rimborsi.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  className="riga-apribile"
                  title="Apri il rimborso: motivo per intero, esito, ordine"
                  onClick={(e) => {
                    // ⚠️ Le azioni dentro la riga restano loro (Libro v1.6):
                    // Approva, Rifiuta, la casella dell'email di Shopify e i
                    // campi dell'esito non devono aprire niente.
                    const el = e.target as HTMLElement
                    if (el.closest('a,button,input,select,label,textarea')) return
                    setAperto(r)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.target !== e.currentTarget) return
                    setAperto(r)
                  }}
                >
                  <td>
                    <div className="cella-nome">{r.ordineNumero || '—'}</div>
                    <div className="cella-sub">
                      {r.clienteNome || '—'}
                      {r.negozioNome ? ` · ${r.negozioNome}` : ''}
                    </div>
                  </td>
                  <td className="cella-num">
                    <div style={{ fontWeight: 600 }}>{soldi(r.importo, r.valuta)}</div>
                    <div className="cella-sub">
                      {r.tipo === 'totale' ? 'totale' : `su ${soldi(r.importoOrdine, r.valuta)}`}
                    </div>
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 280 }} title={r.motivo}>
                    {r.motivo.length > 110 ? r.motivo.slice(0, 110) + '…' : r.motivo}
                    {r.esito ? <div className="cella-sub">Esito: {r.esito}</div> : null}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ color: coloreStatoRimborso(r.stato), fontWeight: 600 }}
                    >
                      {nomeStatoRimborso(r.stato)}
                    </span>
                    {r.decisoDa ? <div className="cella-sub">da {r.decisoDa}</div> : null}
                  </td>
                  <td style={{ maxWidth: 230 }}>
                    {(() => {
                      const a = azioneRimborso(r, ruolo)
                      return (
                        <>
                          <div>{a.cosa}</div>
                          {a.ora ? <div className="cella-sub">{a.ora}</div> : null}
                        </>
                      )
                    })()}
                  </td>
                  <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                    {dataBreve(r.creatoIl)}
                    {r.richiestoDa ? <div className="cella-sub">da {r.richiestoDa}</div> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {rimborsoDi === r.id ? (
                      // ⚠️⚠️ La conferma dice l'IMPORTO e l'ORDINE: un «sei
                      // sicuro?» non fa rileggere niente, e qui si sbaglia una
                      // volta sola.
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'normal', minWidth: 250 }}>
                        <span>
                          Rendo <strong>{soldi(r.importo, r.valuta)}</strong> su{' '}
                          <strong>{r.ordineNumero || 'questo ordine'}</strong>, sul metodo con cui
                          ha pagato.
                        </span>
                        {/* ⭐⭐ 11/09/2026 — LA CIFRA CHE VEDE IL CLIENTE.
                            Su un ordine pagato in dollari l'app scrive euro, ma
                            sull'estratto conto del cliente tornano dollari: la
                            conferma lo dice PRIMA del clic, non l'esito dopo. */}
                        {anteprima && anteprima.id === r.id && anteprima.ok && anteprima.conversione ? (
                          <span className="nota-conferma nota-valuta">
                            Ha pagato in {anteprima.valutaCliente}: riceve{' '}
                            <strong>
                              {soldi(anteprima.importoCliente ?? 0, anteprima.valutaCliente || 'USD')}
                            </strong>{' '}
                            (il cambio è quello di quest’ordine, non di oggi).
                          </span>
                        ) : null}
                        {anteprima && anteprima.id === r.id && anteprima.ok === false ? (
                          // ⚠️ Il motivo si legge PRIMA di premere: premere e
                          // leggere l'errore dopo lascia il dubbio se i soldi
                          // siano usciti.
                          <span className="nota-conferma nota-stop">{anteprima.messaggio}</span>
                        ) : null}
                        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={avvisaCliente}
                            onChange={(e) => setAvvisaCliente(e.target.checked)}
                          />
                          Manda al cliente l&apos;email di rimborso di Shopify
                        </label>
                        <span>
                          <button
                            className="btn small"
                            onClick={() => void rimborsaShopify(r.id)}
                            disabled={inCorso === r.id}
                          >
                            {inCorso === r.id ? 'Rimborso in corso…' : 'Conferma il rimborso'}
                          </button>{' '}
                          <button
                            className="btn btn-secondario small"
                            onClick={() => setRimborsoDi('')}
                            disabled={inCorso === r.id}
                          >
                            Annulla
                          </button>
                        </span>
                      </div>
                    ) : esitoDi === r.id ? (
                      <>
                        <input
                          value={testoEsito}
                          onChange={(e) => setTestoEsito(e.target.value)}
                          placeholder="Come è stato reso"
                          style={{
                            padding: '5px 10px',
                            border: '1px solid var(--hairline)',
                            borderRadius: 8,
                            marginRight: 6,
                            width: 190,
                          }}
                        />
                        <button
                          className="btn small"
                          onClick={() => cambiaStato(r.id, 'eseguito', testoEsito)}
                          disabled={!testoEsito.trim()}
                        >
                          Conferma
                        </button>{' '}
                        <button
                          className="btn btn-secondario small"
                          onClick={() => setEsitoDi('')}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <>
                        {r.stato === 'richiesto' ? (
                          <>
                            <button
                              className="btn small"
                              onClick={() => cambiaStato(r.id, 'approvato')}
                            >
                              Approva
                            </button>{' '}
                            <button
                              className="btn btn-secondario small"
                              onClick={() => cambiaStato(r.id, 'rifiutato')}
                            >
                              Rifiuta
                            </button>{' '}
                          </>
                        ) : null}
                        {/* ── IL RIMBORSO VERO ──
                            ⚠️⚠️ Chiesto dall'utente il 02/09/2026. Da qui
                            escono soldi: il bottone apre una conferma e non
                            rimborsa al primo clic, e lo vede solo un admin (la
                            rotta lo ricontrolla comunque). «Segna rimborsato»
                            resta per i soldi resi altrove — bonifico, o un
                            rimborso fatto a mano su Shopify. */}
                        {r.stato === 'approvato' && ruolo === 'admin' ? (
                          <button
                            className="btn small"
                            onClick={() => {
                              setRimborsoDi(r.id)
                              setAvvisaCliente(false)
                              void caricaAnteprima(r.id)
                            }}
                            title="Rende davvero i soldi sul metodo con cui ha pagato"
                          >
                            Rimborsa su Shopify
                          </button>
                        ) : null}{' '}
                        {r.stato === 'approvato' ? (
                          <button
                            className="btn small"
                            onClick={() => {
                              setEsitoDi(r.id)
                              setTestoEsito(r.esito)
                            }}
                            title="Segna che il rimborso è stato fatto davvero"
                          >
                            Segna rimborsato
                          </button>
                        ) : null}{' '}
                        <button
                          className="btn btn-secondario small"
                          style={{ color: 'var(--red)' }}
                          onClick={() => elimina(r.id)}
                        >
                          Elimina
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── IL RIMBORSO APERTO ──
          ⚠️ Riusa `.velo` e `.pannello` del dettaglio ordine: stesso gesto,
          stesso aspetto, Esc e click fuori chiudono. Qui dentro c'è quello che
          in tabella non ci sta — il motivo per intero — e le due decisioni, per
          non costringere a chiudere per approvare quello che si è appena letto. */}
      {aperto ? (
        <div className="velo" onClick={() => setAperto(null)} role="presentation">
          <div className="pannello" onClick={(e) => e.stopPropagation()}>
            <div className="pannello-testa">
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>
                  Rimborso · {aperto.ordineNumero || 'senza ordine'}
                </h2>
                <p className="cella-sub" style={{ margin: '2px 0 0' }}>
                  {aperto.clienteNome || 'cliente non indicato'}
                  {aperto.negozioNome ? ` · ${aperto.negozioNome}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                {aperto.ordineId ? (
                  <button
                    className="btn btn-secondario small"
                    onClick={() => {
                      setOrdineAperto(aperto.ordineId)
                      setAperto(null)
                    }}
                  >
                    Apri l&apos;ordine
                  </button>
                ) : null}
                <button
                  className="pannello-chiudi"
                  aria-label="Chiudi"
                  title="Chiudi (Esc)"
                  onClick={() => setAperto(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: '14px 16px', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                <div>
                  <div className="cella-sub">Stato</div>
                  <span
                    className="badge"
                    style={{ color: coloreStatoRimborso(aperto.stato), fontWeight: 600 }}
                  >
                    {nomeStatoRimborso(aperto.stato)}
                  </span>
                </div>
                <div>
                  <div className="cella-sub">Da rendere</div>
                  <div style={{ fontWeight: 600 }}>{soldi(aperto.importo, aperto.valuta)}</div>
                  <div className="cella-sub">
                    {aperto.tipo === 'totale'
                      ? 'rimborso totale'
                      : `parziale su ${soldi(aperto.importoOrdine, aperto.valuta)}`}
                  </div>
                </div>
                <div>
                  <div className="cella-sub">Chiesto</div>
                  <div>{dataBreve(aperto.creatoIl)}</div>
                  {aperto.richiestoDa ? <div className="cella-sub">da {aperto.richiestoDa}</div> : null}
                </div>
                {aperto.decisoDa ? (
                  <div>
                    <div className="cella-sub">Deciso</div>
                    <div>da {aperto.decisoDa}</div>
                  </div>
                ) : null}
              </div>

              {/* ⭐ Che cosa si concretizza, scritto prima delle azioni: qui
                  sotto ci sono due bottoni, e uno dei due non muove soldi. */}
              {(() => {
                const a = azioneRimborso(aperto, ruolo)
                return (
                  <>
                    <h3 style={{ margin: '16px 0 4px', fontSize: 13.5 }}>Cosa si fa</h3>
                    <p style={{ margin: 0 }}>{a.cosa}</p>
                    {a.ora ? <p className="cella-sub" style={{ margin: '2px 0 0' }}>{a.ora}</p> : null}
                  </>
                )
              })()}

              {/* ⚠️ Il motivo per INTERO e a capo dove è a capo: è il testo su
                  cui si decide, e in tabella se ne leggeva metà. */}
              <h3 style={{ margin: '16px 0 4px', fontSize: 13.5 }}>Motivo</h3>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aperto.motivo || '—'}</p>

              {aperto.esito ? (
                <>
                  <h3 style={{ margin: '16px 0 4px', fontSize: 13.5 }}>Esito</h3>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aperto.esito}</p>
                </>
              ) : null}
            </div>

            {aperto.stato === 'richiesto' ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  onClick={() => {
                    void cambiaStato(aperto.id, 'approvato')
                    setAperto(null)
                  }}
                >
                  Approva
                </button>
                <button
                  className="btn btn-secondario"
                  onClick={() => {
                    void cambiaStato(aperto.id, 'rifiutato')
                    setAperto(null)
                  }}
                >
                  Rifiuta
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* L'ordine, aperto dal pannello del rimborso. Alla chiusura si rilegge
          l'elenco: dalla scheda si può aver rimborsato o cambiato l'ordine. */}
      {ordineAperto ? (
        <DettaglioOrdine
          ordineId={ordineAperto}
          onChiudi={() => {
            setOrdineAperto('')
            void carica()
          }}
        />
      ) : null}
    </main>
  )
}
