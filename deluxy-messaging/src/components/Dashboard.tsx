'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { AttesaDto, AttivitaDto, DatiDashboard, OrdineUrgenteDto } from '@/lib/dashboard'
// I reclami arrivano dentro `dati`: il tipo sta in lib/dashboard.ts con gli altri.

// La schermata iniziale: cosa c'è da fare, adesso, in un colpo d'occhio.
//
// L'ordine delle cose non è estetico. In cima chi aspetta una risposta — è il
// debito più caro che abbiamo, e su WhatsApp ha un orologio vero addosso (24 ore
// e Meta chiude il testo libero). Poi gli ordini da lavorare di tutti i marchi,
// nell'ordine di urgenza della bacheca. Poi le code che nessuno guarda se non
// gliele si mette davanti: reclami aperti, rimborsi da decidere, pagamenti da
// inviare. In fondo i promemoria, perché sono l'unica cosa che riguarda solo chi
// sta guardando.

const NOMI_CANALE: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  widget: 'Sito',
  email: 'Email',
}

const NOMI_GRAVITA: Record<number, string> = { 1: 'lieve', 2: 'media', 3: 'grave' }

const NOMI_FASCIA: Record<string, string> = {
  oggi: 'Oggi',
  prossime: 'Prossimi giorni',
  'scadute-recenti': 'Scaduto da poco',
  'senza-data': 'Senza data',
  'scadute-vecchie': 'Scaduto da tempo',
}

/** «22 h», «3 h», «45 min»: l'attesa si legge, non si calcola. */
function attesa(minuti: number): string {
  if (minuti < 60) return `${minuti} min`
  const ore = Math.round(minuti / 60)
  if (ore < 48) return `${ore} h`
  return `${Math.round(ore / 24)} g`
}

function dataBreve(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export function Dashboard({ dati }: { dati: DatiDashboard }) {
  const [attivita, setAttivita] = useState<AttivitaDto[]>(dati.attivita)
  const [nuova, setNuova] = useState('')
  const [scadenza, setScadenza] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function crea() {
    const testo = nuova.trim()
    if (!testo || salvando) return
    setSalvando(true)
    try {
      const res = await fetch('/api/attivita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testo, scadenza }),
      })
      const d = (await res.json().catch(() => ({}))) as { attivita?: AttivitaDto }
      if (res.ok && d.attivita) {
        setAttivita((prec) => [
          {
            id: d.attivita!.id,
            testo,
            scadenza: scadenza ? new Date(scadenza).toISOString() : null,
            riferimento: '',
            utenteNome: d.attivita!.utenteNome ?? '',
            fatta: false,
          },
          ...prec,
        ])
        setNuova('')
        setScadenza('')
      }
    } finally {
      setSalvando(false)
    }
  }

  async function spunta(id: string) {
    // Spariscono subito dall'elenco: è l'unico modo per cui spuntare dieci cose
    // di fila non sia dieci attese di rete.
    setAttivita((prec) => prec.filter((a) => a.id !== id))
    await fetch(`/api/attivita/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fatta: true }),
    }).catch(() => {})
  }

  const n = dati.numeri

  return (
    <div className="dashboard">
      {/* I numeri sono link: un conteggio che non porta dove si lavora fa
          alzare le spalle. */}
      <div className="numeri">
        {/* Le CHAT sono il numero grande: lì c'è una persona che aspetta. Le
            mail non lette stanno nella nota, perché sono quasi tutte newsletter
            e messe insieme farebbero suonare l'allarme sempre. */}
        <Numero
          href="/inbox"
          valore={n.daRispondereChat}
          etichetta="chat da rispondere"
          nota={`${n.daRispondereEmail} mail non lette · ${n.conversazioniAperte} conversazioni`}
          allerta={n.daRispondereChat > 0}
        />
        <Numero href="/ordini" valore={n.consegneOggi} etichetta="consegne di oggi" />
        <Numero
          href="/ordini"
          valore={n.ordiniDaGestire}
          etichetta="ordini da gestire"
          nota={n.ordiniInRitardo ? `${n.ordiniInRitardo} in ritardo` : 'nessuno in ritardo'}
          allerta={n.ordiniInRitardo > 0}
        />
        <Numero href="/reclami" valore={n.reclamiAperti} etichetta="reclami aperti" />
        <Numero href="/rimborsi" valore={n.rimborsiDaDecidere} etichetta="rimborsi da decidere" />
        <Numero
          href="/pagamenti"
          valore={n.pagamentiDaInviare}
          etichetta="pagamenti da inviare"
        />
      </div>

      <div className="griglia-dashboard">
        <section className="card riquadro">
          <div className="testa-riquadro">
            <h2>Chi aspetta una risposta</h2>
            <Link href="/inbox" className="bottone secondario mini">
              Inbox
            </Link>
          </div>
          {dati.attese.length === 0 ? (
            <p className="colonna-vuota">Nessuno in attesa: tutto risposto.</p>
          ) : (
            <ul className="elenco-attese">
              {dati.attese.map((a) => (
                <RigaAttesa key={a.id} a={a} />
              ))}
            </ul>
          )}
        </section>

        <section className="card riquadro">
          <div className="testa-riquadro">
            <h2>Ordini da lavorare</h2>
            <Link href="/ordini" className="bottone secondario mini">
              Tutti gli ordini
            </Link>
          </div>
          {dati.ordini.length === 0 ? (
            <p className="colonna-vuota">Nessun ordine da gestire.</p>
          ) : (
            <ul className="elenco-ordini-urgenti">
              {dati.ordini.map((o) => (
                <RigaOrdine key={o.id} o={o} />
              ))}
            </ul>
          )}
        </section>

        <section className="card riquadro">
          <div className="testa-riquadro">
            <h2>Reclami aperti</h2>
            <Link href="/reclami" className="bottone secondario mini">
              Tutti i reclami
            </Link>
          </div>
          {dati.reclami.length === 0 ? (
            <p className="colonna-vuota">Nessun reclamo aperto.</p>
          ) : (
            <ul className="elenco-reclami">
              {dati.reclami.map((r) => (
                <li key={r.id}>
                  {/* Porta a QUEL reclamo, e tutta la riga è il bersaglio:
                      `/reclami` legge `?apri=` ed evidenzia la riga. Se nel
                      frattempo è stato chiuso, la pagina allarga il filtro
                      invece di mostrare un elenco in cui la cosa promessa non
                      c'è. */}
                  <Link href={`/reclami?apri=${r.id}`} className="riga-collegamento">
                    <span className={`gravita g${r.gravita}`} title={NOMI_GRAVITA[r.gravita]}>
                      {NOMI_GRAVITA[r.gravita] ?? '—'}
                    </span>
                    <span className="ordine">{r.ordineNumero || '—'}</span>
                    {r.brand ? <span className="badge">{r.brand}</span> : null}
                    <span className="di-cosa">
                      {r.casistica || 'senza casistica'}
                      {r.azioni ? <span className="azione"> · {r.azioni}</span> : null}
                    </span>
                    {r.colpa ? <span className="colpa">{r.colpa}</span> : null}
                  {/* Da quanti giorni è aperto: un reclamo che invecchia è il
                      modo in cui un problema piccolo diventa una recensione. */}
                    <span className={`eta${r.giorniAperto >= 3 ? ' vecchio' : ''}`}>
                      {r.giorniAperto === 0 ? 'oggi' : `${r.giorniAperto} g`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card riquadro">
          <div className="testa-riquadro">
            <h2>Da fare</h2>
            <span className="cella-sub">{attivita.length} aperti</span>
          </div>
          <div className="nuova-attivita">
            <input
              placeholder="Richiamare il cliente dell'ordine 2529…"
              value={nuova}
              onChange={(e) => setNuova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  crea()
                }
              }}
            />
            <input
              type="date"
              value={scadenza}
              onChange={(e) => setScadenza(e.target.value)}
              title="Entro quando (facoltativo)"
            />
            <button className="bottone" onClick={crea} disabled={salvando || !nuova.trim()}>
              Aggiungi
            </button>
          </div>
          {attivita.length === 0 ? (
            <p className="colonna-vuota">Niente in sospeso.</p>
          ) : (
            <ul className="elenco-attivita">
              {attivita.map((a) => {
                const scaduta = a.scadenza ? new Date(a.scadenza) < new Date() : false
                return (
                  <li key={a.id}>
                    <input
                      type="checkbox"
                      onChange={() => spunta(a.id)}
                      aria-label={`Fatto: ${a.testo}`}
                    />
                    <span className="testo-attivita">
                      {a.testo}
                      {a.riferimento ? <span className="rif"> · {a.riferimento}</span> : null}
                    </span>
                    {a.scadenza ? (
                      <span className={`quando${scaduta ? ' scaduta' : ''}`}>
                        {dataBreve(a.scadenza)}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card riquadro">
          <div className="testa-riquadro">
            <h2>Strumenti</h2>
          </div>
          {/* Le cose che un operatore apre dieci volte al giorno, tutte a un
              clic: senza questo si passa il turno nel menu laterale. */}
          <div className="strumenti">
            <Link href="/inbox" className="strumento">
              <span className="nome">Inbox</span>
              <span className="che-cosa">Rispondi su WhatsApp, mail, Instagram</span>
            </Link>
            <Link href="/ordini" className="strumento">
              <span className="nome">Ordini aperti</span>
              <span className="che-cosa">Bacheca per marchio, con le priorità</span>
            </Link>
            <Link href="/calendario" className="strumento">
              <span className="nome">Calendario</span>
              <span className="che-cosa">Le consegne da oggi in avanti</span>
            </Link>
            <Link href="/clienti" className="strumento">
              <span className="nome">Clienti</span>
              <span className="che-cosa">Chi è, cosa ha ordinato, come contattarlo</span>
            </Link>
            <Link href="/reclami" className="strumento">
              <span className="nome">Reclami</span>
              <span className="che-cosa">Apri un reclamo e le azioni da fare</span>
            </Link>
            <Link href="/rimborsi" className="strumento">
              <span className="nome">Rimborsi</span>
              <span className="che-cosa">Chiedi e segui un rimborso</span>
            </Link>
            <Link href="/pagamenti" className="strumento">
              <span className="nome">Pagamenti</span>
              <span className="che-cosa">Richieste di pagamento ai fornitori</span>
            </Link>
            <Link href="/script" className="strumento">
              <span className="nome">Risposte pronte</span>
              <span className="che-cosa">I testi per tipologia, da usare in chat</span>
            </Link>
            <a
              className="strumento"
              href="https://deluxy-mail.vercel.app/scrivi?app=Deluxy%20Customer%20Service"
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="nome">Scrivi una mail</span>
              <span className="che-cosa">Apre AI Mail, fuori da questa app</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}

function Numero({
  href,
  valore,
  etichetta,
  nota,
  allerta,
}: {
  href: string
  valore: number
  etichetta: string
  nota?: string
  allerta?: boolean
}) {
  return (
    <Link href={href} className={`numero${allerta && valore > 0 ? ' allerta' : ''}`}>
      <span className="valore">{valore.toLocaleString('it-IT')}</span>
      <span className="etichetta">{etichetta}</span>
      {nota ? <span className="nota">{nota}</span> : null}
    </Link>
  )
}

function RigaAttesa({ a }: { a: AttesaDto }) {
  return (
    <li className={a.finestraCritica ? 'critica' : undefined}>
      {/* ⚠️ IL COLLEGAMENTO PRENDE TUTTA LA RIGA, non il solo nome. Su una riga
          che si legge per intero — nome, canale, testo, da quanto aspetta — il
          bersaglio cliccabile erano poche decine di pixel sul nome: si mirava
          al testo del messaggio, non succedeva niente, e sembrava rotta. Da
          telefono era peggio. Dentro non ci sono altri comandi, quindi un
          collegamento che avvolge tutto non annida nulla di interattivo. */}
      <Link href={`/inbox?c=${a.id}`} className="riga-collegamento">
        {/* Porta sulla conversazione precisa, non «in inbox»: chi ha appena
            letto questa riga non deve ritrovarla in un elenco di 113. */}
        <span className="chi">{a.chi}</span>
        <span className="badge">{NOMI_CANALE[a.canale] ?? a.canale}</span>
        {a.brand ? <span className="badge">{a.brand}</span> : null}
        <span className="testo">{a.ultimoTesto}</span>
        <span className="attesa" title={`Aspetta da ${attesa(a.attesaMinuti)}`}>
          {attesa(a.attesaMinuti)}
        </span>
      {/* ⚠️ La finestra di WhatsApp: passate 24 ore dal messaggio del cliente,
          Meta non lascia più rispondere in testo libero — serve un modello
          approvato. Saperlo DOPO vuol dire non poter più rispondere. */}
        {a.oreFinestra !== null ? (
          <span
            className={`finestra${a.finestraCritica ? ' critica' : ''}`}
            title="Ore che restano per rispondere in testo libero su WhatsApp"
          >
            {a.oreFinestra <= 0 ? 'finestra chiusa' : `${a.oreFinestra} h`}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

function RigaOrdine({ o }: { o: OrdineUrgenteDto }) {
  return (
    <li>
      {/* Tutta la riga porta all'ordine, col suo pannello già aperto. */}
      <Link href={`/ordini?apri=${o.id}`} className="riga-collegamento">
        <span className="numero-ordine">{o.numero || '—'}</span>
        <span className="badge">{o.brand}</span>
        <span className={`fascia f-${o.fascia}`}>{NOMI_FASCIA[o.fascia] ?? o.fascia}</span>
        <span className="cliente">
          {o.cliente || 'senza nome'}
          {o.citta ? ` · ${o.citta}` : ''}
        </span>
        <span className="quando">
          {dataBreve(o.dataConsegna)}
          {o.fasciaOraria ? ` · ${o.fasciaOraria}` : ''}
        </span>
      </Link>
    </li>
  )
}
