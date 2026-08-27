'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { azioneMassa, rimettiInPostaMassa, segnalaSpamThread } from '@/lib/actions'
import { idsTrascinati } from './MailDrag'
import { mostraFlash } from './Flash'

/**
 * Voce accesa (M8 — 27/08/2026). Prima `attiva` valeva solo per le voci SENZA
 * query (`!href.includes('?')`): Archivio (`/?stato=archiviati`), Spam e le
 * Sezioni (`/?sezione=…`) non si accendevano MAI, pur essendo la vista corrente.
 * Ora il confronto guarda ANCHE la query: la voce è accesa quando la rotta
 * combacia e OGNI parametro del suo href combacia con l'URL. La voce «piatta»
 * (senza query, es. Posta in arrivo `/`) resta accesa solo quando l'URL non ha
 * un filtro/sezione che appartiene a un'altra voce, così non resta accesa sopra
 * a `/?sezione=…`.
 */
export function useVoceAttiva(href: string): boolean {
  const qui = usePathname()
  const params = useSearchParams()
  const [path, query] = href.split('?')
  if (qui !== path) return false
  if (query) {
    const attesi = new URLSearchParams(query)
    return [...attesi.entries()].every(([k, v]) => params.get(k) === v)
  }
  // Voce piatta: non deve restare accesa quando è attivo un filtro/sezione.
  return !params.get('sezione') && !params.get('stato')
}

/**
 * I colori delle sezioni arrivano dal DB (M15 — 27/08/2026): `var(--${colore})`
 * interpolato a crudo dava un pallino TRASPARENTE per qualunque valore non
 * tokenizzato. Qui la whitelist dei colori ammessi (gli stessi del selettore in
 * `sezioni/page.tsx`), con ripiego al neutro.
 */
const COLORI_SEZIONE = new Set(['blue', 'green', 'orange', 'red', 'purple', 'gold'])
export function coloreSezione(colore: string | null | undefined): string {
  return colore && COLORI_SEZIONE.has(colore) ? `var(--${colore})` : 'var(--grey)'
}

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
  icona,
  children,
}: {
  href: string
  label: string
  badge?: number | null
  bersaglio?: Bersaglio
  icona?: React.ReactNode
  children?: React.ReactNode
}) {
  // ⚠️⚠️ DOVE SONO. Il CSS per la voce accesa (`.nav-item.active`) c'era da
  // sempre, ma la classe non veniva messa da nessuna parte: in una barra con
  // ventuno destinazioni, tutte nere e dello stesso peso, non c’era modo di
  // sapere in quale schermata si fosse — e siccome le pagine sono tutte
  // dinamiche, premendo una voce non cambiava niente finché il server non
  // rispondeva. Chi non vede reazione, ripreme.
  // ⚠️ Il confronto è ESATTO, non `startsWith`: con `startsWith` la home («/»)
  // combacerebbe con qualunque indirizzo e resterebbe accesa sempre.
  // ⚠️ Le SEZIONI e i filtri stanno nella query: `useVoceAttiva` la confronta.
  const attiva = useVoceAttiva(href)

  return (
    <DropMail bersaglio={bersaglio} label={label} className="nav-item-riga">
      <Link href={href} className={attiva ? 'nav-item active' : 'nav-item'} aria-current={attiva ? 'page' : undefined}>
        {icona}
        <span style={{ flex: 1 }}>{label}</span>
        {badge ? <span className="badge neutral">{badge}</span> : null}
      </Link>
      {children}
    </DropMail>
  )
}

/**
 * La voce di una SEZIONE (M8/M9/M15). Ha un contenuto proprio — il pallino del
 * colore — perciò non passa da `VoceMenu`, ma condivide la stessa logica di
 * voce accesa e il colore passato dalla whitelist.
 */
export function VoceSezione({
  href,
  nome,
  colore,
  badge,
  sotto,
}: {
  href: string
  nome: string
  colore: string | null | undefined
  badge?: number | null
  sotto?: boolean
}) {
  const attiva = useVoceAttiva(href)
  return (
    <Link
      href={href}
      className={`nav-item ${sotto ? 'sotto' : ''}${attiva ? ' active' : ''}`}
      aria-current={attiva ? 'page' : undefined}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <span
          className="dot"
          style={{ width: 7, height: 7, borderRadius: '50%', background: coloreSezione(colore), flex: '0 0 7px' }}
        />
        {nome}
      </span>
      {badge ? <span className="badge neutral">{badge}</span> : null}
    </Link>
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
