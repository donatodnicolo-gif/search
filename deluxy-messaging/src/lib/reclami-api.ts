import { COLPA_TIPI, GRAVITA, STATI_RECLAMO } from './reclami'

// Come si racconta un reclamo ALLE ALTRE APP (11/09/2026). Sta in una lib e
// non dentro la rotta perché la usano due rotte (elenco e dettaglio) — e
// perché un `route.ts` di Next può esportare solo i verbi HTTP.

export type RigaReclamo = {
  id: string
  ordineId: string
  ordineNumero: string
  negozioNome: string
  clienteNome: string
  telefono: string
  email: string
  casistica: string
  colpaTipo: string
  colpaNome: string
  gravita: number
  descrizione: string
  prodotti: string
  azioni: string
  stato: string
  esito: string
  risoltoIl: Date | null
  creatoIl: Date
  aggiornatoIl: Date
}

/** La riga come la vedono le altre app, col link alla scheda vera. */
export function reclamoPubblico(r: RigaReclamo, domandeAperte: number) {
  return {
    id: r.id,
    ordineId: r.ordineId,
    ordineNumero: r.ordineNumero,
    negozioNome: r.negozioNome,
    clienteNome: r.clienteNome,
    telefono: r.telefono,
    email: r.email,
    casistica: r.casistica,
    colpaTipo: r.colpaTipo,
    colpaNome: r.colpaNome,
    gravita: r.gravita,
    descrizione: r.descrizione,
    // Prodotti e azioni sono scritti una per riga: si passano come elenchi,
    // così chi legge non deve indovinare il separatore.
    prodotti: r.prodotti ? r.prodotti.split('\n').filter(Boolean) : [],
    azioni: r.azioni ? r.azioni.split('\n').filter(Boolean) : [],
    stato: r.stato,
    esito: r.esito,
    domandeAperte,
    risoltoIl: r.risoltoIl?.toISOString() ?? null,
    creatoIl: r.creatoIl.toISOString(),
    aggiornatoIl: r.aggiornatoIl.toISOString(),
    /** Dove si lavora il reclamo: la sua scheda nel Customer Service. */
    link: `/reclami?apri=${r.id}`,
  }
}

/**
 * I vocabolari (stati, colpe, gravità) viaggiano con la risposta: chi legge
 * non se li riscrive, e se qui se ne aggiunge uno lo vede subito.
 */
export function etichetteReclami() {
  return {
    stati: STATI_RECLAMO.map((s) => ({ chiave: s.chiave, nome: s.nome, colore: s.colore })),
    colpe: COLPA_TIPI.map((c) => ({ chiave: c.chiave, nome: c.nome })),
    gravita: GRAVITA.map((g) => ({ livello: g.livello, nome: g.nome, colore: g.colore })),
  }
}

/** Le ultime 9 cifre di un telefono: +39 347 … e 0347 … sono lo stesso numero. */
export function codaTelefono(v: string): string {
  const cifre = v.replace(/\D/g, '')
  return cifre.length > 9 ? cifre.slice(-9) : cifre
}
