'use client'

import { useState } from 'react'

const GIORNI = [
  { n: 1, etichetta: 'Lun' },
  { n: 2, etichetta: 'Mar' },
  { n: 3, etichetta: 'Mer' },
  { n: 4, etichetta: 'Gio' },
  { n: 5, etichetta: 'Ven' },
  { n: 6, etichetta: 'Sab' },
  { n: 0, etichetta: 'Dom' },
]

/**
 * I campi della RIPETIZIONE di un appuntamento. Viaggiano nel form come
 * ripetiTipo / ripetiOgni / ripetiGiorni / ripetiMese / ripetiGiornoMese /
 * ripetiFine, letti dal server con `ricorrenzaDaForm`.
 *
 * Le occorrenze diventano appuntamenti veri (uno per data): si vedono nel
 * calendario, nel feed iCal e fra i prossimi appuntamenti come tutti gli altri.
 */
export function Ricorrenza() {
  const [tipo, setTipo] = useState<'no' | 'giorni' | 'settimana' | 'mese'>('no')
  const [ogni, setOgni] = useState(1)
  const [giorni, setGiorni] = useState<number[]>([])
  const [mese, setMese] = useState('giorno')
  const [giornoMese, setGiornoMese] = useState(1)

  const toggleGiorno = (n: number) =>
    setGiorni((g) => (g.includes(n) ? g.filter((x) => x !== n) : [...g, n]))

  return (
    <>
      <div className="full">
        <label className="field-label">Si ripete</label>
        <select
          name="ripetiTipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          style={{ maxWidth: 320 }}
        >
          <option value="no">Non si ripete</option>
          <option value="giorni">Ogni tot giorni</option>
          <option value="settimana">Giorni della settimana</option>
          <option value="mese">Un giorno del mese</option>
        </select>
      </div>

      {tipo === 'giorni' && (
        <div className="full" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5 }}>Ogni</span>
          <input
            type="number"
            name="ripetiOgni"
            min={1}
            max={365}
            value={ogni}
            onChange={(e) => setOgni(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <span style={{ fontSize: 13.5 }}>giorni</span>
        </div>
      )}

      {tipo === 'settimana' && (
        <div className="full">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 13.5 }}>Ogni</span>
            <input
              type="number"
              name="ripetiOgni"
              min={1}
              max={52}
              value={ogni}
              onChange={(e) => setOgni(Number(e.target.value))}
              style={{ width: 90 }}
            />
            <span style={{ fontSize: 13.5 }}>settimane, nei giorni:</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GIORNI.map((g) => (
              <button
                key={g.n}
                type="button"
                className={`prio-btn ${giorni.includes(g.n) ? 'attivo' : ''}`}
                onClick={() => toggleGiorno(g.n)}
                title={`Ripeti di ${g.etichetta}`}
              >
                {g.etichetta}
              </button>
            ))}
          </div>
          <input type="hidden" name="ripetiGiorni" value={giorni.join(',')} />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Se non scegli nessun giorno si usa quello dell’appuntamento.
          </div>
        </div>
      )}

      {tipo === 'mese' && (
        <div className="full">
          <select
            name="ripetiMese"
            value={mese}
            onChange={(e) => setMese(e.target.value)}
            style={{ maxWidth: 380 }}
          >
            <option value="giorno">Un giorno preciso del mese</option>
            <option value="ultimo-feriale">L’ultimo giorno feriale del mese</option>
            <option value="primo-feriale">Il primo giorno feriale del mese</option>
            <option value="ultimo">L’ultimo giorno del mese</option>
          </select>
          {mese === 'giorno' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 13.5 }}>Giorno</span>
              <input
                type="number"
                name="ripetiGiornoMese"
                min={1}
                max={31}
                value={giornoMese}
                onChange={(e) => setGiornoMese(Number(e.target.value))}
                style={{ width: 90 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                I mesi che non hanno quel giorno (es. il 31 a febbraio) si saltano.
              </span>
            </div>
          )}
        </div>
      )}

      {tipo !== 'no' && (
        <div>
          <label className="field-label">Ripeti fino al</label>
          <input type="date" name="ripetiFine" />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Se lo lasci vuoto: un anno.
          </div>
        </div>
      )}
    </>
  )
}
