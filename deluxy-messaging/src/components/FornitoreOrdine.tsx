'use client'

import { useEffect, useState } from 'react'
import {
  costoScritto,
  costoValido,
  fornitoreAtteso,
  leggiCosto,
  type FornitoreOrdineDto,
} from '@/lib/fornitore-ordine'

// A CHI ABBIAMO DATO QUEST'ORDINE.
//
// ⚠️⚠️ Non si registrava da nessuna parte. L'app sapeva **chi si può chiamare**
// (i fornitori in provincia, chiesti ad Anagrafiche) e sapeva **che è stato
// pagato un nome su un IBAN** (`RichiestaPagamento.intestatario`), ma non
// «questo ordine l'ha fatto Tizio». Quel fatto restava nella testa di chi aveva
// telefonato: il giorno dopo, davanti a un reclamo, non c'era modo di sapere a
// chi chiedere — e alla domanda «quanto lavoro diamo a quel fornitore?» non si
// poteva rispondere affatto.

/** Un fornitore scelto altrove (la lista della zona) da cui partire. */
export type FornitoreProposto = {
  id?: string
  nome: string
  citta?: string
  telefono?: string
  email?: string
}

export function FornitoreOrdine({
  ordineId,
  gestione,
  iniziale,
  proposto,
  quotaAttesa,
  onCambiato,
}: {
  ordineId: string
  /** Lo stato di lavorazione: decide se la mancanza va segnalata o taciuta. */
  gestione: string
  iniziale: (FornitoreOrdineDto & { fornitoreDaNome: string; fornitoreIl: string | null }) | null
  /** Arriva dal bottone «Dai a lui» sulla lista dei fornitori in zona. */
  proposto?: FornitoreProposto | null
  /**
   * La quota indicativa che Orders calcola sul venduto (il 60%).
   * ⚠️ Si MOSTRA come riferimento, non si scrive nel campo: è una stima, e
   * precompilare il costo con una stima vorrebbe dire archiviare stime credendo
   * di archiviare accordi.
   */
  quotaAttesa?: number | null
  onCambiato?: () => void
}) {
  const [dati, setDati] = useState(iniziale)
  const [apri, setApri] = useState(false)
  const [nome, setNome] = useState('')
  const [idRegistro, setIdRegistro] = useState('')
  const [citta, setCitta] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [costo, setCosto] = useState('')
  const [nota, setNota] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [errore, setErrore] = useState('')

  useEffect(() => setDati(iniziale), [iniziale])

  // «Dai a lui» dalla lista della zona: il modulo si apre già pieno, e chi lo
  // usa deve solo scrivere quanto gli abbiamo promesso.
  useEffect(() => {
    if (!proposto) return
    setNome(proposto.nome)
    setIdRegistro(proposto.id ?? '')
    setCitta(proposto.citta ?? '')
    setTelefono(proposto.telefono ?? '')
    setEmail(proposto.email ?? '')
    setApri(true)
  }, [proposto])

  function apriPerModifica() {
    setNome(dati?.fornitoreNome ?? '')
    setIdRegistro(dati?.fornitoreId ?? '')
    setCitta(dati?.fornitoreCitta ?? '')
    setTelefono(dati?.fornitoreTelefono ?? '')
    setEmail(dati?.fornitoreEmail ?? '')
    setCosto(
      dati?.fornitoreCosto === null || dati?.fornitoreCosto === undefined
        ? ''
        : String(dati.fornitoreCosto).replace('.', ',')
    )
    setNota(dati?.fornitoreNota ?? '')
    setErrore('')
    setApri(true)
  }

  async function salva() {
    const chi = nome.trim()
    if (!chi) {
      setErrore('Serve almeno il nome di chi lo prepara.')
      return
    }
    const c = leggiCosto(costo)
    if (!costoValido(c)) {
      setErrore('Il costo non è un importo valido. Scrivilo come 130 o 130,50.')
      return
    }
    setSalvo(true)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordineId}/fornitore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: chi,
          id: idRegistro,
          citta,
          telefono,
          email,
          costo,
          nota,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        fornitore?: typeof dati
        errore?: string
        orders?: { ok: boolean; messaggio?: string }
      }
      // ⚠️ L'errore si dice. Un fornitore che sembra registrato e non lo è vale
      // meno di nessun fornitore: chi l'ha scritto smette di pensarci.
      if (!res.ok || !d.fornitore) {
        setErrore(d.errore || 'Non è stato registrato.')
        return
      }
      setDati(d.fornitore)
      setApri(false)
      // ⚠️⚠️ Se la proposta a Orders NON e passata lo si DICE, anche se qui e
      // stato salvato: il costo serve la' per il margine, e una proposta che
      // rimbalza in silenzio lascia il margine vuoto senza che nessuno capisca
      // perche. Il fatto resta registrato — quello e nostro.
      setErrore(d.orders && !d.orders.ok ? `Registrato qui. ⚠️ Ma Orders non l ha preso: ${d.orders.messaggio ?? ''}` : '')
      onCambiato?.()
    } catch {
      setErrore('Non è stato registrato: rete assente.')
    } finally {
      setSalvo(false)
    }
  }

  async function togli() {
    setSalvo(true)
    try {
      const res = await fetch(`/api/ordini/${ordineId}/fornitore`, { method: 'DELETE' })
      if (!res.ok) {
        setErrore('Non è stato tolto.')
        return
      }
      setDati(null)
      setApri(false)
      onCambiato?.()
    } catch {
      setErrore('Non è stato tolto: rete assente.')
    } finally {
      setSalvo(false)
    }
  }

  const registrato = !!dati?.fornitoreNome
  const cifre = (dati?.fornitoreTelefono || '').replace(/\D/g, '')

  return (
    <div className="riquadro-fornitore">
      <div className="riga-titolo-fornitore">
        <span className="cella-nome">Chi prepara quest&apos;ordine</span>
        {!apri ? (
          <button className="btn btn-secondario small" onClick={apriPerModifica}>
            {registrato ? 'Cambia' : 'Registra il fornitore'}
          </button>
        ) : null}
      </div>

      {!apri ? (
        registrato ? (
          <>
            <div className="fornitore-scelto">
              <span className="nome-fornitore">{dati!.fornitoreNome}</span>
              {dati!.fornitoreCitta ? <span className="badge">{dati!.fornitoreCitta}</span> : null}
              <span className="badge" title="Quanto gli diamo, concordato">
                {costoScritto(dati!.fornitoreCosto)}
              </span>
              {/* ⚠️ Se non viene dal registro lo si dice: vuol dire che di lui
                  non sappiamo niente oltre a quello che c'è scritto qui, e chi
                  lo richiamerà fra un mese deve saperlo. */}
              {!dati!.fornitoreId ? (
                <span
                  className="badge"
                  style={{ color: 'var(--text-tertiary)' }}
                  title="Non è nel registro Anagrafiche: di lui restano solo i dati scritti qui"
                >
                  fuori registro
                </span>
              ) : null}
            </div>
            <div className="cella-sub">
              {[
                dati!.fornitoreDaNome ? `registrato da ${dati!.fornitoreDaNome}` : '',
                dati!.fornitoreIl ? new Date(dati!.fornitoreIl).toLocaleString('it-IT') : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {dati!.fornitoreNota ? <p className="descrizione">{dati!.fornitoreNota}</p> : null}
            <div className="azioni-fornitore">
              {cifre.length >= 8 ? (
                <a
                  className="btn btn-secondario small"
                  href={`https://wa.me/${cifre}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              ) : null}
              {dati!.fornitoreEmail ? (
                <a className="btn btn-secondario small" href={`mailto:${dati!.fornitoreEmail}`}>
                  Email
                </a>
              ) : null}
              <button className="btn btn-secondario small" onClick={() => void togli()} disabled={salvo}>
                Togli
              </button>
            </div>
          </>
        ) : (
          <p className="descrizione">
            {/* ⚠️ Il promemoria compare SOLO quando l'ordine è già andato
                avanti. Su un ordine appena arrivato il fornitore non c'è ancora
                e non deve esserci: un avviso su ogni riga sarebbe rumore, e il
                rumore si smette di leggere. */}
            {fornitoreAtteso(gestione) ? (
              <strong style={{ color: 'var(--red)' }}>
                Quest&apos;ordine è già avanti e non risulta dato a nessuno.
              </strong>
            ) : (
              'Non ancora assegnato.'
            )}{' '}
            Registrandolo si sa a chi chiedere se il cliente reclama, e quanto lavoro diamo a
            ciascun fornitore.
          </p>
        )
      ) : (
        <div className="modulo-fornitore">
          <label className="campo">
            <span>Chi lo prepara</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Pasticceria Rossi"
              autoFocus
            />
          </label>
          <div className="due-campi">
            <label className="campo">
              <span>Città</span>
              <input value={citta} onChange={(e) => setCitta(e.target.value)} placeholder="Firenze" />
              {/* ⚠️⚠️ SERVE PIÙ DI QUANTO SEMBRI, e per questo si dice a chi
                  compila. Senza città, questo fornitore nel registro non torna
                  più indietro: la lista dei «fornitori in zona» di un ordine
                  nuovo filtra per provincia, e chi non ha né provincia né città
                  è invisibile. Misurato il 25/08/2026: 15 fornitori nostri in
                  anagrafica, tutti senza città — gente già pagata che al
                  prossimo ordine in quella stessa provincia non verrebbe
                  proposta a nessuno. Un campo saltato per fretta costa una
                  ricerca da capo fra un mese. */}
              <span className="cella-sub">
                Serve a ritrovarlo: al prossimo ordine in quella provincia lo proponiamo da soli.
              </span>
            </label>
            <label className="campo">
              <span>
                Quanto gli diamo
                {/* ⚠️ La quota di Orders si MOSTRA, non si scrive nel campo: è
                    una stima sul venduto, e precompilare con una stima vuol dire
                    archiviare stime credendo di archiviare accordi. */}
                {typeof quotaAttesa === 'number' ? (
                  <span className="cella-sub"> · indicativa {costoScritto(quotaAttesa)}</span>
                ) : null}
              </span>
              <input
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="130 oppure 130,50"
                inputMode="decimal"
              />
            </label>
          </div>
          <div className="due-campi">
            <label className="campo">
              <span>Telefono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+39…"
              />
            </label>
            <label className="campo">
              <span>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="…@…" />
            </label>
          </div>
          <label className="campo">
            <span>Nota</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="concordato al telefono, consegna entro le 12"
            />
          </label>
          {errore ? <p className="errore-riga">{errore}</p> : null}
          <div className="azioni-fornitore">
            <button className="btn small" onClick={() => void salva()} disabled={salvo || !nome.trim()}>
              {salvo ? 'Salvo…' : 'Registra'}
            </button>
            <button
              className="btn btn-secondario small"
              onClick={() => {
                setApri(false)
                setErrore('')
              }}
              disabled={salvo}
            >
              Lascia stare
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
