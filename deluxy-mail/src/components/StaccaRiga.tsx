'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { staccaDalThread } from '@/lib/actions'

/**
 * Il bottoncino «Stacca» accanto a una riga della conversazione: toglie QUELLA
 * mail dal thread (anche quando è unita dalla catena di risposte, non solo a
 * mano). Da lì in poi resta per conto suo finché non la si riaggancia.
 */
export function StaccaRiga({ messaggioId }: { messaggioId: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const stacca = () =>
    start(async () => {
      await staccaDalThread(messaggioId)
      router.refresh()
    })

  return (
    <button
      type="button"
      className="btn secondary small"
      title="Togli questa mail dalla conversazione"
      onClick={stacca}
      disabled={inCorso}
      style={{ flexShrink: 0 }}
    >
      {inCorso ? '…' : 'Stacca'}
    </button>
  )
}
