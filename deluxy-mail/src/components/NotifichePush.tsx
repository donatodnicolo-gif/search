'use client'

import { useEffect, useState } from 'react'
import { salvaIscrizionePush, rimuoviIscrizionePush, notificaProva } from '@/lib/actions'

const CHIAVE_PUBBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

// La chiave VAPID pubblica va convertita in Uint8Array per PushManager.subscribe.
function base64UrlToUint8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Attiva/disattiva le notifiche push su QUESTO dispositivo. Registra il service
 * worker, chiede il permesso, si iscrive e salva l'iscrizione sul server.
 */
export function NotifichePush() {
  const [supportato, setSupportato] = useState(true)
  const [attivo, setAttivo] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [stato, setStato] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupportato(false)
      return
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setAttivo(Boolean(sub)))
      .catch(() => {})
  }, [])

  async function attiva() {
    setStato(null)
    if (!CHIAVE_PUBBLICA) {
      setStato('Notifiche non configurate sul server (manca la chiave VAPID pubblica).')
      return
    }
    setInCorso(true)
    try {
      const permesso = await Notification.requestPermission()
      if (permesso !== 'granted') {
        setStato('Permesso negato: attiva le notifiche per questo sito dal browser.')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8(CHIAVE_PUBBLICA) as BufferSource,
      })
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const esito = await salvaIscrizionePush({
        endpoint: j.endpoint || '',
        keys: { p256dh: j.keys?.p256dh || '', auth: j.keys?.auth || '' },
      })
      if (esito.ok) {
        setAttivo(true)
        setStato('Notifiche attivate su questo dispositivo.')
      } else {
        setStato('Non sono riuscito a salvare l’iscrizione. Riprova.')
      }
    } catch {
      setStato('Attivazione non riuscita. Su iPhone: aggiungi prima l’app alla schermata Home.')
    } finally {
      setInCorso(false)
    }
  }

  async function disattiva() {
    setStato(null)
    setInCorso(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await rimuoviIscrizionePush(sub.endpoint)
        await sub.unsubscribe()
      }
      setAttivo(false)
      setStato('Notifiche disattivate su questo dispositivo.')
    } catch {
      setStato('Non sono riuscito a disattivare. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  if (!supportato) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
        Questo dispositivo/browser non supporta le notifiche push. Su iPhone funzionano solo se
        aggiungi l’app alla schermata Home (Safari → Condividi → Aggiungi a Home).
      </div>
    )
  }

  async function prova() {
    setStato(null)
    setInCorso(true)
    try {
      const esito = await notificaProva()
      setStato(esito.messaggio)
    } catch {
      setStato('Invio di prova non riuscito. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${attivo ? 'secondary' : 'primary'}`}
          onClick={attivo ? disattiva : attiva}
          disabled={inCorso}
        >
          {inCorso ? '…' : attivo ? 'Disattiva su questo dispositivo' : 'Attiva le notifiche'}
        </button>
        {/* La prova va a TUTTI i dispositivi iscritti: se arriva, la catena
            (chiavi VAPID → iscrizione → consegna) funziona. */}
        <button type="button" className="btn secondary" onClick={prova} disabled={inCorso}>
          Invia notifica di prova
        </button>
      </div>
      {stato && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 8 }}>{stato}</div>
      )}
    </div>
  )
}
