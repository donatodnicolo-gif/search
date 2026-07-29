/**
 * I dati che sono stati mandati a un'app, in chiaro. Erano già salvati su
 * `InvioApp.dati` ma non si vedevano da nessuna parte: e «contatto registrato»
 * non permette di controllare niente — quale azienda, con quale email, in
 * quale città. Con un'azione che parte da sola, poterlo rileggere è metà del
 * lavoro.
 *
 * Sta chiuso in un `<details>`: la riga importante resta l'esito.
 */
export function DatiInviati({ json }: { json: string }) {
  if (!json?.trim()) return null

  let dati: Record<string, unknown> | null = null
  try {
    const v = JSON.parse(json)
    if (v && typeof v === 'object' && !Array.isArray(v)) dati = v as Record<string, unknown>
  } catch {
    dati = null
  }

  // Non leggibile come oggetto: si mostra com'è, invece di nascondere tutto.
  if (!dati) {
    return (
      <details className="dati-inviati">
        <summary>Cosa è stato mandato</summary>
        <pre>{json}</pre>
      </details>
    )
  }

  const righe = Object.entries(dati).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (righe.length === 0) return null

  return (
    <details className="dati-inviati">
      <summary>Cosa è stato mandato ({righe.length} campi)</summary>
      <dl>
        {righe.map(([k, v]) => (
          <div key={k}>
            <dt>{ETICHETTE[k] ?? k}</dt>
            <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/** I nomi tecnici dei campi in italiano: il log lo legge una persona. */
const ETICHETTE: Record<string, string> = {
  nome: 'Azienda',
  partnerId: 'Agganciato alla scheda',
  partnerNome: 'Scheda scelta',
  categoria: 'Categoria',
  citta: 'Città',
  provincia: 'Provincia',
  indirizzo: 'Indirizzo',
  email: 'Email',
  telefono: 'Telefono',
  pIva: 'Partita IVA',
  referenteNome: 'Referente',
  referenteRuolo: 'Ruolo del referente',
  note: 'Note',
}
