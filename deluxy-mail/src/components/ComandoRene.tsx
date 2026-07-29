'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { comandoPostaAnteprima, comandoPostaEsegui } from '@/lib/actions'
import { mostraFlash } from './Flash'

type Anteprima = {
  ok: boolean
  messaggio: string
  azione?: 'cestina' | 'archivia'
  criterio?: 'mittente' | 'oggetto'
  valore?: string
  quanti?: number
  /** Comando già eseguito (es. appuntamento creato): niente da confermare. */
  fatto?: boolean
  /** Dove mandare l'utente (es. la bozza preparata da «invia mail a…»). */
  vaiA?: string
}

/**
 * "Chiedi a Renè": un comando a parole su un gruppo di mail — es. «cancella
 * tutte le mail di mario@…» o «archivia le mail con oggetto sollecito». Mai
 * distruttivo di colpo: prima MOSTRA quante mail toccherebbe e chiede conferma.
 * Cestinare = recuperabile dal Cestino.
 */
export function ComandoRene({ sezioni = [] }: { sezioni?: { id: string; nome: string }[] }) {
  const [testo, setTesto] = useState('')
  // Ambito di ricerca: '' = ovunque, '__null__' = senza sezione, altrimenti l'id.
  const [ambito, setAmbito] = useState('')
  const [ant, setAnt] = useState<Anteprima | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  // '' → undefined (ovunque); '__null__' → null (senza sezione); altrimenti l'id.
  const sezioneId = ambito === '' ? undefined : ambito === '__null__' ? null : ambito

  const chiedi = () =>
    start(async () => {
      setAnt(null)
      const r = await comandoPostaAnteprima(testo, sezioneId)
      // Comando già eseguito (es. «crea appuntamento…»): banner e via.
      if (r.ok && r.fatto) {
        mostraFlash(r.messaggio)
        setTesto('')
        // «Invia mail a…»: apri la bozza pronta, così la controlli e la mandi.
        // «Riassumi le mail di oggi»: porta su Renè, dove c'è il punto della
        // situazione — ma se ci sei già, un push sulla stessa pagina non
        // rileggerebbe nulla: lì serve il refresh.
        if (r.vaiA && r.vaiA !== window.location.pathname) {
          router.push(r.vaiA)
        } else {
          router.refresh()
        }
        return
      }
      setAnt(r)
    })

  const conferma = () =>
    start(async () => {
      if (!ant?.azione || !ant.criterio || !ant.valore) return
      const r = await comandoPostaEsegui(ant.azione, ant.criterio, ant.valore, sezioneId)
      mostraFlash(r.messaggio)
      setAnt(null)
      setTesto('')
      router.refresh()
    })

  // Serve conferma solo se c'è davvero qualcosa da toccare.
  const daConfermare = ant?.ok && (ant.quanti ?? 0) > 0

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="ai-box-title" style={{ marginBottom: 8 }}>
        <span className="ai-toggle-mark">AI</span> Chiedi a Renè
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
        «<strong>Riassumi le mail di oggi</strong>» (o della settimana, o del mese: rilegge la posta
        del periodo e fa il punto qui sotto) — comandi su un gruppo di mail, es. «cancella tutte le
        mail di mario@rossi.it», «archivia le mail con oggetto sollecito» — «crea un appuntamento
        domani alle 12» (anche coi dati di una riunione Teams/Zoom) — oppure «invia una mail a
        info@… chiedendo …» (Renè la scrive, tu la controlli e la mandi). Puoi limitare tutto a una
        sezione col menu qui sotto. Sulle mail, prima di agire ti dico quante ne tocco e chiedo
        conferma (il cestino è recuperabile); gli appuntamenti finiscono subito in Calendario.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={ambito}
          onChange={(e) => {
            setAmbito(e.target.value)
            setAnt(null)
          }}
          title="Dove cercare le mail del comando"
          style={{ width: 'auto', minWidth: 150, padding: '10px 12px', fontSize: 13.5 }}
        >
          <option value="">In tutte le sezioni</option>
          <option value="__null__">Senza sezione (da smistare)</option>
          {sezioni.map((s) => (
            <option key={s.id} value={s.id}>
              Sezione: {s.nome}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={testo}
          onChange={(e) => {
            setTesto(e.target.value)
            setAnt(null)
          }}
          placeholder="Es. riassumi le mail di oggi"
          style={{ flex: 1, minWidth: 240, padding: '10px 14px', fontSize: 14 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && testo.trim() && !daConfermare) chiedi()
          }}
        />
        {!daConfermare ? (
          <button className="btn secondary" type="button" onClick={chiedi} disabled={inCorso || !testo.trim()}>
            {inCorso ? 'Penso…' : 'Chiedi'}
          </button>
        ) : (
          <>
            <button className="btn secondary" type="button" onClick={() => setAnt(null)} disabled={inCorso}>
              Annulla
            </button>
            <button className="btn danger" type="button" onClick={conferma} disabled={inCorso}>
              {inCorso ? 'Eseguo…' : `Sì, ${ant?.azione === 'cestina' ? 'cestina' : 'archivia'} ${ant?.quanti}`}
            </button>
          </>
        )}
      </div>
      {ant && (
        <div
          style={{
            fontSize: 13,
            marginTop: 10,
            color: ant.ok ? 'var(--text-secondary)' : 'var(--red)',
          }}
        >
          {ant.messaggio}
        </div>
      )}
    </div>
  )
}
