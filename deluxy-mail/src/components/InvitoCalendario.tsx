'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { leggiInvito, rispondiInvito, type EsitoInvito } from '@/lib/actions'
import { mostraFlash } from './Flash'
import { EliminaEvento } from './EliminaEvento'

/**
 * Inviti di calendario RICEVUTI (Outlook, Google, Apple): la mail porta con sé
 * una parte `text/calendar` con data, ora e organizzatore. Qui compaiono
 * **Accetta / Forse / Rifiuta**: l'appuntamento va in agenda e all'organizzatore
 * parte la risposta iCal, quella che gli aggiorna lo stato del partecipante.
 *
 * L'invito si legge DOPO il render (la parte calendario si prende dal server,
 * come gli allegati): aprire la mail resta istantaneo. Se la mail non è un
 * invito, questo componente non mostra niente — ma se un invito C'È e qualcosa
 * non va, lo dice: prima spariva in silenzio e non si capiva perché mancassero
 * i tasti.
 */
const RISPOSTE = {
  ACCEPTED: 'Hai accettato',
  TENTATIVE: 'Hai risposto «forse»',
  DECLINED: 'Hai rifiutato',
} as const

const RISPOSTE_TASTO = { ACCEPTED: 'Accetta', TENTATIVE: 'Forse', DECLINED: 'Rifiuta' } as const

export function InvitoCalendario({ messaggioId }: { messaggioId: string }) {
  const [ricerca, setRicerca] = useState<EsitoInvito | null>(null)
  // L'esito si tiene SOLO quando è andata male (vedi il riquadro rosso in fondo).
  const [esito, setEsito] = useState<string | null>(null)
  // Il pannello «cambia risposta», chiuso finché non lo si chiede.
  const [cambio, setCambio] = useState(false)
  // Che risposta si stava dando quando è fallita: è quella che «Riprova» rifà.
  const [ultimoTentativo, setUltimoTentativo] = useState<'ACCEPTED' | 'TENTATIVE' | 'DECLINED' | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    let vivo = true
    leggiInvito(messaggioId)
      .then((r) => {
        if (vivo) setRicerca(r)
      })
      .catch(() => {
        if (vivo) setRicerca({ stato: 'nessuno' })
      })
    return () => {
      vivo = false
    }
  }, [messaggioId])

  if (!ricerca || ricerca.stato === 'nessuno') return null

  // C'è un invito, ma non si è riusciti a leggerlo: si dice, invece di sparire.
  if (ricerca.stato === 'errore') {
    return (
      <div className="ai-box" style={{ marginBottom: 14 }}>
        <div className="ai-box-title">Invito a un appuntamento</div>
        <div className="ai-box-text">{ricerca.motivo}</div>
      </div>
    )
  }

  const invito = ricerca.invito

  // Invito annullato dall'organizzatore: non si risponde, si avvisa e basta.
  const annullato = invito.metodo === 'CANCEL'

  const rispondi = (stato: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE') =>
    start(async () => {
      const r = await rispondiInvito(messaggioId, stato)
      setEsito(r.ok ? null : r.messaggio)
      setUltimoTentativo(r.ok ? null : stato)
      setCambio(false)
      if (r.ok) {
        mostraFlash(r.messaggio)
        // ⚠️ Il riquadro si RILEGGE dal server: `router.refresh()` da solo
        // rifà i Server Component, ma questo è un componente client e i suoi
        // dati arrivano da `leggiInvito`, che gira una volta sola al
        // montaggio. Senza questa riletura, dopo «Accetta» restavano i tre
        // tasti identici e nessun segno della risposta — la segnalazione.
        leggiInvito(messaggioId).then(setRicerca).catch(() => {})
        router.refresh()
      }
    })

  return (
    <div className="ai-box" style={{ marginBottom: 14 }}>
      <div className="ai-box-title">
        {annullato ? 'Appuntamento annullato' : 'Invito a un appuntamento'}
      </div>
      <div className="ai-box-text">
        <div style={{ fontSize: 15, fontWeight: 600 }}>{invito.titolo}</div>
        <div style={{ marginTop: 4 }}>📅 {invito.quando}</div>
        {invito.luogo && <div style={{ marginTop: 2 }}>📍 {invito.luogo}</div>}
        {invito.organizzatore && (
          <div className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>
            Organizza: {invito.organizzatore}
          </div>
        )}
        {/* ⚠️⚠️ IL NERO DICE COSA FARE, IL BADGE DICE COME STA.
            (Verdetto del custode UX dell'11/09/2026, segnalazione dell'utente:
            «ho accettato ma continua a darmi così».)

            Qui il tasto della risposta data restava PRIMARIO — nero — «come in
            Outlook». Ma nel nostro canone il nero è l'azione da fare adesso, e
            il Libro §3 ne ammette **uno solo per vista**: in una mail il nero è
            già «Rispondi». Risultato: l'invito sembrava ancora da evadere anche
            dopo averlo accettato, e la stessa cosa era detta quattro volte
            (pastiglia, tasto acceso, «hai già risposto», riga di esito) più il
            riquadro «In agenda» sotto.

            Ora: **zero nero in questo riquadro, in tutti gli stati.** Che ci sia
            una domanda aperta lo dice il badge arancione «Da rispondere», non un
            bottone acceso; cosa hai risposto lo dice UN badge; le conseguenze
            (calendario, destinatario della risposta) UNA riga grigia. Cambiare
            idea resta a due click, dietro una pillola secondaria. */}
        <div style={{ marginTop: 8 }}>
          {invito.risposta ? (
            <span
              className={`badge ${
                invito.risposta === 'DECLINED' ? 'red' : invito.risposta === 'TENTATIVE' ? 'neutral' : 'green'
              }`}
            >
              <span className="dot" />
              {RISPOSTE[invito.risposta]}
              {invito.rispostoIl ? ` · ${invito.rispostoIl}` : ''}
            </span>
          ) : (
            !annullato && (
              <span className="badge orange">
                <span className="dot" />
                Da rispondere
              </span>
            )
          )}
        </div>

        {/* Le CONSEGUENZE, in una riga sola: dov'è finito l'appuntamento e a chi
            è andata la risposta. Prima erano un secondo badge verde più una riga
            di esito che ripeteva le stesse parole del toast. */}
        {invito.risposta && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {invito.risposta === 'DECLINED'
              ? 'Non aggiunto al calendario.'
              : invito.eventoId
                ? 'In calendario.'
                : 'Non risulta in calendario.'}{' '}
            {invito.organizzatoreEmail
              ? `Risposta inviata a ${invito.organizzatoreEmail}.`
              : 'L’invito non indica l’organizzatore: nessuna risposta è partita.'}
          </div>
        )}

        {!annullato && (
          <>
            {!invito.risposta || cambio ? (
              <>
                {cambio && (
                  // §7: la conseguenza si scrive PRIMA del click, non dopo.
                  <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                    L’organizzatore riceve subito la nuova risposta.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: cambio ? 6 : 12, flexWrap: 'wrap' }}>
                  {/* Cambiando, la risposta GIÀ DATA non si ripropone: premerla
                      non cambierebbe niente e manderebbe all'organizzatore una
                      mail identica. */}
                  {(['ACCEPTED', 'TENTATIVE', 'DECLINED'] as const)
                    .filter((s) => s !== invito.risposta)
                    .map((s) => (
                      <button
                        key={s}
                        className="btn secondary small"
                        type="button"
                        disabled={inCorso}
                        onClick={() => rispondi(s)}
                      >
                        {inCorso ? '…' : RISPOSTE_TASTO[s]}
                      </button>
                    ))}
                  {cambio && (
                    <button className="btn secondary small" type="button" onClick={() => setCambio(false)} disabled={inCorso}>
                      Annulla
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {invito.eventoId && (
                  <Link href="/calendario" className="btn secondary small">
                    Apri nel calendario
                  </Link>
                )}
                <button className="btn secondary small" type="button" onClick={() => setCambio(true)} disabled={inCorso}>
                  Cambia risposta
                </button>
                {invito.eventoId && <EliminaEvento id={invito.eventoId} className="btn secondary small" etichetta="Togli dal calendario" />}
              </div>
            )}
          </>
        )}

        {/* ⚠️ L'ESITO SI VEDE SOLO SE È ANDATA MALE, e allora si vede DAVVERO.
            Prima questa riga era grigia in entrambi i casi: sul successo
            ripeteva parola per parola il toast (doppione), e sul fallimento
            «Risposta non inviata all'organizzatore» restava una riga smorta
            sotto un badge verde — la cornice non seguiva l'esito (Libro §7). */}
        {esito && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-m)',
              background: 'var(--red-soft)',
              color: 'var(--red)',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>{esito}</span>
            {ultimoTentativo && (
              <button
                className="btn secondary small"
                type="button"
                disabled={inCorso}
                onClick={() => rispondi(ultimoTentativo)}
              >
                Riprova
              </button>
            )}
          </div>
        )}
        {!annullato && !invito.risposta && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Rispondendo, all’organizzatore arriva la conferma e l’appuntamento entra nel tuo
            calendario (con «Rifiuta» non viene aggiunto).
          </div>
        )}
      </div>
    </div>
  )
}
