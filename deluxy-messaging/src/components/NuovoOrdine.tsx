'use client'

import { useCallback, useEffect, useState } from 'react'

// Fare un ordine per un cliente al telefono, senza uscire dall'app.
//
// ⚠️ L'ordine nasce in Shopify (bozza d'ordine) e torna indietro dal registro
// come tutti gli altri: qui non si scrive nessun ordine «nostro», che sarebbe
// invisibile a logistica e contabilità.

type Negozio = { id: string; nome: string }
type Prodotto = {
  variantId: string
  titolo: string
  variante: string
  prezzo: number
  immagine: string
  disponibile: boolean
}
type Riga = {
  variantId?: string
  titolo: string
  variante?: string
  prezzo: number
  quantita: number
  immagine?: string
}

function soldi(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function NuovoOrdine({
  prefill,
}: {
  /** Chi è il cliente, quando si arriva da una conversazione. */
  prefill?: { nome?: string; email?: string; telefono?: string }
}) {
  const [negozi, setNegozi] = useState<Negozio[]>([])
  const [negozioId, setNegozioId] = useState('')

  const [nome, setNome] = useState(prefill?.nome ?? '')
  const [cognome, setCognome] = useState('')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [telefono, setTelefono] = useState(prefill?.telefono ?? '')

  const [data, setData] = useState('')
  const [fascia, setFascia] = useState('')
  const [indirizzo, setIndirizzo] = useState('')
  const [note, setNote] = useState('')
  const [cap, setCap] = useState('')
  const [citta, setCitta] = useState('')
  const [provincia, setProvincia] = useState('')
  const [paese, setPaese] = useState('IT')

  const [q, setQ] = useState('')
  const [prodotti, setProdotti] = useState<Prodotto[]>([])
  const [catalogoChiuso, setCatalogoChiuso] = useState(false)
  const [cercando, setCercando] = useState(false)
  const [righe, setRighe] = useState<Riga[]>([])

  const [rigaTitolo, setRigaTitolo] = useState('')
  const [rigaPrezzo, setRigaPrezzo] = useState('')

  const [spedizioneTitolo, setSpedizioneTitolo] = useState('Consegna Deluxy')
  const [spedizionePrezzo, setSpedizionePrezzo] = useState('0')
  const [biglietto, setBiglietto] = useState('')

  const [pagamento, setPagamento] = useState<'link' | 'pagato'>('link')
  const [mezzo, setMezzo] = useState('bonifico')

  const [creando, setCreando] = useState(false)
  const [errore, setErrore] = useState('')
  const [esito, setEsito] = useState<{
    linkPagamento: string
    ordineNumero: string
    inviato: boolean
  } | null>(null)

  useEffect(() => {
    fetch('/api/ordini?gestione=gestito')
      .then((r) => (r.ok ? r.json() : { negozi: [] }))
      .then((d: { negozi?: Negozio[] }) => {
        setNegozi(d.negozi ?? [])
        if (d.negozi?.length === 1) setNegozioId(d.negozi[0].id)
      })
      .catch(() => setNegozi([]))
  }, [])

  const cerca = useCallback(async () => {
    if (!negozioId) {
      setErrore('Scegli prima il negozio.')
      return
    }
    setCercando(true)
    setErrore('')
    try {
      const p = new URLSearchParams({ negozio: negozioId, q })
      const res = await fetch('/api/nuovo-ordine/prodotti?' + p.toString())
      const d = (await res.json().catch(() => ({}))) as {
        prodotti?: Prodotto[]
        senzaPermesso?: boolean
        nota?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Ricerca non riuscita.')
        return
      }
      setCatalogoChiuso(Boolean(d.senzaPermesso))
      setProdotti(d.prodotti ?? [])
    } finally {
      setCercando(false)
    }
  }, [negozioId, q])

  const totale =
    righe.reduce((s, r) => s + r.prezzo * r.quantita, 0) + (Number(spedizionePrezzo) || 0)

  async function crea() {
    if (creando) return
    if (!righe.length) {
      setErrore('Aggiungi almeno un prodotto.')
      return
    }
    if (pagamento === 'link' && !email.trim()) {
      setErrore('Per mandare il link di pagamento serve l’email del cliente.')
      return
    }
    // ⚠️ «Già pagato» crea un ordine PAGATO su Shopify: se i soldi non sono
    // arrivati davvero, la contabilità legge un incasso che non esiste.
    if (pagamento === 'pagato') {
      const ok = window.confirm(
        `L'ordine nascerà già PAGATO (${mezzo}) per ${soldi(totale)}.\n\n` +
          'Usalo solo se i soldi sono già arrivati. Procedo?'
      )
      if (!ok) return
    }
    setCreando(true)
    setErrore('')
    try {
      const res = await fetch('/api/nuovo-ordine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negozioId,
          cliente: { nome, cognome, email, telefono },
          consegna: {
            data,
            fascia,
            indirizzo,
            civicoNote: note,
            cap,
            citta,
            provincia,
            paese,
          },
          righe: righe.map((r) => ({
            variantId: r.variantId,
            titolo: r.variantId ? undefined : r.titolo,
            prezzo: r.variantId ? undefined : r.prezzo,
            quantita: r.quantita,
          })),
          biglietto,
          spedizione: { titolo: spedizioneTitolo, prezzo: Number(spedizionePrezzo) || 0 },
          pagamento,
          mezzoPagamento: mezzo,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        errore?: string
        linkPagamento?: string
        ordineNumero?: string
        inviato?: boolean
      }
      if (!res.ok) {
        setErrore(d.errore || 'Ordine non creato.')
        return
      }
      setEsito({
        linkPagamento: d.linkPagamento ?? '',
        ordineNumero: d.ordineNumero ?? '',
        inviato: Boolean(d.inviato),
      })
    } catch {
      setErrore('Ordine non creato: problema di rete.')
    } finally {
      setCreando(false)
    }
  }

  if (esito) {
    return (
      <>
        <div className="testa-pagina">
          <h1>Ordine creato</h1>
        </div>
        <div className="card">
          {esito.ordineNumero ? (
            <>
              <p>
                Ordine <strong>{esito.ordineNumero}</strong> creato e segnato come{' '}
                <strong>pagato ({mezzo})</strong>.
              </p>
              <p className="descrizione">
                ⚠️ Arriva nella bacheca al prossimo giro del registro (entro 20 minuti), con la
                sua consegna e i suoi passi. Fino ad allora lo trovi su Shopify.
              </p>
            </>
          ) : (
            <>
              <p>
                Bozza creata.{' '}
                {esito.inviato
                  ? `Il link di pagamento è partito per email a ${email}.`
                  : 'Il link di pagamento è qui sotto: mandalo tu al cliente.'}
              </p>
              {esito.linkPagamento ? (
                <>
                  <label className="campo">
                    <span>Link di pagamento</span>
                    <input readOnly value={esito.linkPagamento} />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="bottone"
                      onClick={() => navigator.clipboard?.writeText(esito.linkPagamento)}
                    >
                      Copia link
                    </button>
                    {telefono.trim() ? (
                      <a
                        className="bottone secondario"
                        href={`https://wa.me/${telefono.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                          `Ecco il link per completare l'ordine: ${esito.linkPagamento}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Manda su WhatsApp
                      </a>
                    ) : null}
                  </div>
                </>
              ) : null}
              <p className="descrizione">
                ⚠️ Finché il cliente non paga <strong>resta una bozza</strong>: non compare fra
                gli ordini da lavorare, ed è giusto così — non c'è niente da consegnare finché
                non è pagato.
              </p>
            </>
          )}
          <button className="bottone secondario" onClick={() => setEsito(null)}>
            Fai un altro ordine
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="testa-pagina">
        <h1>Nuovo ordine</h1>
        <span className="cella-sub">
          Per il cliente al telefono. L&apos;ordine nasce su Shopify e torna qui dal registro.
        </span>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Negozio e cliente</h2>
        <div className="griglia-campi">
          <label className="campo">
            <span>Negozio</span>
            <select value={negozioId} onChange={(e) => setNegozioId(e.target.value)}>
              <option value="">Scegli…</option>
              {negozi.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Cognome</span>
            <input value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="serve per il link di pagamento" />
          </label>
          <label className="campo">
            <span>Telefono</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Consegna</h2>
        <div className="griglia-campi">
          <label className="campo">
            <span>Giorno</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            <span>Fascia oraria</span>
            <input value={fascia} onChange={(e) => setFascia(e.target.value)} placeholder="16-20" />
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            <span>Indirizzo</span>
            <input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via …, 12" />
          </label>
          <label className="campo">
            <span>CAP</span>
            <input value={cap} onChange={(e) => setCap(e.target.value)} />
          </label>
          <label className="campo">
            <span>Città</span>
            <input value={citta} onChange={(e) => setCitta(e.target.value)} />
          </label>
          <label className="campo">
            <span>Provincia</span>
            <input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="MI" />
          </label>
          <label className="campo">
            <span>Paese</span>
            <input value={paese} onChange={(e) => setPaese(e.target.value)} placeholder="IT" />
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            <span>Note per la consegna (citofono, piano, orari)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          ⚠️ Giorno e fascia si scrivono negli attributi che il registro sa leggere: senza,
          l&apos;ordine torna indietro «consegna non indicata» e finisce in fondo alla bacheca.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Prodotti</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void cerca()
            }}
            placeholder="Cerca nel catalogo del negozio…"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="bottone secondario" onClick={() => void cerca()} disabled={cercando}>
            {cercando ? 'Cerco…' : 'Cerca'}
          </button>
        </div>

        {/* ⚠️ Resta per il giorno in cui il permesso venisse tolto: un catalogo
            che non si legge deve DIRLO, non tornare una lista vuota — «non c'è
            niente con quel nome» è un'altra cosa da «non posso guardare». */}
        {catalogoChiuso ? (
          <div className="avviso-errore">
            L&apos;app non ha il permesso di leggere il catalogo (<code>read_products</code>):
            scrivi la riga a mano qui sotto. ⚠️ Un ordine così non porta la <strong>foto del
            prodotto</strong>, che è quella che si manda al fornitore.
          </div>
        ) : null}

        {prodotti.length ? (
          <div className="griglia-fornitori" style={{ marginBottom: 10 }}>
            {prodotti.map((p) => (
              <button
                key={p.variantId}
                className="card riga-cliccabile"
                style={{ padding: 8, textAlign: 'left' }}
                onClick={() =>
                  setRighe((r) => [
                    ...r,
                    {
                      variantId: p.variantId,
                      titolo: p.titolo,
                      variante: p.variante,
                      prezzo: p.prezzo,
                      quantita: 1,
                      immagine: p.immagine,
                    },
                  ])
                }
              >
                {/* ⚠️ La foto, non solo il nome: al telefono col cliente si
                    riconosce «quello con le peonie» in un colpo d'occhio, e i
                    titoli si somigliano tutti («Bouquet La Lady in Rose ·
                    Medio», «· Medio-Grande», «· Grande»). È anche la foto che
                    finirà nell'ordine e che si manda al fornitore. */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.immagine ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.immagine}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : null}
                  <div>
                    <div className="cella-nome">{p.titolo}</div>
                    <div className="cella-sub">
                      {[p.variante, soldi(p.prezzo), p.disponibile ? '' : 'non disponibile']
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {/* La riga scritta a mano: serve col catalogo chiuso, e per i
            fuori-listino veri (una composizione su misura). */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="campo" style={{ flex: 1, minWidth: 200 }}>
            <span>Riga scritta a mano</span>
            <input
              value={rigaTitolo}
              onChange={(e) => setRigaTitolo(e.target.value)}
              placeholder="Bouquet di rose rosse, 24 steli"
            />
          </label>
          <label className="campo" style={{ width: 120 }}>
            <span>Prezzo €</span>
            <input value={rigaPrezzo} onChange={(e) => setRigaPrezzo(e.target.value)} placeholder="85" />
          </label>
          <button
            className="bottone secondario"
            onClick={() => {
              if (!rigaTitolo.trim()) return
              setRighe((r) => [
                ...r,
                { titolo: rigaTitolo.trim(), prezzo: Number(rigaPrezzo) || 0, quantita: 1 },
              ])
              setRigaTitolo('')
              setRigaPrezzo('')
            }}
          >
            Aggiungi
          </button>
        </div>

        {righe.length ? (
          <table className="tabella" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Prezzo</th>
                <th>Quantità</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.titolo}
                    {r.variante ? <span className="cella-sub"> · {r.variante}</span> : null}
                    {!r.variantId ? <span className="cella-sub"> · riga a mano</span> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{soldi(r.prezzo)}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={r.quantita}
                      onChange={(e) =>
                        setRighe((righe) =>
                          righe.map((x, k) =>
                            k === i ? { ...x, quantita: Math.max(1, Number(e.target.value) || 1) } : x
                          )
                        )
                      }
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <button
                      className="bottone secondario mini"
                      onClick={() => setRighe((righe) => righe.filter((_, k) => k !== i))}
                    >
                      Togli
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="descrizione">Nessun prodotto ancora.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Consegna, biglietto e pagamento</h2>
        <div className="griglia-campi">
          <label className="campo">
            <span>Voce di spedizione</span>
            <input value={spedizioneTitolo} onChange={(e) => setSpedizioneTitolo(e.target.value)} />
          </label>
          <label className="campo">
            <span>Costo spedizione €</span>
            <input value={spedizionePrezzo} onChange={(e) => setSpedizionePrezzo(e.target.value)} />
          </label>
        </div>
        <label className="campo">
          <span>Biglietto (il messaggio per chi riceve)</span>
          <textarea rows={3} value={biglietto} onChange={(e) => setBiglietto(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0' }}>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={pagamento === 'link'}
              onChange={() => setPagamento('link')}
            />
            <span>
              <strong>Link di pagamento</strong> — paga lui, resta bozza finché non paga
            </span>
          </label>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={pagamento === 'pagato'}
              onChange={() => setPagamento('pagato')}
            />
            <span>
              <strong>Ha già pagato</strong> — l&apos;ordine nasce pagato
            </span>
          </label>
          {pagamento === 'pagato' ? (
            <label className="campo" style={{ width: 180 }}>
              <span>Con che mezzo</span>
              <select value={mezzo} onChange={(e) => setMezzo(e.target.value)}>
                <option value="bonifico">Bonifico</option>
                <option value="contanti">Contanti</option>
                <option value="POS">POS</option>
                <option value="PayPal">PayPal</option>
                <option value="altro">Altro</option>
              </select>
            </label>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Totale {soldi(totale)}</strong>
          <button className="bottone" onClick={crea} disabled={creando || !negozioId}>
            {creando ? 'Creo…' : pagamento === 'link' ? 'Crea e manda il link' : 'Crea come pagato'}
          </button>
        </div>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          ⚠️ «Ha già pagato» scrive su Shopify un ordine <strong>pagato</strong>: usalo solo
          quando i soldi sono arrivati davvero. Il mezzo resta scritto nelle note dell&apos;ordine.
        </p>
      </div>
    </>
  )
}
