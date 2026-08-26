'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { azioneMassa, rimettiInPostaMassa, segnalaSpamThread } from '@/lib/actions'
import { idsTrascinati } from './MailDrag'
import { mostraFlash } from './Flash'

/** Cosa succede lasciando cadere delle mail su questa voce del menu. */
export type Bersaglio =
  | { tipo: 'sezione'; sezioneId: string }
  | { tipo: 'posta' }
  | { tipo: 'archivio' }
  | { tipo: 'spam' }
  | { tipo: 'cestino' }

/**
 * Una voce del menu che accetta il TRASCINAMENTO delle mail (chiesto il
 * 17/08/2026: «permetti drag and drop per spostare le mail in altre caselle o
 * metterle nel cestino»).
 *
 * ⚠️ Si sposta la CONVERSAZIONE, non la mail di testa: gli id arrivano dalla
 * riga, che li conosce già (`RigaData.ids`), o dall'intera selezione. In questa
 * app una riga È un thread, e spostarne una mail sola la fa ricomparire col
 * messaggio precedente — è la trappola già rientrata tre volte.
 * ⚠️ Il link resta un link: si trascina *sopra* una voce di navigazione, quindi
 * il clic normale deve continuare a funzionare identico.
 * ⚠️ `dragOver` deve chiamare `preventDefault()` o il browser non lascia
 * cadere niente (e non c'è nessun errore: semplicemente non succede nulla).
 */
export function VoceMenu({
  href,
  label,
  badge,
  bersaglio,
  children,
}: {
  href: string
  label: string
  badge?: number | null
  bersaglio?: Bersaglio
  children?: React.ReactNode
}) {
  return (
    <DropMail bersaglio={bersaglio} label={label} className="nav-item-riga">
      <Link href={href} className="nav-item">
        <span style={{ flex: 1 }}>{label}</span>
        {badge ? <span className="badge neutral">{badge}</span> : null}
      </Link>
      {children}
    </DropMail>
  )
}

/**
 * Il contenitore che ACCETTA le mail trascinate. Sta a parte da `VoceMenu`
 * perché le SEZIONI hanno un contenuto loro (il pallino colorato) e devono
 * poter riusare lo stesso comportamento senza ridisegnarsi.
 */
export function DropMail({
  bersaglio,
  label,
  className,
  children,
}: {
  bersaglio?: Bersaglio
  label: string
  className: string
  children: React.ReactNode
}) {
  const [sopra, setSopra] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const lascia = (e: React.DragEvent) => {
    if (!bersaglio) return
    const ids = idsTrascinati(e.dataTransfer)
    setSopra(false)
    if (ids.length === 0) return
    e.preventDefault()
    start(async () => {
      const r =
        bersaglio.tipo === 'sezione'
          ? await azioneMassa(ids, 'sposta', bersaglio.sezioneId)
          : bersaglio.tipo === 'archivio'
            ? await azioneMassa(ids, 'archivia')
            : bersaglio.tipo === 'cestino'
              ? await azioneMassa(ids, 'cestina')
              : bersaglio.tipo === 'posta'
                ? await rimettiInPostaMassa(ids)
                : // Lo SPAM passa da `segnalaSpamThread`: è l'unico che deve
                  // anche far seguire la Posta indesiderata della casella, e
                  // sa già farlo per tutta la conversazione.
                  await spamDiTutti(ids)
      mostraFlash(r.messaggio || `Spostate in ${label}.`, r.ok ? 'ok' : 'errore')
      router.refresh()
    })
  }

  return (
    <div
      className={`${className}${sopra ? ' drop-sopra' : ''}${inCorso ? ' drop-incorso' : ''}`}
      onDragOver={(e) => {
        if (!bersaglio) return
        e.preventDefault() // senza questo il drop non avviene, e in silenzio
        e.dataTransfer.dropEffect = 'move'
        if (!sopra) setSopra(true)
      }}
      onDragLeave={() => setSopra(false)}
      onDrop={lascia}
      title={bersaglio ? `Trascina qui le mail per spostarle in ${label}` : undefined}
    >
      {children}
    </div>
  )
}

/** Spam di tutte le mail trascinate, una conversazione per volta. */
async function spamDiTutti(ids: string[]): Promise<{ ok: boolean; messaggio: string }> {
  let n = 0
  for (const id of ids) {
    const r = await segnalaSpamThread(id)
    if (r.ok) n++
  }
  return { ok: n > 0, messaggio: n === 1 ? 'Spostata nello SPAM.' : `${n} conversazioni spostate nello SPAM.` }
}
