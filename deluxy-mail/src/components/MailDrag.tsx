'use client'

import type { ReactNode } from 'react'

/** Il formato storico: UN id, letto dalle carte APP DELUXY. Resta com'era. */
export const FORMATO_ID = 'text/aimail-id'
/**
 * Il formato nuovo: TUTTI gli id trascinati (JSON). Serve allo spostamento nel
 * menu — dove una riga è un THREAD, e spostarne una mail sola la farebbe
 * ricomparire col messaggio precedente (la trappola già pagata tre volte in
 * quest'app) — e alla selezione multipla, che trascina tutto il gruppo.
 */
export const FORMATO_IDS = 'text/aimail-ids'

/** Gli id trascinati, da un evento di drop. Vuoto se non è una mail. */
export function idsTrascinati(dt: DataTransfer): string[] {
  try {
    const molti = dt.getData(FORMATO_IDS)
    if (molti) {
      const v = JSON.parse(molti)
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v
    }
  } catch {
    // JSON rotto: si ripiega sull'id singolo, non si butta il gesto.
  }
  const uno = dt.getData(FORMATO_ID)
  return uno ? [uno] : []
}

/**
 * Rende trascinabile una riga della posta. Il drop sulle carte APP DELUXY legge
 * l'id singolo; il drop sulle voci del menu (sezioni, Archivio, Spam, Cestino)
 * legge `ids` e sposta tutta la conversazione. Il contenuto resta renderizzato
 * dal server.
 *
 * ⚠️ `effectAllowed = 'copyMove'`: le app Deluxy sono una COPIA (la mail resta
 * dov'è), lo spostamento nel menu è un MOVE. Con 'copy' secco il cursore
 * mentiva sul secondo caso.
 */
export function MailDrag({
  id,
  ids,
  className,
  children,
}: {
  id: string
  /** Gli id da spostare: la conversazione, o l'intera selezione. */
  ids?: string[]
  className: string
  children: ReactNode
}) {
  return (
    <div
      className={className}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(FORMATO_ID, id)
        e.dataTransfer.setData(FORMATO_IDS, JSON.stringify(ids?.length ? ids : [id]))
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
    >
      {children}
    </div>
  )
}
