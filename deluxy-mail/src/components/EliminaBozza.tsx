'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminaBozza } from '@/lib/actions'

export function EliminaBozza({ id }: { id: string }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function ferma(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  if (!conferma) {
    return (
      <button
        type="button"
        className="archivia-def"
        onClick={(e) => {
          ferma(e)
          setConferma(true)
        }}
      >
        Elimina
      </button>
    )
  }

  return (
    <span className="archivia-def-conferma" onClick={ferma}>
      <span>Butto via questa bozza?</span>
      <button
        type="button"
        className="archivia-def"
        disabled={inCorso}
        onClick={(e) => {
          ferma(e)
          setConferma(false)
        }}
      >
        No
      </button>
      <button
        type="button"
        className="archivia-def si"
        disabled={inCorso}
        onClick={(e) => {
          ferma(e)
          startTransition(async () => {
            await eliminaBozza(id)
            router.refresh()
          })
        }}
      >
        Sì
      </button>
    </span>
  )
}
