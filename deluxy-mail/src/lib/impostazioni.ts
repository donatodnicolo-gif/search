import { db } from './db'

// Il contesto aziendale è CONDIVISO fra tutti gli utenti: è la descrizione
// dell'azienda che l'AI legge per ogni analisi. Lo modifica un admin.
// La firma invece è personale ed è su Utente.

export const CHIAVI = {
  contestoAzienda: 'contesto_azienda',
} as const

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
