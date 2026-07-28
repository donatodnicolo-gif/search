import Link from 'next/link'
import { schedaCliente } from '@/lib/scheda-cliente'
import { profiloCliente } from '@/lib/cliente-valore'
import { nomeTipoCliente, coloreTipoCliente } from '@/lib/clienti-tipo'
import { linguaCliente, nomeLingua } from '@/lib/lingua'

export const dynamic = 'force-dynamic'

// La scheda di un cliente: conversazioni aperte, storico ordini, reclami e
// rimborsi. Ci si arriva dal dettaglio di un ordine.
//
// ⚠️ La chiave è EMAIL o TELEFONO, mai il nome: gli omonimi esistono, e aprire
// la scheda sbagliata è peggio che non aprirla. Passano in query string perché
// contengono @ e +, che in un segmento di percorso si incastrano.

const soldi = (v: number, valuta = 'EUR') =>
  v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })

const dataBreve = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export default async function PaginaSchedaCliente({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; telefono?: string; paese?: string }>
}) {
  const p = await searchParams
  const scheda = await schedaCliente({ email: p.email ?? '', telefono: p.telefono ?? '' })

  if (!scheda) {
    return (
      <main>
        <div className="card">
          <h1 style={{ marginTop: 0, fontSize: 20 }}>Cliente non identificabile</h1>
          <p className="descrizione">
            Per aprire una scheda serve almeno un&apos;<strong>email</strong> o un{' '}
            <strong>telefono</strong>: il nome non basta, perché due persone possono chiamarsi
            uguale e aprire la scheda sbagliata è peggio che non aprirla.
          </p>
          <Link className="btn btn-secondario" href="/">
            Torna agli ordini
          </Link>
        </div>
      </main>
    )
  }

  const profilo = profiloCliente(scheda.ordiniInTutto)
  const lingua = linguaCliente(p.paese ?? '', scheda.telefono, scheda.email)
  const reclamiAperti = scheda.reclami.filter((r) => r.stato !== 'risolto' && r.stato !== 'chiuso')
  const nonLetti = scheda.conversazioni.reduce((s, c) => s + c.nonLetti, 0)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">{scheda.nome || scheda.email || scheda.telefono}</h1>
          <p className="page-sub">
            {scheda.email ? <>{scheda.email} · </> : null}
            {scheda.telefono || 'nessun telefono'} · gli si scrive in{' '}
            <strong>{nomeLingua(lingua.lingua)}</strong>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {profilo.etichetta ? (
          <span
            className="badge"
            style={profilo.tono === 'oro' ? { color: 'var(--gold)' } : undefined}
            title={profilo.spiega}
          >
            {profilo.etichetta}
          </span>
        ) : null}
        {scheda.tipoCliente ? (
          <span className="badge" style={{ color: coloreTipoCliente(scheda.tipoCliente) }}>
            {nomeTipoCliente(scheda.tipoCliente)}
          </span>
        ) : null}
        {reclamiAperti.length ? (
          <span className="badge rosso">
            {reclamiAperti.length} reclam{reclamiAperti.length === 1 ? 'o aperto' : 'i aperti'}
          </span>
        ) : null}
        {nonLetti ? <span className="badge">{nonLetti} da leggere</span> : null}
      </div>

      {/* Gli avvisi vengono per primi: una scheda incompleta che non lo dice
          porta a concludere «cliente occasionale» su uno che ordina da anni. */}
      {scheda.avvisi.map((a, i) => (
        <div className="avviso-errore" key={i}>
          {a}
        </div>
      ))}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Conversazioni</h2>
        {scheda.conversazioni.length === 0 ? (
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Nessuna conversazione con questo cliente.
          </p>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Canale</th>
                  <th>Ultimo messaggio</th>
                  <th>Quando</th>
                  <th className="num">Da leggere</th>
                </tr>
              </thead>
              <tbody>
                {scheda.conversazioni.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className={`badge canale-${c.canale}`}>{c.canale}</span>
                    </td>
                    <td>
                      <div className="cella-sub" style={{ maxWidth: 460 }}>
                        {c.ultimoTesto.slice(0, 140)}
                      </div>
                    </td>
                    <td className="cella-muta">{dataBreve(c.ultimoMessaggioIl)}</td>
                    <td className="cella-num">{c.nonLetti || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <Link className="btn btn-secondario small" href="/inbox">
            Apri Inbox
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          Ordini {scheda.ordini.length ? `(${scheda.ordini.length})` : ''}
        </h2>
        <p className="descrizione">
          {scheda.fonteOrdini === 'registro'
            ? 'Dallo storico completo del registro Ordini.'
            : 'Solo dagli ultimi due mesi: lo storico completo non era raggiungibile.'}{' '}
          {scheda.speso > 0 ? (
            <>
              Totale visibile: <strong>{soldi(scheda.speso)}</strong>.
            </>
          ) : null}
        </p>
        {scheda.ordini.length === 0 ? (
          <p className="descrizione" style={{ marginBottom: 0 }}>Nessun ordine trovato.</p>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Brand</th>
                  <th>Data</th>
                  <th>Consegna</th>
                  <th className="num">Totale</th>
                </tr>
              </thead>
              <tbody>
                {scheda.ordini.map((o) => (
                  <tr key={o.brand + o.numero}>
                    <td className="cella-nome">{o.numero}</td>
                    <td className="cella-muta">{o.brand}</td>
                    <td className="cella-muta">{dataBreve(o.data)}</td>
                    <td className="cella-muta">
                      {o.dataConsegna ? dataBreve(o.dataConsegna) : 'non indicata'}
                    </td>
                    <td className="cella-num">{soldi(o.totale, o.valuta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Reclami e rimborsi</h2>
        {scheda.reclami.length === 0 && scheda.rimborsi.length === 0 ? (
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Nessun reclamo e nessun rimborso: con questo cliente non è mai andato storto niente.
          </p>
        ) : (
          <>
            {scheda.reclami.map((r, i) => (
              <div key={'r' + i} style={{ marginBottom: 8 }}>
                <strong>{r.casistica || 'Reclamo'}</strong>{' '}
                <span className="cella-sub">
                  ordine {r.ordineNumero || '—'} · {r.stato} · gravità {r.gravita} ·{' '}
                  {dataBreve(r.creatoIl)}
                </span>
              </div>
            ))}
            {scheda.rimborsi.map((r, i) => (
              <div key={'x' + i} style={{ marginBottom: 8 }}>
                <strong>Rimborso {soldi(r.importo)}</strong>{' '}
                <span className="cella-sub">
                  ordine {r.ordineNumero || '—'} · {r.stato} · {dataBreve(r.creatoIl)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  )
}
