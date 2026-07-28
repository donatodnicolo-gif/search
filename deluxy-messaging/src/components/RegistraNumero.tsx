'use client'

import { useState } from 'react'

// Registra un numero sulla Cloud API: il passo che lo rende CONNESSO e capace
// di ricevere messaggi.
//
// ⚠️ Il PIN si digita qui e va dritto a Meta: non lo salviamo. È il secondo
// fattore di un numero aziendale, e tenerne una copia in un gestionale non
// servirebbe a niente — per registrare di nuovo lo si richiede a chi l'ha
// scelto. Per lo stesso motivo il campo è di tipo password e non si ricompila
// da solo.
//
// Il token non lo tocca nessuno: usa quello già in cassaforte dell'app.

export function RegistraNumero({
  phoneNumberId,
  etichetta,
}: {
  phoneNumberId: string
  etichetta: string
}) {
  const [pin, setPin] = useState('')
  const [codice, setCodice] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState('')
  const [errore, setErrore] = useState('')
  // Il passo successivo suggerito dal server quando Meta rifiuta: un errore
  // che non dice la mossa seguente lascia fermi davanti a un rosso.
  const [cosaFare, setCosaFare] = useState('')

  async function registra() {
    setInCorso(true)
    setEsito('')
    setErrore('')
    setCosaFare('')
    try {
      const res = await fetch('/api/whatsapp/registra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, pin }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        messaggio?: string
        errore?: string
        cosaFare?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Registrazione non riuscita.')
        setCosaFare(d.cosaFare ?? '')
        return
      }
      setEsito(d.messaggio || 'Numero registrato.')
      setPin('') // il PIN non resta nemmeno nel campo
    } catch {
      setErrore('Registrazione non riuscita: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  async function chiediCodice(metodo: 'VOICE' | 'SMS') {
    setInCorso(true)
    setEsito('')
    setErrore('')
    setCosaFare('')
    try {
      const res = await fetch('/api/whatsapp/codice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, metodo }),
      })
      const d = (await res.json().catch(() => ({}))) as { messaggio?: string; errore?: string }
      if (!res.ok) setErrore(d.errore || 'Richiesta non riuscita.')
      else setEsito(d.messaggio || 'Codice richiesto.')
    } catch {
      setErrore('Richiesta non riuscita: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  async function confermaCodice() {
    setInCorso(true)
    setEsito('')
    setErrore('')
    setCosaFare('')
    try {
      const res = await fetch('/api/whatsapp/codice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, codice }),
      })
      const d = (await res.json().catch(() => ({}))) as { messaggio?: string; errore?: string }
      if (!res.ok) setErrore(d.errore || 'Verifica non riuscita.')
      else {
        setEsito(d.messaggio || 'Numero verificato.')
        setCodice('')
      }
    } catch {
      setErrore('Verifica non riuscita: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {/* ⚠️ I due codici NON sono la stessa cosa, e confonderli fa perdere
          tempo: il CODICE si riceve (SMS o telefonata) e dimostra che il numero
          è tuo; il PIN lo SCEGLI tu ed è la verifica in due passaggi. */}
      <p className="descrizione" style={{ marginBottom: 6 }}>
        <strong>1. Verifica il numero.</strong> Serve se non è mai stato verificato{' '}
        <em>oppure se la verifica è scaduta</em> — succede, e allora la registrazione al passo 2
        viene rifiutata con «re-verification needed». Meta detta un codice di 6 cifre: su un fisso
        serve la telefonata, l&apos;SMS non arriva.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-secondario small"
          onClick={() => chiediCodice('VOICE')}
          disabled={inCorso}
        >
          Fatti chiamare
        </button>
        <button
          type="button"
          className="btn btn-secondario small"
          onClick={() => chiediCodice('SMS')}
          disabled={inCorso}
        >
          Manda un SMS
        </button>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={codice}
          onChange={(e) => setCodice(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="codice ricevuto"
          aria-label={`Codice ricevuto per ${etichetta}`}
          style={{ width: 140 }}
        />
        <button
          type="button"
          className="btn btn-secondario small"
          onClick={confermaCodice}
          disabled={inCorso || codice.length !== 6}
        >
          Conferma codice
        </button>
      </div>

      <p className="descrizione" style={{ marginBottom: 6 }}>
        <strong>2. Registra il numero.</strong> Qui il PIN di 6 cifre <strong>lo scegli tu</strong>:
        è la verifica in due passaggi di {etichetta}, non si riceve da nessuna parte. Se ne era già
        stato impostato uno, usa quello — se è perduto si azzera da WhatsApp Manager.{' '}
        <strong>Annotalo</strong>: serve per registrare il numero di nuovo, e noi non lo
        conserviamo.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="PIN a 6 cifre"
          aria-label={`PIN di 6 cifre per ${etichetta}`}
          style={{ width: 150 }}
        />
        <button
          type="button"
          className="btn btn-secondario small"
          onClick={registra}
          disabled={inCorso || pin.length !== 6}
        >
          {inCorso ? 'Registro…' : 'Registra il numero'}
        </button>
      </div>
      {esito ? <div className="avviso-ok">{esito}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}
      {cosaFare ? (
        <p className="descrizione" style={{ marginTop: 6 }}>
          <strong>Cosa fare:</strong> {cosaFare}
        </p>
      ) : null}
    </div>
  )
}
