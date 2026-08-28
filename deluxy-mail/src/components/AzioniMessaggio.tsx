'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  archiviaDefinitivo,
  archiviaThreadSenzaAggiornare,
  disarchiviaThread,
  segnaLetto,
  segnalaSpamThread,
  smaltisciEProssimo,
  spostaInSezione,
} from '@/lib/actions'
import { mettiFlash, mostraFlash } from './Flash'
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
  /** Quante mail ha la conversazione: sotto le due non si chiede niente. */
  nelThread?: number
}

/**
 * Le azioni sulla mail aperta, con una GERARCHIA.
 *
 * ⚠️ Prima erano quindici comandi tutti uguali, in fila («veramente troppo
 * incasinato», 25/08/2026) — e comprimere non bastava: quindici pillole
 * identiche restano quindici pillole. In vista restano le quattro cose che si
 * fanno di continuo — Rispondi, Inoltra, Archivia, Cestina — e TUTTO il resto
 * sta dietro «⋯ Altro», a un clic: nessuna azione tolta (regola di casa),
 * cambia solo quante ne gridano contemporaneamente.
 */
export function AzioniMessaggio({
  id,
  letto,
  archiviato,
  sezioneId,
  sezioni,
  mittente,
  nelThread = 1,
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

  // Cestinando una conversazione: quale delle due cose si voleva davvero.
  const [chiediCestina, setChiediCestina] = useState(false)

  // Dopo "Archivia": si chiede se rendere l'archiviazione permanente (regola).
  const [chiediSempre, setChiediSempre] = useState(false)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  // Il menù «⋯ Altro»: si chiude cliccando fuori o con Esc.
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const giu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('mousedown', giu)
    document.addEventListener('keydown', tasto)
    return () => {
      document.removeEventListener('mousedown', giu)
      document.removeEventListener('keydown', tasto)
    }
  }, [menu])

  // La mail è già nella sezione SPAM? (allora niente voce "Spam": c'è già
  // "Non è spam" nella pagina).
  const giaInSpam = sezioni.find((s) => s.id === sezioneId)?.nome === 'SPAM'

  function esegui(azione: () => Promise<void>) {
    startTransition(async () => {
      await azione()
      router.refresh()
    })
  }

  return (
    <>
    <div className="azioni-messaggio">
      {/* IN VISTA: le quattro azioni d'uso continuo. La lettera stampata sul
          bottone È la scorciatoia (su touch sparisce: niente tastiera). */}
      <div className="azioni-gruppo">
        <Link
          href={`/messaggio/${id}/scrivi?modo=rispondi`}
          className="btn primary small"
          title="Rispondi (tasto R)"
        >
          Rispondi <kbd className="tasto">R</kbd>
        </Link>
        <Link
          href={`/messaggio/${id}/scrivi?modo=inoltra`}
          className="btn secondary small"
          title="Inoltra (tasto I, oppure F)"
        >
          Inoltra <kbd className="tasto">I</kbd>
        </Link>

        {!archiviato && !chiediSempre && (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title="Togli dalla posta in arrivo, resta negli Archiviati (tasto E)"
            onClick={() =>
              // Archivia subito (SENZA refresh, così la domanda resta), poi
              // chiedi se per sempre restando qui. Archivia TUTTA la
              // conversazione: in elenco una riga è un thread.
              startTransition(async () => {
                const r = await archiviaThreadSenzaAggiornare(id)
                // ⚠️ Un segno che è successo qualcosa: sul telefono si toccava
                // «Archivia», il bottone spariva, e basta — nessun avviso,
                // nessun aggiornamento. Chi non vede niente riprova.
                mostraFlash(r?.messaggio ?? 'Archiviata.', r && r.ok === false ? 'errore' : 'ok')
                setChiediSempre(true)
              })
            }
          >
            Archivia <kbd className="tasto">E</kbd>
          </button>
        )}

        {/* ⚠️ L'archivio non è una porta a senso unico: archiviata la mail, al
            posto di «Archivia» compare il modo di tornare indietro. */}
        {archiviato && (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title="Rimetti questa conversazione in Posta in arrivo"
            onClick={() =>
              esegui(async () => {
                const r = await disarchiviaThread(id)
                mostraFlash(r.messaggio, r.ok ? 'ok' : 'errore')
                router.refresh()
              })
            }
          >
            Togli dall’archivio
          </button>
        )}

        {/* ⚠️⚠️ Questo bottone cestinava TUTTA LA CONVERSAZIONE, e basta.
            Il commento di prima diceva che una conferma avrebbe spezzato il
            flusso da tastiera, e per un po' è stata la scelta giusta: si
            diceva la verità nel titolo e nell'avviso dopo.
            Non bastava. Su una conversazione da 67 messaggi l'avviso arrivava
            a cose fatte — «Nel cestino: 11 messaggi» — e chi voleva buttare
            UNA mail ne aveva buttate undici (segnalato il 27/08/2026). Un
            avviso che descrive un danno non è un rimedio.
            ⚠️ La domanda compare SOLO se c'è davvero una scelta da fare (più
            di una mail nella conversazione): su una mail sola sarebbe un
            ostacolo senza motivo, e il tasto `Canc` continua a funzionare
            come sempre.
            ⚠️ Il primo bottone, quello che si prende il fuoco, è «Solo
            questa»: di due strade è quella che si disfa più facilmente. */}
        {chiediCestina ? (
          <span className="azioni-esito">
            <span>Cestino tutta la conversazione ({nelThread}) o solo questa mail?</span>
            <button
              type="button"
              className="btn primary small"
              autoFocus
              disabled={inCorso}
              onClick={() =>
                startTransition(async () => {
                  setChiediCestina(false)
                  const r = await smaltisciEProssimo(id, 'cestina', true)
                  mettiFlash(r.messaggio, r.ok ? 'ok' : 'errore')
                  router.push(r.prossimo ? `/messaggio/${r.prossimo}` : '/')
                })
              }
            >
              Solo questa
            </button>
            <button
              type="button"
              className="btn secondary small"
              disabled={inCorso}
              onClick={() =>
                startTransition(async () => {
                  setChiediCestina(false)
                  const r = await smaltisciEProssimo(id, 'cestina')
                  mettiFlash(r.messaggio, r.ok ? 'ok' : 'errore')
                  router.push(r.prossimo ? `/messaggio/${r.prossimo}` : '/')
                })
              }
            >
              Tutta la conversazione ({nelThread})
            </button>
            <button type="button" className="azione-riga" onClick={() => setChiediCestina(false)}>
              Annulla
            </button>
          </span>
        ) : (
          <button
            className="btn secondary small"
            disabled={inCorso}
            title={
              nelThread > 1
                ? `Questa mail fa parte di una conversazione da ${nelThread}: chiede se cestinare solo questa o tutte (tasto Canc)`
                : 'Sposta la mail nel cestino e apre la successiva. Sulla casella la mail resta (tasto Canc)'
            }
            onClick={() => {
              if (nelThread > 1) {
                setChiediCestina(true)
                return
              }
              startTransition(async () => {
                const r = await smaltisciEProssimo(id, 'cestina', true)
                mettiFlash(r.messaggio, r.ok ? 'ok' : 'errore')
                router.push(r.prossimo ? `/messaggio/${r.prossimo}` : '/')
              })
            }}
          >
            Cestina <kbd className="tasto">Canc</kbd>
          </button>
        )}
      </div>

      {/* TUTTO IL RESTO, dietro «⋯ Altro». */}
      <div className="azioni-gruppo menu-ancora" ref={menuRef}>
        <button
          type="button"
          className="btn secondary small"
          aria-haspopup="menu"
          aria-expanded={menu}
          title="Le altre azioni: rispondi a tutti, delega, sezione, aggancia, spam…"
          onClick={() => setMenu((v) => !v)}
        >
          ⋯ Altro
        </button>

        {menu && (
          <div className="menu-azioni" role="menu">
            <Link
              href={`/messaggio/${id}/scrivi?modo=tutti`}
              className="menu-voce"
              role="menuitem"
              onClick={() => setMenu(false)}
            >
              Rispondi a tutti <kbd className="tasto">T</kbd>
            </Link>
            <span onClick={() => setMenu(false)}>
              <DelegaReneBottone id={id} variante="bottone" />
            </span>
            <button
              type="button"
              className="menu-voce"
              role="menuitem"
              onClick={() => {
                setMenu(false)
                window.dispatchEvent(
                  new CustomEvent('aimail:aggancia', { detail: { messaggioId: id } })
                )
              }}
            >
              ⚭ Aggancia un’altra mail
            </button>
            <button
              type="button"
              className="menu-voce"
              role="menuitem"
              disabled={inCorso}
              onClick={() => {
                setMenu(false)
                esegui(async () => {
                  setELetta(!eLetta)
                  await segnaLetto(id, !eLetta)
                })
              }}
            >
              {eLetta ? 'Segna non letto' : 'Segna letto'}
            </button>
            {!giaInSpam && (
              <button
                type="button"
                className="menu-voce"
                role="menuitem"
                disabled={inCorso}
                onClick={() => {
                  setMenu(false)
                  esegui(async () => {
                    await segnalaSpamThread(id)
                    router.push('/')
                  })
                }}
              >
                Segna come spam
              </button>
            )}
            <button
              type="button"
              className="menu-voce tasti-aiuto"
              role="menuitem"
              onClick={() => {
                setMenu(false)
                apriScorciatoie()
              }}
            >
              ⌨ Scorciatoie da tastiera
            </button>

            <div className="menu-etichetta">Sposta in sezione</div>
            <select
              value={sezioneId ?? ''}
              disabled={inCorso}
              onChange={(e) => {
                setMenu(false)
                // La sezione d'arrivo può chiamare un'app Deluxy: la proposta
                // si apre qui, oppure l'invio automatico è già partito.
                esegui(async () => {
                  dopoSpostamento(id, await spostaInSezione(id, e.target.value || null))
                })
              }}
            >
              <option value="">Nessuna sezione</option>
              {sezioni.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* I dialoghi stanno FUORI dal menù: devono restare montati anche quando
          il menù si chiude, o l'evento che li apre non troverebbe nessuno. */}
      <DelegaReneDialog />
      <AgganciaDialog />

    </div>

    {/* ⚠️⚠️ FUORI dalla barra. Sul telefono `.azioni-messaggio` è una striscia
        FISSA in fondo, `flex-wrap: nowrap` con `overflow-x: auto`: questa
        domanda — che crea una REGOLA PERMANENTE sul mittente — e il messaggio di
        errore nascevano a destra dei bottoni, **oltre il bordo dello schermo**,
        in una barra la cui barra di scorrimento su iOS è invisibile. Una
        decisione permanente proposta e mai mostrata, e un fallimento che si
        legge come successo. Ora stanno in un riquadro loro, che sul telefono si
        appoggia SOPRA la striscia (stesso trattamento del menu «⋯ Altro», che
        questo problema lo aveva già risolto per sé). */}
    {(chiediSempre || stato) && (
      <div className="azioni-esito">
      {/* Compare SOLO dopo aver archiviato, per chiedere se l'archiviazione
          vale per sempre (crea la regola sul mittente). */}
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
    )}
    </>
  )
}
