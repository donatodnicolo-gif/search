'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  archiviaDefinitivo,
  archiviaThreadSenzaAggiornare,
  segnaLetto,
  segnalaSpamThread,
  smaltisciEProssimo,
  spostaInSezione,
} from '@/lib/actions'
import { DelegaReneBottone, DelegaReneDialog } from './DelegaRene'
import { apriScorciatoie } from './Scorciatoie'
import { EVENTO_LETTA } from './SegnaLettaAllApertura'
import { AgganciaDialog } from './AgganciaRiga'
import { dopoSpostamento } from './dopoSpostamento'

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
  // Lo stato «letta» si tiene anche qui: aprendo la mail viene segnata letta
  // subito dopo il render (SegnaLettaAllApertura), e senza questo il bottone
  // continuerebbe a dire «Segna letto» su una mail già letta. Si aggiorna con
  // un evento invece che con un `router.refresh()`, che rifarebbe l'intera
  // pagina per cambiare una parola.
  const [eLetta, setELetta] = useState(letto)
  useEffect(() => setELetta(letto), [letto])
  useEffect(() => {
    const su = (e: Event) => {
      if ((e as CustomEvent).detail?.id === id) setELetta(true)
    }
    window.addEventListener(EVENTO_LETTA, su)
    return () => window.removeEventListener(EVENTO_LETTA, su)
  }, [id])

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
      {/* Gruppo 1: rispondere / inoltrare / delegare.
          La lettera stampata sul bottone È la scorciatoia: scritte solo
          nell'elenco che si apre col «?», le trovava soltanto chi già sapeva
          che esistevano. Su schermo stretto spariscono (niente tastiera). */}
      <div className="azioni-gruppo">
        <Link
          href={`/messaggio/${id}/scrivi?modo=rispondi`}
          className="btn primary small"
          title="Rispondi (tasto R)"
        >
          Rispondi <kbd className="tasto">R</kbd>
        </Link>
        <Link
          href={`/messaggio/${id}/scrivi?modo=tutti`}
          className="btn secondary small"
          title="Rispondi a tutti (tasto T, oppure A)"
        >
          Rispondi a tutti <kbd className="tasto">T</kbd>
        </Link>
        <Link
          href={`/messaggio/${id}/scrivi?modo=inoltra`}
          className="btn secondary small"
          title="Inoltra (tasto I, oppure F)"
        >
          Inoltra <kbd className="tasto">I</kbd>
        </Link>
        <DelegaReneBottone id={id} variante="bottone" />
        <DelegaReneDialog />
        <button
          type="button"
          className="azione-riga tasti-aiuto"
          title="Tutte le scorciatoie da tastiera (anche col tasto ?)"
          onClick={apriScorciatoie}
        >
          ⌨ Scorciatoie
        </button>
      </div>

      <span className="azioni-sep" />

      {/* Gruppo 2: organizzare (sezione, aggancia altre mail) */}
      <div className="azioni-gruppo">
        <select
          value={sezioneId ?? ''}
          disabled={inCorso}
          onChange={(e) =>
            // La sezione d'arrivo può chiamare un'app Deluxy: la proposta si
            // apre qui, oppure l'invio automatico è già partito.
            esegui(async () => {
              dopoSpostamento(id, await spostaInSezione(id, e.target.value || null))
            })
          }
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
          onClick={() =>
            esegui(async () => {
              setELetta(!eLetta)
              await segnaLetto(id, !eLetta)
            })
          }
        >
          {eLetta ? 'Segna non letto' : 'Segna letto'}
        </button>

        {!archiviato && !chiediSempre && (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title="Togli dalla posta in arrivo, resta negli Archiviati (tasto E)"
            onClick={() =>
              // Archivia subito (SENZA refresh, così la domanda resta), poi
              // chiedi se per sempre restando qui.
              // Archivia TUTTA la conversazione: la pagina mostra il thread,
              // e in elenco una riga è un thread — archiviarne una sola la
              // farebbe ricomparire col messaggio precedente.
              startTransition(async () => {
                await archiviaThreadSenzaAggiornare(id)
                setChiediSempre(true)
              })
            }
          >
            Archivia <kbd className="tasto">E</kbd>
          </button>
        )}

        <button
          className="btn secondary small"
          disabled={inCorso}
          title="Sposta nel cestino e apri la mail successiva, la mail resta sul server (tasto Canc)"
          onClick={() =>
            // Come il tasto Canc: cestinata questa si apre la successiva,
            // invece di rimandare all'elenco a ricominciare da capo.
            startTransition(async () => {
              const r = await smaltisciEProssimo(id, 'cestina')
              router.push(r.prossimo ? `/messaggio/${r.prossimo}` : '/')
            })
          }
        >
          Cestina <kbd className="tasto">Canc</kbd>
        </button>

        {!giaInSpam && (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title="Sposta nello SPAM (posta indesiderata)"
            onClick={() =>
              esegui(async () => {
                await segnalaSpamThread(id)
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
