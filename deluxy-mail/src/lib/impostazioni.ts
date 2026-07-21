import { db } from './db'

// Il contesto aziendale è CONDIVISO fra tutti gli utenti: è la descrizione
// dell'azienda che l'AI legge per ogni analisi. Lo modifica un admin.
// La firma invece è personale ed è su Utente.

export const CHIAVI = {
  contestoAzienda: 'contesto_azienda',
  // Come Renè scrive e risponde alle mail: tono, saluti, chiusura, regole di
  // stile. Condiviso (referente unico della casella). Se vuoto vale il default.
  stileScrittura: 'stile_scrittura',
  // Come gestire i vari TIPI di richiesta (priorità, sezione, cosa fare): l'AI
  // la legge quando analizza una mail, così le prossime simili le tratta come
  // hai detto. Es. «Ordini: priorità P1, sezione Ordini, crea attività di
  // conferma. Solleciti pagamento: P0.»
  guidaGestione: 'guida_gestione',
} as const

// Lo stile predefinito, se l'utente non l'ha impostato: una mail educata e
// completa (saluto + corpo + chiusura + firma), non un telegramma.
export const STILE_DEFAULT = `- Apri SEMPRE con un saluto adatto al destinatario: "Gentile [nome]," se lo conosci, altrimenti "Buongiorno,".
- Corpo chiaro e cortese, che va al punto senza essere brusco.
- Chiudi SEMPRE con una formula di commiato ("Cordiali saluti," / "Un caro saluto,") seguita dalla firma.
- Tono professionale e caldo, mai freddo o telegrafico. Niente formule pompose ("con la presente"), ma la cortesia non si taglia.`

export async function leggiImpostazioni(): Promise<Record<string, string>> {
  const righe = await db.impostazione.findMany()
  return Object.fromEntries(righe.map((r) => [r.chiave, r.valore]))
}

export async function scriviImpostazione(chiave: string, valore: string): Promise<void> {
  await db.impostazione.upsert({
    where: { chiave },
    create: { chiave, valore },
    update: { valore },
  })
}
