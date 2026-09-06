'use client'
import { useEffect, useState } from 'react'

// ⭐ 06/09/2026 — LA PROPOSTA DI VENDITA sulla scheda ordine (nuova architettura):
// a chi proporre, in che ordine, con che sconto; l'anomalia «deluxy.it fuori
// provincia senza extra» quando c'è. Si legge a richiesta, non pesa sull'apertura.
type Proposta = {
  provincia: string | null
  guantiBianchi: boolean
  speseConsegna: number | null
  extraPagato: boolean | null
  anomalia: string | null
  conPartner: boolean | null
  sconto: { sconto: number; quota: number; regola: string; motivo: string } | null
  prezzoPubblico: number
  prezzoFornitore: number | null
  mestiere: string
  candidati: { id: string; insegna: string; posizione: number; consegnaDaPartner: boolean; consegnaInProvincia: boolean; minimoOrdine: number | null; raggioKm: number | null; fonte: string }[]
  note: string[]
  piattaforma: 'ok' | 'non-risponde'
}

export function PropostaVendita({ ordineId, valuta }: { ordineId: string; valuta?: string }) {
  const [p, setP] = useState<Proposta | null>(null)
  const [errore, setErrore] = useState('')
  const [aperta, setAperta] = useState(false)
  useEffect(() => {
    if (!aperta) return
    let vivo = true
    fetch(`/api/ordini/${ordineId}/proposta-vendita`)
      .then(async (r) => { const d = await r.json(); if (!vivo) return; if (!r.ok) setErrore(d.errore ?? 'Errore'); else setP(d.proposta) })
      .catch(() => vivo && setErrore('Proposta non letta'))
    return () => { vivo = false }
  }, [aperta, ordineId])
  const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
  if (!aperta) {
    return (
      <p className="descrizione" style={{ marginBottom: 6 }}>
        <button type="button" className="bottone secondario mini" onClick={() => setAperta(true)}>Proposta di vendita: a chi e con che sconto</button>
      </p>
    )
  }
  if (errore) return <p className="avviso-errore">{errore}</p>
  if (!p) return <p className="descrizione">Calcolo la proposta…</p>
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      {p.anomalia && <p className="avviso-errore"><strong>Anomalia:</strong> {p.anomalia}</p>}
      <p className="descrizione" style={{ marginBottom: 6 }}>
        {p.guantiBianchi ? 'Consegna deluxy.it in guanti bianchi' : 'Consegna del partner'}
        {p.provincia ? <> · provincia <strong>{p.provincia}</strong></> : ' · provincia non riconosciuta'}
        {p.conPartner !== null && <> · {p.conPartner ? 'con partner' : 'senza partner'}</>}
        {p.speseConsegna !== null && <> · spese di consegna pagate {euro(p.speseConsegna)}</>}
      </p>
      {p.sconto && (
        <p className="descrizione" style={{ marginBottom: 6 }}>
          Sconto <strong>{p.sconto.sconto}%</strong> sul prezzo pubblico dei prodotti ({euro(p.prezzoPubblico)}) → al fornitore <strong>{p.prezzoFornitore !== null ? euro(p.prezzoFornitore) : '—'}</strong>, arrotondato a 5. <span className="cella-muta">{p.sconto.motivo}.</span>
        </p>
      )}
      {p.candidati.length > 0 ? (
        <>
          <p className="descrizione" style={{ marginBottom: 4 }}>A chi proporre, in ordine ({p.candidati[0].fonte}):</p>
          <ol style={{ margin: '0 0 6px', paddingLeft: 22 }}>
            {p.candidati.map((c) => (
              <li key={c.id}>
                {c.insegna}
                {c.consegnaDaPartner && <span className="cella-muta"> · consegna da solo{c.consegnaInProvincia ? '' : ' (non qui)'}</span>}
                {c.minimoOrdine != null && <span className="cella-muta"> · minimo {c.minimoOrdine} €</span>}
                {c.raggioKm != null && <span className="cella-muta"> · raggio {c.raggioKm} km</span>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="descrizione">Nessun partner da proporre in automatico.</p>
      )}
      {p.note.map((n, i) => <p key={i} className="descrizione cella-muta" style={{ marginBottom: 2 }}>{n}</p>)}
      {p.piattaforma === 'non-risponde' && <p className="avviso-errore">La piattaforma consegne non ha risposto.</p>}
    </div>
  )
}
