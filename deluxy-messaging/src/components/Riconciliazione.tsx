'use client'

import { useCallback, useEffect, useState } from 'react'
import { ibanAccorciato } from '@/lib/cerca-fornitore'
import { euro, pct } from '@/lib/margine'
import { daFare, valoreSospeso, type Riga } from '@/lib/riconciliazione'
import { linkOrdine } from '@/lib/link-ordine'

// RIMETTERE INSIEME QUELLO CHE SAPPIAMO GIÀ.
//
// ⚠️⚠️ Misurato il 24/08/2026: 8 pagamenti fatti — nome, IBAN, importo, ordine
// collegato — e ZERO ordini con un fornitore registrato, su 1.341. Il dato non
// mancava: stava in un'altra tabella e nessuno lo aveva mai portato di là.
// Senza, il costo non arriva a Orders e il margine risulta «non calcolabile» su
// ordini in cui è calcolabilissimo (41% su sei di loro).
//
// ⚠️ Questa pagina PROPONE e una persona conferma. Un «sistema tutto» che
// scrive ottanta costi di fornitura senza che nessuno li abbia letti sposta
// soltanto il problema: da «non sappiamo niente» a «sappiamo cose che nessuno
// ha verificato», che è peggio perché sembra vero.

const COLORE: Record<string, string> = {
  'da-registrare': 'var(--green)',
  'gia-registrato': 'var(--text-tertiary)',
  'rimborso-al-cliente': 'var(--red)',
  'costo-diverso': 'var(--orange, #B8963E)',
  'ordine-annullato': 'var(--text-tertiary)',
  'senza-ordine': 'var(--text-tertiary)',
  'ordine-non-nostro': 'var(--text-tertiary)',
}

const ETICHETTA: Record<string, string> = {
  'da-registrare': 'da registrare',
  'gia-registrato': 'già a posto',
  'rimborso-al-cliente': 'sembra un rimborso',
  'costo-diverso': 'non torna',
  'ordine-annullato': 'annullato',
  'senza-ordine': 'senza ordine',
  'ordine-non-nostro': 'ordine non nostro',
}

export function Riconciliazione() {
  const [righe, setRighe] = useState<Riga[]>([])
  const [nota, setNota] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [lavoro, setLavoro] = useState('')
  const [errore, setErrore] = useState('')
  const [fatte, setFatte] = useState<Record<string, string>>({})

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/riconciliazione')
      if (!res.ok) {
        setErrore('Non sono riuscito a leggere i pagamenti.')
        return
      }
      const d = (await res.json()) as { righe: Riga[]; notaRegistro: string }
      setRighe(d.righe)
      setNota(d.notaRegistro || '')
    } catch {
      setErrore('Rete assente.')
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function applica(r: Riga, azione: 'registra' | 'allinea-stato') {
    setLavoro(r.richiestaId + azione)
    setErrore('')
    try {
      const res = await fetch('/api/riconciliazione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richiestaId: r.richiestaId, azione }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        errore?: string
        orders?: { ok: boolean; messaggio?: string }
      }
      if (!res.ok || !d.ok) {
        // ⚠️ L'errore si mostra com'è: quasi sempre è «nel frattempo è
        // cambiato qualcosa», e dirlo è l'unica cosa che fa capire perché il
        // bottone non ha funzionato.
        setErrore(d.errore || 'Non è riuscito.')
        return
      }
      setFatte((f) => ({
        ...f,
        [r.richiestaId]:
          azione === 'allinea-stato'
            ? 'stato allineato'
            : d.orders && !d.orders.ok
              ? `registrato qui, ma Orders non l'ha preso: ${d.orders.messaggio ?? ''}`
              : 'registrato, e il costo è arrivato a Orders',
      }))
      await carica()
    } catch {
      setErrore('Rete assente.')
    } finally {
      setLavoro('')
    }
  }

  const sospeso = valoreSospeso(righe)
  const restano = daFare(righe)

  /**
   * Una riga. ⚠️ Sta in una funzione sola perché si mostra in DUE posti: fra
   * le eccezioni da sistemare e nell'elenco di controllo quando non c'è più
   * niente da fare. Due copie divergerebbero, e la seconda — quella che si
   * guarda per fidarsi di quello che ha fatto l'automatismo — sarebbe quella
   * rimasta indietro.
   */
  function rigaDi(r: Riga) {
    return (
            <div key={r.richiestaId} className="riquadro-fornitore">
              <div className="riga-titolo-fornitore">
                <span className="cella-nome">
                  {r.intestatario}
                  {r.iban ? (
                    // ⚠️ Mai l'IBAN intero in un elenco: le ultime quattro
                    // cifre bastano a riconoscerlo, e un elenco di IBAN
                    // completi a schermo è una cosa che si fotografa.
                    <span className="cella-sub"> · {ibanAccorciato(r.iban)}</span>
                  ) : null}
                </span>
                {/* ⚠️ Niente pallino nel testo: `.badge::before` ne disegna
                    già uno e prende il colore da `color`. Scrivendone un
                    secondo se ne vedevano due (misurato nell'anteprima). */}
                <span className="badge" style={{ color: COLORE[r.verdetto] }}>
                  {ETICHETTA[r.verdetto]}
                </span>
              </div>
  
              <div className="cella-sub">
                {[
                  r.ordine ? `${r.ordine.numero} · ${r.ordine.negozioNome}` : 'nessun ordine',
                  r.ordine && r.ordine.totale
                    ? `venduto ${euro(r.ordine.totale)}`
                    : '',
                  `pagato ${euro(r.importo)}`,
                  r.pagataIl ? new Date(r.pagataIl).toLocaleDateString('it-IT') : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
  
              {/* Quanto conosciamo già questo nome. ⚠️ «non nel registro» si
                  scrive solo se l'elenco è arrivato intero: vedi la nota in
                  cima. */}
              {r.registro ? (
                <div className="cella-sub">
                  Nel registro:{' '}
                  <strong>{r.registro.nome}</strong>
                  {r.registro.citta ? ` · ${r.registro.citta}` : ''}
                  {r.registro.telefono ? ` · ${r.registro.telefono}` : ''}
                </div>
              ) : !nota ? (
                <div className="cella-sub">Non è nel registro Anagrafiche.</div>
              ) : null}
  
              {r.margine ? (
                <div className="cella-sub">
                  Ne risulterebbe un margine di <strong>{euro(r.margine.margineEuro)}</strong>, il{' '}
                  {pct(r.margine.marginePct)}.
                </div>
              ) : null}
  
              <p className="frase-riconciliazione">{r.frase}</p>
  
              {fatte[r.richiestaId] ? (
                <p className="cella-sub" style={{ color: 'var(--green)' }}>
                  ✓ {fatte[r.richiestaId]}
                </p>
              ) : null}
  
              <div className="azioni-fornitore">
                {r.verdetto === 'da-registrare' ? (
                  <button
                    className="btn small"
                    onClick={() => void applica(r, 'registra')}
                    disabled={!!lavoro}
                  >
                    {lavoro === r.richiestaId + 'registra' ? 'Registro…' : 'Registra sull’ordine'}
                  </button>
                ) : null}
                {/* ⚠️ Un ordine PAGATO che risulta ancora «da iniziare» dice a
                    un collega di mettersi al lavoro su una cosa già chiusa, e
                    falsa il conteggio degli arretrati. */}
                {r.statoDaAllineare ? (
                  <button
                    className="btn btn-secondario small"
                    onClick={() => void applica(r, 'allinea-stato')}
                    disabled={!!lavoro}
                    title="Il pagamento è partito ma l’ordine risulta ancora da iniziare: lo porto in «attesa di consegna»"
                  >
                    {lavoro === r.richiestaId + 'allinea-stato'
                      ? 'Allineo…'
                      : 'Allinea lo stato (è pagato)'}
                  </button>
                ) : null}
                {r.ordine ? (
                  <a
                    className="btn btn-secondario small"
                    href={linkOrdine(r.ordine.numero)}
                  >
                    Apri {r.ordine.numero}
                  </a>
                ) : (
                  <a className="btn btn-secondario small" href="/pagamenti">
                    Collega un ordine
                  </a>
                )}
              </div>
            </div>
    )
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Riconciliazione</h1>
          <p className="page-sub">
            Pagando da questa app,{' '}
            <strong>l&apos;ordine impara da solo</strong> chi l&apos;ha preparato e quanto è
            costato: succede premendo «Pagata», e il costo parte verso Deluxy Orders. Qui restano
            le <strong>eccezioni</strong> — i pagamenti vecchi, quelli fatti altrove, e quelli su
            cui non decido io: un nome che somiglia a quello del cliente, un fornitore diverso già
            scritto sull&apos;ordine, un costo che non torna.
          </p>
        </div>
      </div>

      {nota ? (
        // ⚠️ Un elenco del registro arrivato a metà, letto come completo,
        // trasformerebbe «non l'ho ricevuto» in «non c'è» — e chi legge andrebbe
        // a creare un doppione di un fornitore che abbiamo già.
        <div className="avviso-errore">{nota}</div>
      ) : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : righe.length === 0 ? (
        <div className="vuoto">Nessun pagamento già fatto da riconciliare.</div>
      ) : restano.length === 0 ? (
        // ⚠️ «Zero da fare» non è una pagina vuota: si dice che è tutto a
        // posto e si lascia l'elenco sotto, perché serve anche a controllare
        // che cosa ha registrato l'automatismo — un automatismo che non si può
        // rileggere è un automatismo di cui nessuno si fida.
        <>
          <div className="riquadro-fornitore" style={{ marginBottom: 16 }}>
            <strong>Niente da rimettere insieme</strong>
            <p className="cella-sub" style={{ margin: '4px 0 0' }}>
              Ogni pagamento fatto risulta già sull&apos;ordine giusto. Qui sotto restano tutti,
              per rileggere che cosa è stato registrato e da chi.
            </p>
          </div>
          <div className="elenco-riconciliazione">{righe.map((r) => rigaDi(r))}</div>
        </>
      ) : (
        <>
          {restano.length > 0 ? (
            <div className="riquadro-fornitore" style={{ marginBottom: 16 }}>
              <strong>
                {restano.length}{' '}
                {restano.length === 1 ? 'ordine non sa' : 'ordini non sanno'} chi li ha preparati
              </strong>
              <p className="cella-sub" style={{ margin: '4px 0 0' }}>
                Il fatto è già in casa: l&apos;abbiamo pagato. Registrandolo, Orders può calcolare{' '}
                {euro(sospeso.margine)} di margine che adesso risulta non calcolabile.
              </p>
            </div>
          ) : null}

          <div className="elenco-riconciliazione">
            {righe.map((r) => rigaDi(r))}
          </div>
        </>
      )}
    </main>
  )
}
