'use client'

import { useState, useTransition } from 'react'
import { salvaAzioneSezione } from '@/lib/actions'
import type { AzioneDescritta } from '@/lib/appDeluxy'

export type AzioneSalvata = {
  azioneId: string | null
  modo: string
  istruzioni: string
}

/**
 * «Quando metto una mail qui»: l'azione APP DELUXY agganciata alla sezione e
 * il modo in cui parte — chiedendo conferma o da sola. Sta sulla scheda della
 * sezione perché è lì che si capisce cosa contiene.
 */
export function AzioneSezione({
  sezioneId,
  azioni,
  iniziale,
}: {
  sezioneId: string
  azioni: AzioneDescritta[]
  iniziale: AzioneSalvata
}) {
  const [azioneId, setAzioneId] = useState(iniziale.azioneId ?? '')
  const [modo, setModo] = useState(iniziale.modo === 'automatico' ? 'automatico' : 'chiedi')
  const [istruzioni, setIstruzioni] = useState(iniziale.istruzioni)
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [aperto, setAperto] = useState(false)
  const [inCorso, start] = useTransition()

  const scelta = azioni.find((a) => a.id === azioneId)
  const cambiato =
    azioneId !== (iniziale.azioneId ?? '') ||
    modo !== (iniziale.modo === 'automatico' ? 'automatico' : 'chiedi') ||
    istruzioni !== iniziale.istruzioni

  // Chiuso: una riga sola, che dice cosa succede oggi.
  if (!aperto) {
    return (
      <button type="button" className="azione-riga" onClick={() => setAperto(true)}>
        {scelta
          ? `→ ${scelta.app}: ${scelta.nome} — ${modo === 'automatico' ? 'parte da sola' : 'con conferma'}`
          : '→ Collega un’app a questa sezione'}
      </button>
    )
  }

  return (
    <div className="sez-azione">
      <label className="field-label">Quando ci metto una mail a mano</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={azioneId}
          onChange={(e) => {
            setAzioneId(e.target.value)
            setEsito(null)
          }}
          style={{ width: 'auto', minWidth: 230 }}
        >
          <option value="">— non chiamare nessuna app —</option>
          {azioni.map((a) => (
            <option key={a.id} value={a.id} disabled={!a.configurata}>
              {a.app} — {a.nome}
              {a.configurata ? '' : ' (da collegare)'}
            </option>
          ))}
        </select>

        {azioneId && (
          <select value={modo} onChange={(e) => setModo(e.target.value)} style={{ width: 'auto' }}>
            <option value="chiedi">Chiedimi conferma</option>
            <option value="automatico">Fallo da solo</option>
          </select>
        )}
      </div>

      {scelta && (
        <>
          <p className="sez-azione-nota">
            {modo === 'automatico'
              ? `Spostando una mail in «questa» sezione, l’AI legge la mail (mittente, destinatari, oggetto, testo) ed estrae i dati, che vanno a ${scelta.app} senza chiedere niente. L’esito compare subito in cima alla posta, e resta scritto sotto la mail in «Risposte dalle app» insieme ai dati mandati. Lo smistamento dell’AI e quello delle regole NON fanno partire nulla: solo lo spostamento fatto da te.`
              : `Spostando una mail in «questa» sezione si apre la proposta con i dati già pronti: parte solo quando confermi tu.`}
          </p>
          <label className="field-label" style={{ marginTop: 10 }}>
            Istruzioni per l’AI (facoltative)
          </label>
          <textarea
            rows={2}
            value={istruzioni}
            onChange={(e) => setIstruzioni(e.target.value)}
            placeholder="Es. il nome dell’azienda è quello in firma, non quello nel corpo del testo."
          />
        </>
      )}

      {esito && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12.5,
            color: esito.ok ? 'var(--text-secondary)' : 'var(--red)',
          }}
        >
          {esito.messaggio}
        </div>
      )}

      <div className="form-footer" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => setAperto(false)}
          disabled={inCorso}
        >
          Chiudi
        </button>
        <button
          type="button"
          className="btn primary small"
          disabled={inCorso || !cambiato}
          onClick={() =>
            start(async () => {
              setEsito(await salvaAzioneSezione(sezioneId, azioneId, modo, istruzioni))
            })
          }
        >
          {inCorso ? 'Salvo…' : 'Salva'}
        </button>
      </div>
    </div>
  )
}
