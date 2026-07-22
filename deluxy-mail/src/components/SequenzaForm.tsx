'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaSequenza, eliminaSequenza, fermaIscrizioneSequenza, type PassoInput } from '@/lib/actions'

type SequenzaDati = {
  id: string
  nome: string
  descrizione: string
  passi: PassoInput[]
}

const PASSO_VUOTO: PassoInput = { giorniAttesa: 3, oggetto: '', corpo: '', ramo: 'A' }

/**
 * L'editor di una sequenza: nome, descrizione e i passi (attesa in giorni,
 * oggetto e testo — modelli con le variabili {{nome}}, {{email}}, {{oggetto}}).
 */
export function SequenzaForm({
  iniziale,
  onChiudi,
}: {
  iniziale?: SequenzaDati
  onChiudi?: () => void
}) {
  const [nome, setNome] = useState(iniziale?.nome ?? '')
  const [descrizione, setDescrizione] = useState(iniziale?.descrizione ?? '')
  const [passi, setPassi] = useState<PassoInput[]>(
    iniziale?.passi?.length ? iniziale.passi : [{ ...PASSO_VUOTO }]
  )
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const aggiornaPasso = (i: number, campo: keyof PassoInput, valore: string | number) =>
    setPassi((p) => p.map((x, j) => (j === i ? { ...x, [campo]: valore } : x)))

  const salva = () =>
    start(async () => {
      setStato(null)
      const esito = await salvaSequenza({ id: iniziale?.id, nome, descrizione, passi })
      setStato(esito.messaggio)
      if (esito.ok) {
        router.refresh()
        onChiudi?.()
      }
    })

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="form-grid">
        <div>
          <label className="field-label">Nome della sequenza <span className="req">*</span></label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Follow-up preventivo" />
        </div>
        <div>
          <label className="field-label">Descrizione</label>
          <input type="text" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Quando usarla (opzionale)" />
        </div>

        <div className="full" style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Variabili nei modelli: <code>{'{{nome}}'}</code> (nome del destinatario),{' '}
          <code>{'{{email}}'}</code> (suo indirizzo), <code>{'{{oggetto}}'}</code> (oggetto della
          mail iniziale). Ogni passo appartiene a un <strong>percorso</strong>: <strong>A</strong>{' '}
          (se il destinatario NON risponde: i follow-up) o <strong>B</strong> (se risponde: parte
          al posto dei follow-up).
        </div>

        {passi.map((p, i) => {
          const ramoB = p.ramo === 'B'
          return (
            <div
              key={i}
              className="full"
              style={{
                border: `1px solid ${ramoB ? 'rgba(52,199,89,.4)' : 'var(--hairline)'}`,
                borderRadius: 12,
                padding: 14,
                background: ramoB ? 'rgba(52,199,89,.04)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>Passo {i + 1}</strong>
                <select
                  value={p.ramo === 'B' ? 'B' : 'A'}
                  onChange={(e) => aggiornaPasso(i, 'ramo', e.target.value)}
                  style={{ width: 'auto', fontSize: 12.5, padding: '5px 8px' }}
                >
                  <option value="A">Percorso A — se NON risponde</option>
                  <option value="B">Percorso B — se risponde</option>
                </select>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>parte dopo</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={p.giorniAttesa}
                  onChange={(e) => aggiornaPasso(i, 'giorniAttesa', Number(e.target.value))}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {ramoB ? 'giorni dalla risposta (o dal passo B precedente)' : 'giorni di silenzio (o dal passo A precedente)'}
                </span>
                {passi.length > 1 && (
                  <button
                    type="button"
                    className="azione-riga"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => setPassi((x) => x.filter((_, j) => j !== i))}
                  >
                    Togli passo
                  </button>
                )}
              </div>
              <input
                type="text"
                value={p.oggetto}
                onChange={(e) => aggiornaPasso(i, 'oggetto', e.target.value)}
                placeholder="Oggetto — es. Re: {{oggetto}}"
                style={{ marginBottom: 8 }}
              />
              <textarea
                value={p.corpo}
                onChange={(e) => aggiornaPasso(i, 'corpo', e.target.value)}
                placeholder={
                  ramoB
                    ? 'Testo — es. Grazie {{nome}} per la risposta! Ti mando subito i dettagli…'
                    : 'Testo — es. Ciao {{nome}}, ti riscrivo in merito a "{{oggetto}}": hai avuto modo di dare un’occhiata?'
                }
                rows={4}
                style={{ width: '100%' }}
              />
            </div>
          )
        })}

        <div className="full" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary small" onClick={() => setPassi((p) => [...p, { ...PASSO_VUOTO, ramo: 'A' }])}>
            + Passo «se non risponde» (A)
          </button>
          <button type="button" className="btn secondary small" onClick={() => setPassi((p) => [...p, { ...PASSO_VUOTO, ramo: 'B' }])}>
            + Passo «se risponde» (B)
          </button>
        </div>
      </div>

      {stato && <div style={{ fontSize: 13, marginTop: 10, color: 'var(--text-secondary)' }}>{stato}</div>}

      <div className="form-footer">
        {onChiudi && (
          <button className="btn secondary" type="button" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </button>
        )}
        <button className="btn primary" type="button" onClick={salva} disabled={inCorso}>
          {inCorso ? 'Salvo…' : 'Salva sequenza'}
        </button>
      </div>
    </div>
  )
}

/** La card di una sequenza esistente: riepilogo passi, Modifica, Elimina. */
export function SequenzaCard({ sequenza }: { sequenza: SequenzaDati & { iscritteAttive: number } }) {
  const [modifica, setModifica] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  if (modifica) return <SequenzaForm iniziale={sequenza} onChiudi={() => setModifica(false)} />

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{sequenza.nome}</strong>
        <span className="badge neutral">{sequenza.passi.length} pass{sequenza.passi.length === 1 ? 'o' : 'i'}</span>
        {sequenza.iscritteAttive > 0 && (
          <span className="badge gold"><span className="dot" />{sequenza.iscritteAttive} in corso</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="azione-riga" onClick={() => setModifica(true)}>
            Modifica
          </button>
          <button
            type="button"
            className="azione-riga"
            disabled={inCorso}
            onClick={() =>
              start(async () => {
                await eliminaSequenza(sequenza.id)
                router.refresh()
              })
            }
          >
            Elimina
          </button>
        </span>
      </div>
      {sequenza.descrizione && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{sequenza.descrizione}</div>
      )}
      {(() => {
        const a = sequenza.passi.filter((p) => p.ramo !== 'B')
        const b = sequenza.passi.filter((p) => p.ramo === 'B')
        const riga = (p: PassoInput) => `+${p.giorniAttesa}g: ${p.oggetto || '(senza oggetto)'}`
        return (
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {a.length > 0 && <div><strong>Se non risponde:</strong> {a.map(riga).join('  ·  ')}</div>}
            {b.length > 0 && <div><strong>Se risponde:</strong> {b.map(riga).join('  ·  ')}</div>}
          </div>
        )
      })()}
    </div>
  )
}

/** Bottone "Ferma" su un'iscrizione attiva. */
export function FermaIscrizione({ id }: { id: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()
  return (
    <button
      type="button"
      className="azione-riga"
      disabled={inCorso}
      title="Ferma i prossimi invii per questo destinatario"
      onClick={() =>
        start(async () => {
          await fermaIscrizioneSequenza(id)
          router.refresh()
        })
      }
    >
      {inCorso ? '…' : 'Ferma'}
    </button>
  )
}
