import { db } from './db'

export const CHIAVI = {
  contestoAzienda: 'contesto_azienda',
  firma: 'firma',
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
