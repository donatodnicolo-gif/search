'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  archiviaDefinitivo,
  archiviaMessaggio,
  cestinaMessaggio,
  segnaLetto,
  segnalaSpam,
  spostaInSezione,
} from '@/lib/actions'
import { DelegaReneBottone, DelegaReneDialog } from './DelegaRene'
import { AgganciaDialog } from './AgganciaRiga'

type Props = {
  id: string
  letto: boolean
  archiviato: boolean
  sezioneId: string | null
  sezioni: { id: string; nome: string }[]
  mittente: string
}

export function AzioniMessaggio({
  id,
  letto,
  archiviato,
  sezioneId,
  sezioni,
  mittente,
}: Props) {
  // Dopo "Archivia": si chiede se rendere l'archiviazione permanente (regola).
  const [chiediSempre, setChiediSempre] = useState(false)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  // La mail è già nella sezione SPAM? (allora niente bottone "Spam": c'è già
  // "Non è spam" nella pagina).
  const giaInSpam = sezioni.find((s) => s.id === sezioneId)?.nome === 'SPAM'

  function esegui(azione: () => Promise<void>) {
    startTransition(async () => {
      await azione()
      router.refresh()
    })
  }

  return (
    <div className="azioni-messaggio">
      {/* Gruppo 1: rispondere / inoltrare / delegare */}
      <div className="azioni-gruppo">
        <Link href={`/messaggio/${id}/scrivi?modo=rispondi`} className="btn primary small">
          Rispondi
        </Link>
        <Link href={`/messaggio/${id}/scrivi?modo=tutti`} className="btn secondary small">
          Rispondi a tutti
        </Link>
        <Link href={`/messaggio/${id}/scrivi?modo=inoltra`} className="btn secondary small">
          Inoltra
        </Link>
        <DelegaReneBottone id={id} variante="bottone" />
        <DelegaReneDialog />
      </div>

      <span className="azioni-sep" />

      {/* Gruppo 2: organizzare (sezione, aggancia altre mail) */}
      <div className="azioni-gruppo">
        <select
          value={sezioneId ?? ''}
          disabled={inCorso}
          onChange={(e) => esegui(() => spostaInSezione(id, e.target.value || null))}
          style={{ width: 'auto', minWidth: 150, padding: '7px 11px', fontSize: 13 }}
        >
          <option value="">Nessuna sezione</option>
          {sezioni.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn secondary small"
          title="Unisci un'altra mail a questa conversazione"
          onClick={() =>
            window.dispatchEvent(new CustomEvent('aimail:aggancia', { detail: { messaggioId: id } }))
          }
        >
          ⚭ Aggancia
        </button>
        <AgganciaDialog />
      </div>

      <span className="azioni-sep" />

      {/* Gruppo 3: stato e cestino */}
      <div className="azioni-gruppo">
        <button
          className="btn secondary small"
          disabled={inCorso}
          onClick={() => esegui(() => segnaLetto(id, !letto))}
        >
          {letto ? 'Segna non letto' : 'Segna letto'}
        </button>

        {!archiviato && !chiediSempre && (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title="Togli dalla posta in arrivo (resta negli Archiviati)"
            onClick={() =>
              // Archivia subito, poi chiedi se per sempre (restando qui).
              startTransition(async () => {
                await archiviaMessaggio(id)
                setChiediSempre(true)
              })
            }
          >
            Archivia
          </button>
        )}

        <button
          className="btn secondary small"
          disabled={inCorso}
          title="Sposta nel cestino di AI Mail (la mail resta sul server)"
          onClick={() =>
            esegui(async () => {
              await cestinaMessaggio(id)
              router.push('/')
            })
          }
        >
          Cestina
        </button>

        {!giaInSpam && (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title="Sposta nello SPAM (posta indesiderata)"
            onClick={() =>
              esegui(async () => {
                await segnalaSpam(id)
                router.push('/')
              })
            }
          >
            Spam
          </button>
        )}
      </div>

      {/* Gruppo 4 (a destra): compare SOLO dopo aver archiviato, per chiedere se
          l'archiviazione vale per sempre (crea la regola sul mittente). */}
      {chiediSempre && (
        <div className="azioni-gruppo azioni-fine">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 320 }}>
            Archiviata. Sempre da <strong>{mittente}</strong>?
          </span>
          <button
            className="btn secondary small"
            disabled={inCorso}
            onClick={() => router.push('/')}
          >
            No, solo questa
          </button>
          <button
            className="btn danger small"
            disabled={inCorso}
            onClick={() =>
              startTransition(async () => {
                const esito = await archiviaDefinitivo(id)
                setStato(esito.messaggio)
                if (esito.ok) router.push('/')
                else {
                  setChiediSempre(false)
                  router.refresh()
                }
              })
            }
          >
            {inCorso ? 'Creo la regola…' : 'Sì, sempre'}
          </button>
        </div>
      )}

      {stato && <div style={{ fontSize: 12, color: 'var(--red)', width: '100%' }}>{stato}</div>}
    </div>
  )
}
