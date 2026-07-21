import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { salvaMemoriaRene, salvaStileRene, salvaGuidaGestione } from '@/lib/actions'
import { CHIAVI, STILE_DEFAULT, leggiImpostazioni } from '@/lib/impostazioni'
import { StoricoPriorita } from '@/components/StoricoPriorita'
import { TIPI_RENE, type UrgenteSenzaRisposta } from '@/lib/rene'
import { ReneAvvia } from '@/components/ReneAvvia'
import { ComandoRene } from '@/components/ComandoRene'
import { RenePropostaCard } from '@/components/RenePropostaCard'
import { ReneApprovaTutte, ReneConseguenzaSwitch } from '@/components/ReneStrumenti'
import { dataBreve, FUSO } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // il giro di Renè (analisi AI) parte da qui

const ETICHETTE_PERIODO: Record<string, string> = {
  oggi: 'oggi',
  settimana: 'ultimi 7 giorni',
  mese: 'ultimi 30 giorni',
}

function descriviProposta(tipo: string, dati: Record<string, unknown>): { titolo: string; sotto: string } {
  const s = (k: string) => (typeof dati[k] === 'string' ? (dati[k] as string) : '')
  switch (tipo) {
    case 'sezione':
      return { titolo: `Nuova sezione «${s('nome')}»`, sotto: s('descrizione') }
    case 'regola': {
      const cond = [
        s('seMittente') && `mittente: ${s('seMittente')}`,
        s('seOggetto') && `oggetto: ${s('seOggetto')}`,
        s('seContiene') && `testo: ${s('seContiene')}`,
      ]
        .filter(Boolean)
        .join(' · ')
      const dove = s('sezioneNome') ? ` → «${s('sezioneNome')}»` : ''
      const arch = dati.archivia === true ? ' (e archivia)' : ''
      return { titolo: `Nuova regola «${s('nome')}»${dove}${arch}`, sotto: cond }
    }
    case 'smista':
      return { titolo: `Smistare «${s('oggettoMail') || 'una mail'}» in «${s('sezioneNome')}»`, sotto: '' }
    case 'attivita':
      return {
        titolo: `Attività: ${s('titolo')}`,
        sotto: [s('dettaglio'), s('scadenza') && `entro ${s('scadenza')}`, s('priorita')].filter(Boolean).join(' · '),
      }
    case 'evento': {
      const iso = s('inizio')
      const quando = iso
        ? (() => {
            const d = new Date(iso)
            return isNaN(d.getTime())
              ? iso
              : d.toLocaleString('it-IT', {
                  timeZone: FUSO,
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
          })()
        : ''
      return {
        titolo: `Metti in calendario: ${s('titolo')}`,
        sotto: [quando, s('luogo')].filter(Boolean).join(' · '),
      }
    }
    default:
      return { titolo: tipo, sotto: '' }
  }
}

export default async function Rene() {
  const u = await richiediUtente()

  const isAdmin = u.ruolo === 'admin'
  let stile = ''
  let guida = ''
  try {
    const imp = await leggiImpostazioni()
    stile = imp[CHIAVI.stileScrittura] ?? ''
    guida = imp[CHIAVI.guidaGestione] ?? ''
  } catch {
    stile = ''
    guida = ''
  }

  let memoria = ''
  let analisi: { id: string; periodo: string; riassunto: string; urgenti: string; creataIl: Date } | null = null
  let proposte: { id: string; tipo: string; dati: string; stato: string; esitoTesto: string; daConseguenza: boolean }[] = []
  let recenti: typeof proposte = []
  let conseguenze: { id: string; tipo: string; descrizione: string; attiva: boolean }[] = []
  try {
    ;[analisi, conseguenze] = await Promise.all([
      db.reneAnalisi.findFirst({ where: { utenteId: u.id }, orderBy: { creataIl: 'desc' } }),
      db.reneConseguenza.findMany({ where: { utenteId: u.id }, orderBy: { creataIl: 'asc' } }),
    ])
    memoria = (await db.reneMemoria.findUnique({ where: { utenteId: u.id } }))?.testo ?? ''
    // In attesa: TUTTE le proposte aperte (anche di giri precedenti).
    proposte = await db.reneProposta.findMany({
      where: { utenteId: u.id, stato: 'proposta' },
      orderBy: { creataIl: 'asc' },
    })
    // Le proposte di smistamento legate a una mail che NON esiste più (cestino
    // svuotato, doppione ripulito, retention) scadono da sole: mostrarle
    // porterebbe solo a un errore all'approvazione.
    const smiste = proposte.filter((p) => p.tipo === 'smista')
    if (smiste.length > 0) {
      const idsMail = smiste
        .map((p) => {
          try {
            return String((JSON.parse(p.dati) as { messaggioId?: string }).messaggioId ?? '')
          } catch {
            return ''
          }
        })
        .filter(Boolean)
      const vive = new Set(
        (
          await db.messaggio.findMany({
            where: { id: { in: idsMail }, utenteId: u.id },
            select: { id: true },
          })
        ).map((m) => m.id)
      )
      const scadute = smiste.filter((p) => {
        try {
          const id = (JSON.parse(p.dati) as { messaggioId?: string }).messaggioId
          return !id || !vive.has(id)
        } catch {
          return true
        }
      })
      if (scadute.length > 0) {
        await db.reneProposta.updateMany({
          where: { id: { in: scadute.map((s) => s.id) }, utenteId: u.id },
          data: {
            stato: 'scaduta',
            esitoTesto: 'La mail non è più in AI Mail (cancellata o ripulita): niente da smistare.',
          },
        })
        const viaIds = new Set(scadute.map((s) => s.id))
        proposte = proposte.filter((p) => !viaIds.has(p.id))
      }
    }

    recenti = await db.reneProposta.findMany({
      where: { utenteId: u.id, stato: { in: ['applicata', 'errore'] } },
      orderBy: { creataIl: 'desc' },
      take: 10,
    })
  } catch {
    // Tabelle non ancora migrate: la pagina si apre lo stesso.
  }

  // Le sezioni, per limitare i comandi "Chiedi a Renè" a una sola sezione.
  let sezioni: { id: string; nome: string }[] = []
  try {
    sezioni = await db.sezione.findMany({
      where: { utenteId: u.id },
      orderBy: { ordine: 'asc' },
      select: { id: true, nome: true },
    })
  } catch {
    sezioni = []
  }

  let urgenti: UrgenteSenzaRisposta[] = []
  try {
    urgenti = analisi ? (JSON.parse(analisi.urgenti) as UrgenteSenzaRisposta[]) : []
  } catch {
    urgenti = []
  }

  const leggi = (dati: string): Record<string, unknown> => {
    try {
      return JSON.parse(dati)
    } catch {
      return {}
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Renè AI</h1>
          <p className="page-caption">
            L’agente che tiene la casella in ordine: analizza, impara, propone. Tu confermi —
            e quello che approvi «per sempre» poi lo fa da solo.
          </p>
        </div>
      </div>

      <ReneAvvia sezioni={sezioni} />

      <ComandoRene sezioni={sezioni} />

      {analisi && (
        <div className="ai-box">
          <div className="ai-box-title">
            Ultimo giro · {ETICHETTE_PERIODO[analisi.periodo] ?? analisi.periodo} ·{' '}
            {dataBreve(analisi.creataIl)}
          </div>
          <div className="ai-box-text">{analisi.riassunto}</div>
        </div>
      )}

      {urgenti.length > 0 && (
        <>
          <h2 className="section-title">⚠ Urgenti senza risposta</h2>
          <div className="card tight">
            {urgenti.map((m) => (
              <div key={m.messaggioId} className="task-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="task-titolo">
                    <Link href={`/messaggio/${m.messaggioId}`} style={{ textDecoration: 'underline' }}>
                      {m.oggetto || '(senza oggetto)'}
                    </Link>
                  </div>
                  <div className="task-sub">
                    {m.mittente} · {m.motivo}
                  </div>
                </div>
                <div className="task-side">
                  <Link href={`/messaggio/${m.messaggioId}/scrivi?modo=rispondi`} className="btn secondary small">
                    Rispondi
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        Proposte da confermare
        {proposte.length > 0 && analisi && <ReneApprovaTutte analisiId={analisi.id} />}
      </h2>
      {proposte.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Niente in attesa</div>
            <p className="empty-text">Fai un giro di analisi: se c’è qualcosa da sistemare, Renè te lo propone qui.</p>
          </div>
        </div>
      ) : (
        proposte.map((p) => {
          const dati = leggi(p.dati)
          const { titolo, sotto } = descriviProposta(p.tipo, dati)
          const motivo = typeof dati.motivo === 'string' ? dati.motivo : ''
          return (
            <div key={p.id} className="rule-card">
              <div className="rule-head">
                <div style={{ minWidth: 0 }}>
                  <div className="rule-name">{titolo}</div>
                  {sotto && <div className="rule-cond" style={{ marginTop: 4 }}>{sotto}</div>}
                  {motivo && (
                    <div className="rule-cond" style={{ marginTop: 4 }}>
                      <span className="ai-mark" style={{ color: 'var(--gold-strong)', fontWeight: 600 }}>AI</span>{' '}
                      {motivo}
                    </div>
                  )}
                </div>
                <span className="badge neutral">{TIPI_RENE[p.tipo] ?? p.tipo}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <RenePropostaCard id={p.id} tipo={p.tipo} dati={dati} />
              </div>
            </div>
          )
        })
      )}

      {conseguenze.length > 0 && (
        <>
          <h2 className="section-title">Conseguenze (fa da solo)</h2>
          <div className="card tight">
            {conseguenze.map((c) => (
              <div key={c.id} className="task-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="task-titolo">{c.descrizione || TIPI_RENE[c.tipo] || c.tipo}</div>
                  <div className="task-sub">
                    {c.attiva
                      ? 'Attiva: le proposte di questo tipo vengono applicate senza chiedere.'
                      : 'Sospesa: Renè torna a chiedere conferma.'}
                  </div>
                </div>
                <div className="task-side">
                  <span className={`badge ${c.attiva ? 'green' : 'neutral'}`}>
                    <span className="dot" />
                    {c.attiva ? 'attiva' : 'sospesa'}
                  </span>
                  <ReneConseguenzaSwitch id={c.id} attiva={c.attiva} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {recenti.length > 0 && (
        <>
          <h2 className="section-title">Fatte di recente</h2>
          <div className="card tight">
            {recenti.map((p) => {
              const { titolo } = descriviProposta(p.tipo, leggi(p.dati))
              return (
                <div key={p.id} className="task-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="task-titolo">{titolo}</div>
                    <div className="task-sub">{p.esitoTesto}</div>
                  </div>
                  <div className="task-side">
                    {p.daConseguenza && <span className="badge gold">da solo</span>}
                    <span className={`badge ${p.stato === 'applicata' ? 'green' : 'red'}`}>
                      <span className="dot" />
                      {p.stato === 'applicata' ? 'fatta' : 'errore'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h2 className="section-title">Come gestire le richieste</h2>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Di' a Renè come trattare i vari <strong>tipi di richiesta</strong>: la legge quando
          analizza una mail, così le prossime simili le smista e le prioritizza come vuoi tu.
          Una indicazione per riga.
        </p>
        <form action={salvaGuidaGestione}>
          <textarea
            name="guida"
            rows={6}
            disabled={!isAdmin}
            defaultValue={guida}
            maxLength={3000}
            placeholder={'Es.\nOrdini dei siti: priorità P1, sezione «Ordini», crea attività di conferma.\nSolleciti di pagamento: priorità P0.\nRichieste di preventivo: priorità P1, bozza di risposta.'}
            style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6 }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
            {isAdmin
              ? 'Vale per tutta la casella e influenza l’analisi (priorità, sezione, attività/bozza).'
              : 'Solo un amministratore può cambiare la guida condivisa.'}
          </div>
          {isAdmin && (
            <div className="form-footer" style={{ marginTop: 10 }}>
              <button className="btn secondary small" type="submit">
                Salva guida
              </button>
            </div>
          )}
        </form>
      </div>

      <h2 className="section-title">Storico priorità — come sono state gestite</h2>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Le mail a cui hai dato una priorità e come sono finite (risposte, attività, archiviate…).
        </p>
        <StoricoPriorita utenteId={u.id} />
      </div>

      <h2 className="section-title">Come scrivo le mail</h2>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Le regole che Renè segue OGNI volta che scrive o risponde a una mail — anche quando
          esegui un’attività. Valgono per tutta la casella (referente unico). Se lasci vuoto,
          vale lo stile predefinito qui sotto: mail educata e completa, con saluto e chiusura.
        </p>
        <form action={salvaStileRene}>
          <textarea
            name="stile"
            rows={7}
            disabled={!isAdmin}
            defaultValue={stile}
            maxLength={2000}
            placeholder={STILE_DEFAULT}
            style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6 }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
            {isAdmin
              ? 'Es. “Dai del Lei ai clienti nuovi”, “firma sempre a nome del team”, “per i partner tono più informale”.'
              : 'Solo un amministratore può cambiare lo stile condiviso.'}
          </div>
          {isAdmin && (
            <div className="form-footer" style={{ marginTop: 10 }}>
              <button className="btn secondary small" type="submit">
                Salva stile
              </button>
            </div>
          )}
        </form>
      </div>

      <h2 className="section-title">Il taccuino di Renè</h2>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Quello che Renè ha imparato sulla tua casella. Si riscrive compatto a ogni giro (per
          non sprecare token) e lo puoi correggere a mano: alla prossima analisi vale quello
          che c’è scritto qui.
        </p>
        <form action={salvaMemoriaRene}>
          <textarea
            name="testo"
            rows={7}
            defaultValue={memoria}
            maxLength={1500}
            placeholder="(vuoto: Renè non ha ancora fatto un giro)"
            style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6 }}
          />
          <div className="form-footer" style={{ marginTop: 10 }}>
            <button className="btn secondary small" type="submit">
              Salva taccuino
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
