'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { segnaAttivita } from '@/lib/actions'

export function CheckAttivita({ id, fatta }: { id: string; fatta: boolean }) {
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  return (
    <input
      type="checkbox"
      checked={fatta}
      disabled={inCorso}
      aria-label={fatta ? 'Segna da fare' : 'Segna fatta'}
      style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--ink)', cursor: 'pointer' }}
      onChange={(e) => {
        const nuovo = e.target.checked
        startTransition(async () => {
          await segnaAttivita(id, nuovo)
          router.refresh()
        })
      }}
    />
  )
}
