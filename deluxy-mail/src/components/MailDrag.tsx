'use client'

import type { ReactNode } from 'react'

/**
 * Rende trascinabile una riga della posta: il drop sulle carte APP DELUXY
 * legge l'id dal dataTransfer. Il contenuto resta renderizzato dal server.
 */
export function MailDrag({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  return (
    <div
      className={className}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/aimail-id', id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      {children}
    </div>
  )
}
