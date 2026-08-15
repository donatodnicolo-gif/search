'use client'

import { useState } from 'react'
import { AllegatiMessaggio } from './AllegatiMessaggio'

/**
 * La graffetta in TESTA alla mail, che si apre e mostra i file da scaricare.
 *
 * ⚠️ L'elenco degli allegati esiste da sempre, ma sta **sotto il corpo della
 * mail**: su un messaggio lungo — o su una catena di risposte citate, che qui
 * sono la norma — vuol dire scorrere fino in fondo per prendere un file che si
 * sa già di volere. Segnalato il 14/08/2026: «dammi possibilità di scaricare
 * allegati subito da qui invece di scorrere in basso». La graffetta diceva
 * quanti sono ed era l'unica cosa in alto: tanto vale renderla il comando.
 *
 * ⚠️ L'elenco si chiede al server solo quando la apri (`AllegatiMessaggio` fa
 * la sua lettura al montaggio): chiuso, questa non costa niente.
 */
export function AllegatiInTesta({ messaggioId, quanti }: { messaggioId: string; quanti: number }) {
  const [aperto, setAperto] = useState(false)

  return (
    <>
      <button
        type="button"
        className="badge neutral"
        aria-expanded={aperto}
        title={aperto ? 'Chiudi l’elenco degli allegati' : `Apri e scarica i ${quanti} allegati`}
        onClick={() => setAperto((v) => !v)}
        style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
      >
        📎 {quanti} {aperto ? '▾' : '▸'}
      </button>

      {/* A tutta riga sotto la striscia dei comandi: gli allegati sono file con
          un nome lungo, non stanno in una pastiglia. */}
      {aperto && (
        <div style={{ flexBasis: '100%', minWidth: 0 }}>
          <AllegatiMessaggio messaggioId={messaggioId} quanti={quanti} />
        </div>
      )}
    </>
  )
}
