'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaScriptPronto } from '@/lib/actions'
import { VARIABILI_SUGGERITE } from '@/lib/scriptTesto'

/**
 * Scrive una RISPOSTA RAPIDA e la manda a vivere nell'app Scripts.
 *
 * ⚠️ Qui non si salva niente in locale: il testo nasce già là, dove stanno tutti
 * i testi dell'azienda, e da lì torna in ogni app che lo usa. È l'opposto di
 * farsene una copia — due versioni dello stesso testo aziendale divergono, ed è
 * il motivo per cui Scripts esiste.
 *
 * I buchi si scrivono `{{COSÌ}}`: chi manderà il messaggio li riempirà coi dati
 * di chi riceve. Non vanno riempiti adesso, e soprattutto non vanno riempiti con
 * un valore «di esempio»: resterebbe lì e partirebbe al cliente.
 */
export function NuovaRispostaRapida({ apertaAllInizio = false }: { apertaAllInizio?: boolean }) {
  const [aperta, setAperta] = useState(apertaAllInizio)
  const [nome, setNome] = useState('')
  const [oggetto, setOggetto] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [categoria, setCategoria] = useState('assistenza')
  const [corpo, setCorpo] = useState('')
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const salva = () =>
    start(async () => {
      const form = new FormData()
      form.set('nome', nome)
      form.set('oggetto', oggetto)
      form.set('descrizione', descrizione)
      form.set('categoria', categoria)
      form.set('corpo', corpo)
      const r = await salvaScriptPronto(form)
      setEsito(r)
      if (r.ok) {
        setNome('')
        setOggetto('')
        setDescrizione('')
        setCorpo('')
        router.refresh()
      }
    })

  // Aggiunge un segnaposto in coda al testo: si scrivono a mano, ma averli in
  // un elenco tiene gli stessi nomi in tutta l'azienda (è così che i valori
  // impostati per l'app — firma, recapiti — si agganciano davvero).
  const metti = (chiave: string) => setCorpo((c) => `${c}{{${chiave}}}`)

  if (!aperta) {
    return (
      <button type="button" className="btn primary small" onClick={() => setAperta(true)}>
        ＋ Nuova risposta rapida
      </button>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>Nuova risposta rapida</strong>
        <button type="button" className="azione-riga" onClick={() => setAperta(false)}>
          Chiudi
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label className="field-label">Nome</label>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            Come lo ritrovi mentre scrivi una mail. Es. «Ritardo consegna — scuse e nuova data».
          </p>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        </div>

        <div>
          <label className="field-label">Oggetto dell’email (opzionale)</label>
          <input type="text" value={oggetto} onChange={(e) => setOggetto(e.target.value)} maxLength={200} />
        </div>

        <div>
          <label className="field-label">Quando si usa (opzionale)</label>
          <input
            type="text"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            maxLength={200}
            placeholder="Una riga: a chi si manda e in che situazione"
          />
        </div>

        <div>
          <label className="field-label">Categoria</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="assistenza">Assistenza e reclami</option>
            <option value="vendite">Vendite</option>
            <option value="followup">Follow-up e solleciti</option>
            <option value="inviti">Inviti</option>
            <option value="presentazione">Presentazione aziendale</option>
            <option value="altro">Altro</option>
          </select>
        </div>

        <div>
          <label className="field-label">Messaggio</label>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            I dati che cambiano da un cliente all’altro si scrivono <code>{'{{COSÌ}}'}</code>: si
            riempiono al momento di mandare il messaggio. <strong>Non metterci un valore di
            esempio</strong> — resterebbe lì e partirebbe al cliente.
          </p>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={10}
            style={{ width: '100%', fontFamily: 'inherit' }}
          />
          <div className="riga-azioni" style={{ marginTop: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Aggiungi:</span>
            {VARIABILI_SUGGERITE.map((v) => (
              <button key={v} type="button" className="azione-riga" onClick={() => metti(v)}>
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn primary small"
            disabled={inCorso || !nome.trim() || !corpo.trim()}
            onClick={salva}
          >
            {inCorso ? 'Salvo in Scripts…' : 'Salva in Scripts'}
          </button>
          {esito && (
            <span style={{ fontSize: 12.5, color: esito.ok ? 'var(--text-secondary)' : 'var(--red)' }}>
              {esito.messaggio}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
