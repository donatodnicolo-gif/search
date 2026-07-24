'use client'

export type CampoOrdine = 'data' | 'mittente' | 'oggetto' | 'dimensione'
export type Ordine = { campo: CampoOrdine; discendente: boolean }

/** La barra per ordinare una lista di posta: campo + verso. Il verso predefinito
 *  è quello «naturale» per ogni campo (le più recenti/grandi prima). */
export function BarraOrdinamento({
  valore,
  onCambia,
  /** In posta inviata il mittente è in realtà il destinatario. */
  etichettaMittente = 'Mittente',
}: {
  valore: Ordine
  onCambia: (o: Ordine) => void
  etichettaMittente?: string
}) {
  const campi: { campo: CampoOrdine; label: string }[] = [
    { campo: 'data', label: 'Data' },
    { campo: 'mittente', label: etichettaMittente },
    { campo: 'oggetto', label: 'Oggetto' },
    { campo: 'dimensione', label: 'Dimensione' },
  ]
  // Verso «naturale» quando si sceglie un campo nuovo.
  const naturale = (c: CampoOrdine) => c === 'data' || c === 'dimensione' // decrescente

  return (
    <div className="ordina-barra">
      <span className="ordina-etichetta">Ordina per</span>
      {campi.map((c) => {
        const attivo = valore.campo === c.campo
        return (
          <button
            key={c.campo}
            type="button"
            className={`ordina-btn ${attivo ? 'attivo' : ''}`}
            onClick={() =>
              onCambia(
                attivo
                  ? { campo: c.campo, discendente: !valore.discendente } // ripremi = inverti
                  : { campo: c.campo, discendente: naturale(c.campo) }
              )
            }
            title={attivo ? 'Clicca per invertire il verso' : `Ordina per ${c.label.toLowerCase()}`}
          >
            {c.label}
            {attivo && <span className="ordina-freccia">{valore.discendente ? '↓' : '↑'}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Confronto stabile secondo il campo scelto. `mittente` in posta inviata è il
 *  destinatario: chi chiama passa il valore giusto in `chiMittente`. */
export function confrontaRighe<
  T extends { data: Date | string; oggetto: string; dimensione?: number }
>(a: T, b: T, ordine: Ordine, chiMittente: (r: T) => string): number {
  const dir = ordine.discendente ? -1 : 1
  let d = 0
  switch (ordine.campo) {
    case 'data':
      d = new Date(a.data).getTime() - new Date(b.data).getTime()
      break
    case 'dimensione':
      d = (a.dimensione ?? 0) - (b.dimensione ?? 0)
      break
    case 'mittente':
      d = chiMittente(a).localeCompare(chiMittente(b), 'it', { sensitivity: 'base' })
      break
    case 'oggetto':
      d = (a.oggetto || '').localeCompare(b.oggetto || '', 'it', { sensitivity: 'base' })
      break
  }
  // A parità, la più recente prima: un secondo criterio stabile.
  if (d === 0) d = new Date(a.data).getTime() - new Date(b.data).getTime()
  return d * dir
}
