'use client'

import { useMemo, useState } from 'react'
import type { SitoWidget } from '@/lib/widget-siti'

// L'aspetto e i testi del widget, UN SITO PER VOLTA.
//
// Prima questa pagina configurava «il widget»: un tema, un colore, e il titolo e
// il saluto letti dalle Impostazioni generali. Ma i tre siti non si somigliano —
// deluxy.it è nero e oro e dà del Lei, l'atelier dei fiori parla per sottrazione,
// cakedesign.me usa le emoji — e un widget solo li faceva sembrare la stessa
// azienda: l'opposto di quello che vendono.
//
// Ora si sceglie il sito e la pagina PROPONE già la sua versione: tema, colore,
// scritta del bottone, titolo e saluto nella voce di quel brand. La proposta però
// non si salva da sola: finché nessuno conferma, quel sito resta «proposto». Fra
// «così l'abbiamo deciso» e «così te lo suggeriamo» c'è la differenza fra una
// configurazione e un'ipotesi, e in una pagina di impostazioni si deve vedere.
//
// L'anteprima è il widget VERO dentro un iframe (`/widget?anteprima=1`), non un
// disegno che gli somiglia: un finto anteprima è la cosa che invecchia peggio —
// si cambia il CSS del widget e l'anteprima continua a mostrare com'era prima.

const TEMI = [
  { id: 'chiaro', nome: 'Chiaro', quando: 'Il difetto. Sta bene sui siti a fondo bianco o grigio.' },
  { id: 'scuro', nome: 'Scuro', quando: 'Per i siti a fondo nero, dove il chiaro sembra una toppa.' },
  { id: 'deluxy', nome: 'Deluxy', quando: 'Nero e oro: i nostri siti.' },
  { id: 'caldo', nome: 'Caldo', quando: 'Avorio e terracotta: fiori e pasticceria, dove il grigio stona con le foto.' },
  { id: 'minimale', nome: 'Minimale', quando: 'Nessun colore, spigoli morbidi. Nel dubbio, questo.' },
  { id: 'automatico', nome: 'Automatico', quando: 'Chiaro o scuro come lo ha impostato chi guarda.' },
]

export function AspettoWidget({
  origine,
  siti,
  slugIniziale = '',
  salva,
}: {
  origine: string
  siti: SitoWidget[]
  /**
   * Il sito da mostrare all'apertura, dall'URL (`?sito=cake`).
   *
   * ⚠️ Non è un vezzo: dopo il salvataggio la pagina si ricarica e questo
   * componente riparte da zero. Senza il sito nell'URL ripartiva dal PRIMO
   * dell'elenco, e chi aveva appena tolto il bottone tondo a Cakedesign si
   * ritrovava davanti Deluxy con la spunta accesa — sembrava che
   * l'impostazione si riattivasse da sola.
   */
  slugIniziale?: string
  /** Server action che salva la configurazione del sito scelto. */
  salva: (dati: FormData) => void
}) {
  const primo = siti.find((s) => s.slug === slugIniziale)?.slug ?? siti[0]?.slug ?? ''
  const [slug, setSlug] = useState(primo)
  const sito = siti.find((s) => s.slug === slug) ?? siti[0]

  const [tema, setTema] = useState(sito?.tema ?? 'chiaro')
  const [accento, setAccento] = useState(sito?.accento ?? '')
  const [posizione, setPosizione] = useState(sito?.posizione ?? 'destra')
  const [etichetta, setEtichetta] = useState(sito?.etichetta ?? '')
  const [titolo, setTitolo] = useState(sito?.titolo ?? '')
  const [saluto, setSaluto] = useState(sito?.saluto ?? '')
  const [selettoreApri, setSelettoreApri] = useState(sito?.selettoreApri ?? '')
  const [mostraBottone, setMostraBottone] = useState(sito?.mostraBottone ?? true)
  // ⚠️ Di partenza SPENTO anche per un sito nuovo: acceso manda il cliente su un
  // dominio dove il widget potrebbe non esserci, e nessuno se ne accorgerebbe.
  const [apreSulSito, setApreSulSito] = useState(sito?.apreSulSito ?? false)
  const [linkRapidi, setLinkRapidi] = useState<{ testo: string; url: string }[]>(
    sito?.linkRapidi ?? []
  )
  const [copiato, setCopiato] = useState(false)
  const [linkCopiato, setLinkCopiato] = useState(false)

  // Cambiando sito i campi si ricaricano da quel sito: senza, si finiva a
  // modificare il tema di Flowers con i testi di Cake sotto gli occhi.
  function scegliSito(nuovo: string) {
    const s = siti.find((x) => x.slug === nuovo)
    if (!s) return
    setSlug(nuovo)
    setTema(s.tema)
    setAccento(s.accento)
    setPosizione(s.posizione)
    setEtichetta(s.etichetta)
    setTitolo(s.titolo)
    setSaluto(s.saluto)
    setSelettoreApri(s.selettoreApri)
    setMostraBottone(s.mostraBottone)
    setApreSulSito(s.apreSulSito)
    setLinkRapidi(s.linkRapidi)
    // L'URL segue la scelta senza ricaricare la pagina: se si ricarica — o se il
    // salvataggio la rimonta — si riparte da questo sito e non dal primo.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('sito', nuovo)
      url.searchParams.delete('salvato')
      window.history.replaceState(null, '', url.toString())
    }
  }

  const accentoValido = /^#[0-9a-f]{6}$/i.test(accento)

  const codice = useMemo(() => {
    const righe = [`<script src="${origine}/widget.js" defer`]
    const attributi: string[] = []
    // `data-sito` viene per primo: è quello che porta i testi giusti e, in
    // Inbox, mette la chat nella colonna del marchio.
    if (slug) attributi.push(`data-sito="${slug}"`)
    if (tema !== 'chiaro') attributi.push(`data-tema="${tema}"`)
    if (accentoValido) attributi.push(`data-accento="${accento.toLowerCase()}"`)
    if (posizione !== 'destra') attributi.push(`data-posizione="${posizione}"`)
    if (etichetta.trim()) attributi.push(`data-etichetta="${etichetta.trim().replace(/"/g, '')}"`)
    // Il punto d'ingresso che c'è già sul sito, e il bottone flottante che si
    // può togliere quando quel punto basta.
    if (selettoreApri.trim())
      attributi.push(`data-apri-da="${selettoreApri.trim().replace(/"/g, '')}"`)
    if (!mostraBottone) attributi.push('data-bottone="no"')
    if (attributi.length) righe.push('        ' + attributi.join(' '))
    return righe.join('\n') + '></script>'
  }, [
    origine,
    slug,
    tema,
    accento,
    accentoValido,
    posizione,
    etichetta,
    selettoreApri,
    mostraBottone,
  ])

  const titoloAnteprima = titolo || sito?.nome || 'Deluxy'
  const urlAnteprima = useMemo(() => {
    const p = new URLSearchParams({ anteprima: '1', tema, titolo: titoloAnteprima })
    if (accentoValido) p.set('accento', accento.toLowerCase())
    return `/widget?${p.toString()}`
  }, [tema, accento, accentoValido, titoloAnteprima])

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Per quale sito</h2>
        <div className="siti-widget">
          {siti.map((s) => (
            <button
              key={s.slug}
              type="button"
              className={`sito-scelta${s.slug === slug ? ' scelto' : ''}`}
              onClick={() => scegliSito(s.slug)}
            >
              <span className="nome">{s.nome}</span>
              <span className="dominio">{s.dominio || s.slug}</span>
              <span className="stato">
                {s.proposto ? (
                  <span className="badge">proposto</span>
                ) : (
                  <span className="badge verde">salvato</span>
                )}
                {s.brand ? <span className="badge">{s.brand}</span> : null}
              </span>
            </button>
          ))}
        </div>
        {sito?.proposto ? (
          <p className="cella-sub" style={{ marginBottom: 0 }}>
            Questa è la nostra <strong>proposta</strong> per {sito.nome}, non una configurazione
            salvata: tema, colore e testi sono già nella voce di quel brand. Cambia quello che vuoi
            e premi <strong>Salva</strong>. Anche senza salvare il widget di quel sito usa già
            questa proposta — i testi generali valgono solo per i siti che non sono fra i nostri.
          </p>
        ) : null}
      </div>

      <form action={salva}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="nome" value={sito?.nome ?? ''} />
        <input type="hidden" name="dominio" value={sito?.dominio ?? ''} />
        <input type="hidden" name="negozioId" value={sito?.negozioId ?? ''} />
        <input type="hidden" name="tema" value={tema} />
        <input type="hidden" name="accento" value={accento} />
        <input type="hidden" name="posizione" value={posizione} />
        <input type="hidden" name="etichetta" value={etichetta} />
        <input type="hidden" name="mostraBottone" value={mostraBottone ? '1' : '0'} />
        <input type="hidden" name="apreSulSito" value={apreSulSito ? '1' : '0'} />
        <input type="hidden" name="linkRapidi" value={JSON.stringify(linkRapidi)} />

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Tema</h2>
          <div className="temi-griglia">
            {TEMI.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tema-scelta${tema === t.id ? ' scelto' : ''}`}
                onClick={() => setTema(t.id)}
              >
                <iframe
                  className="tema-mini"
                  src={`/widget?anteprima=1&tema=${t.id}&titolo=${encodeURIComponent(titoloAnteprima)}`}
                  title={`Anteprima tema ${t.nome}`}
                  tabIndex={-1}
                />
                <div className="tema-nome">{t.nome}</div>
                <div className="cella-sub">{t.quando}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Testi di questo sito</h2>
          <p className="descrizione">
            Il titolo in cima alla chat e la prima frase che legge il visitatore, <strong>per
            questo sito</strong>: chi scrive ai fiori non deve leggere il saluto della pasticceria.
            Vuoti = valgono quelli generali delle Impostazioni.
          </p>
          <label className="campo">
            <span>Titolo della chat</span>
            <input
              name="titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder={sito?.nome ?? 'Deluxy'}
              maxLength={60}
            />
          </label>
          <label className="campo">
            <span>Primo messaggio (il saluto)</span>
            <textarea
              name="saluto"
              value={saluto}
              onChange={(e) => setSaluto(e.target.value)}
              rows={3}
              maxLength={400}
            />
          </label>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Ritocchi</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Colore del sito (facoltativo)</span>
              <input
                value={accento}
                onChange={(e) => setAccento(e.target.value)}
                placeholder="#9c5b3f"
                spellCheck={false}
              />
            </label>
            <label className="campo">
              <span>Posizione</span>
              <select value={posizione} onChange={(e) => setPosizione(e.target.value)}>
                <option value="destra">In basso a destra</option>
                <option value="sinistra">In basso a sinistra</option>
              </select>
            </label>
            <label className="campo" style={{ gridColumn: '1 / -1' }}>
              <span>Scritta accanto al bottone (facoltativa)</span>
              <input
                value={etichetta}
                onChange={(e) => setEtichetta(e.target.value)}
                placeholder="Scrivici"
                maxLength={24}
              />
            </label>
          </div>
          <p className="cella-sub" style={{ marginBottom: 0 }}>
            Il colore va scritto come <code>#rrggbb</code>; se è sbagliato viene ignorato e resta
            quello del tema — meglio un widget col tema giusto che uno senza colori.
            {accento && !accentoValido ? (
              <strong> Adesso non è valido: serve un # e sei cifre.</strong>
            ) : null}
          </p>
        </div>

        {/* I LINK RAPIDI: la risposta alla domanda del saluto. Chi apre la chat
            vuole spesso una cosa che il sito ha già, e mandarcelo subito vale
            più di una risposta scritta bene dieci minuti dopo. */}
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Link rapidi sotto il saluto</h2>
          <p className="descrizione">
            Le opzioni che il visitatore vede subito sotto il messaggio di benvenuto: cliccandone
            una va dritto a quella pagina del sito. Se il saluto chiede «Come ti aiutiamo?», questi
            sono le risposte — «Regali per oggi», «Torte nuziali». Massimo sei.
          </p>
          {linkRapidi.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <label className="campo" style={{ flex: 1 }}>
                <span>Cosa c&apos;è scritto</span>
                <input
                  value={l.testo}
                  maxLength={40}
                  placeholder="Regali per oggi"
                  onChange={(e) =>
                    setLinkRapidi(
                      linkRapidi.map((x, j) => (i === j ? { ...x, testo: e.target.value } : x))
                    )
                  }
                />
              </label>
              <label className="campo" style={{ flex: 1.4 }}>
                <span>Dove porta</span>
                <input
                  value={l.url}
                  maxLength={300}
                  spellCheck={false}
                  placeholder="/collections/oggi"
                  onChange={(e) =>
                    setLinkRapidi(
                      linkRapidi.map((x, j) => (i === j ? { ...x, url: e.target.value } : x))
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="bottone secondario mini"
                style={{ marginBottom: 14, color: 'var(--red)' }}
                onClick={() => setLinkRapidi(linkRapidi.filter((_, j) => j !== i))}
              >
                Togli
              </button>
            </div>
          ))}
          {linkRapidi.length < 6 ? (
            <button
              type="button"
              className="bottone secondario"
              onClick={() => setLinkRapidi([...linkRapidi, { testo: '', url: '' }])}
            >
              Aggiungi un link
            </button>
          ) : null}
          <p className="cella-sub" style={{ marginTop: 8, marginBottom: 0 }}>
            L&apos;indirizzo può essere relativo (<code>/collections/oggi</code>) o completo. ⚠️ Un
            link <strong>di questo sito</strong> apre la pagina lì dov&apos;è; un link di un altro
            sito si apre in una scheda nuova, per non portare via il visitatore. I bottoni spariscono
            appena la conversazione comincia.
          </p>
        </div>

        {/* ⚠️ Aprire la chat da un elemento CHE C'È GIÀ. Nei siti la voce «Live
            Chat» del menu contatti spesso esiste e punta a un servizio esterno
            (`<a class="dialogify" href="https://chatting.page/…">`): con il suo
            selettore diventa il punto d'ingresso della nostra chat, senza mettere
            le mani nel tema. */}
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Aprire la chat da un link del sito</h2>
          <p className="descrizione">
            Se sul sito c&apos;è già una voce «Live Chat» — o un bottone in una landing — puoi farla
            aprire questa chat: scrivi qui il suo <strong>selettore CSS</strong>. Il link non porterà
            più fuori dal sito. Esempio, per la voce che punta a chatting.page:{' '}
            <code>a.dialogify</code>. Più selettori si separano con la virgola.
          </p>
          <label className="campo">
            <span>Selettore dell&apos;elemento che apre la chat (facoltativo)</span>
            <input
              name="selettoreApri"
              value={selettoreApri}
              onChange={(e) => setSelettoreApri(e.target.value)}
              placeholder="a.dialogify, .apri-chat"
              spellCheck={false}
              maxLength={120}
            />
          </label>
          <label
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 4 }}
          >
            <input
              type="checkbox"
              checked={mostraBottone}
              onChange={(e) => setMostraBottone(e.target.checked)}
            />
            Mostra anche il bottone tondo in basso
          </label>
          <p className="cella-sub" style={{ marginBottom: 0, marginTop: 6 }}>
            Se la chat si apre dal menu, il bottone tondo si può togliere: in basso a destra c&apos;è
            spesso già il carrello o il banner dei cookie. Da codice la chat si apre anche con{' '}
            <code>window.DeluxyChat.apri()</code>.
          </p>
          <label
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 12 }}
          >
            <input
              type="checkbox"
              checked={apreSulSito}
              onChange={(e) => setApreSulSito(e.target.checked)}
            />
            Il link della chat porta sul sito, con la chat già aperta
          </label>
          <p className="cella-sub" style={{ marginBottom: 0, marginTop: 6 }}>
            Chi apre il link <code>/chat/…</code> (bio di Instagram, QR, firma delle mail) atterra
            sul sito con la chat aperta, e la <strong>×</strong> la <strong>nasconde</strong>{' '}
            lasciando il bottone per riaprirla — invece di portarlo via da una pagina vuota.{' '}
            <strong>
              Accendila solo se su {sito?.dominio || 'questo dominio'} il widget è davvero
              installato
            </strong>
            : se non c&apos;è, il cliente arriva sul sito senza nessuna chat e il link non serve più
            a niente.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Come viene</h2>
          <p className="descrizione">
            È il widget vero, con messaggi finti: nessuna conversazione finisce in Inbox.
          </p>
          <div className="anteprima-cornice">
            <iframe className="anteprima-widget" src={urlAnteprima} title="Anteprima del widget" />
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="bottone">Salva per {sito?.nome ?? 'questo sito'}</button>
          </div>
        </div>
      </form>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          Codice da incollare su {sito?.dominio || 'il sito'}
        </h2>
        <p className="descrizione">
          Va prima di <code>&lt;/body&gt;</code>. Su Shopify: Negozio online → Temi → Modifica
          codice → <code>theme.liquid</code>. Ogni sito ha il <strong>suo</strong> codice: quello
          che cambia è <code>data-sito</code>, ed è quello che porta i testi giusti e, in Inbox, il
          marchio della conversazione.
        </p>
        <pre className="codice-incolla">{codice}</pre>
        <button
          type="button"
          className="bottone"
          onClick={() => {
            navigator.clipboard.writeText(codice).then(
              () => {
                setCopiato(true)
                setTimeout(() => setCopiato(false), 2000)
              },
              () => setCopiato(false)
            )
          }}
        >
          {copiato ? 'Copiato' : 'Copia il codice'}
        </button>
      </div>

      {/* IL LINK PUBBLICO: la stessa chat, ma senza un sito attorno.
          Serve dove un widget non può stare — la bio di Instagram, la firma
          delle mail, un QR sul biglietto che va col mazzo — e le conversazioni
          arrivano in Inbox nella colonna di questo marchio, esattamente come
          quelle del widget. */}
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Link della chat (senza sito)</h2>
        {sito?.codice ? (
          <>
            <p className="descrizione">
              Da mandare così com&apos;è: nella bio di Instagram, in firma alle mail, dietro un QR
              sul biglietto. Chi lo apre scrive a <strong>{sito.nome}</strong> e la conversazione
              arriva in <a href="/inbox">Inbox</a> come quelle del widget.
            </p>
            <pre className="codice-incolla">{`${origine}/chat/${sito.codice}`}</pre>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="bottone"
                onClick={() => {
                  navigator.clipboard.writeText(`${origine}/chat/${sito.codice}`).then(
                    () => {
                      setLinkCopiato(true)
                      setTimeout(() => setLinkCopiato(false), 2000)
                    },
                    () => setLinkCopiato(false)
                  )
                }}
              >
                {linkCopiato ? 'Copiato' : 'Copia il link'}
              </button>
              <a
                className="bottone secondario"
                href={`${origine}/chat/${sito.codice}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Aprilo
              </a>
            </div>
            <p className="descrizione" style={{ marginTop: 10, marginBottom: 0 }}>
              ⚠️ Il pezzo finale è un codice casuale, non il nome del sito: con{' '}
              <code>/chat/{sito.slug}</code> chiunque potrebbe indovinare gli altri e aprire
              conversazioni a nome di un marchio che non è il suo. Per lo stesso motivo il codice
              non cambia mai: cambiarlo romperebbe i QR già stampati.
            </p>
          </>
        ) : (
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Il link nasce quando salvi la configurazione di questo sito: finché è solo una
            proposta non c&apos;è niente a cui mandare i clienti. Premi{' '}
            <strong>Salva per {sito?.nome ?? 'questo sito'}</strong> qui sopra.
          </p>
        )}
      </div>
    </>
  )
}
