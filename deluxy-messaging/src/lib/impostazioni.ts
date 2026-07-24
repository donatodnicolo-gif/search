import { db } from './db'
import { cifra, decifra } from './crypto'

// Configurazione dei canali, salvata in tabella Impostazione.
// I token (chiavi che finiscono in "Token" tranne il verify token) sono cifrati.

// Chiavi usate:
// - metaVerifyToken   : il verify token del webhook Meta (lo scegli tu, in chiaro)
// - metaAppSecret     : App Secret dell'app Meta, per verificare la firma dei webhook (cifrato)
// - waToken           : token permanente WhatsApp Cloud API (cifrato)
// - waPhoneNumberId   : Phone Number ID del numero WhatsApp Business
// - fbPageToken       : Page Access Token per Messenger (cifrato)
// - igToken           : Page Access Token con permessi Instagram (cifrato)
// - widgetTitolo      : titolo mostrato nel widget di chat
// - widgetMessaggio   : messaggio di benvenuto del widget

const CHIAVI_CIFRATE = new Set(['metaAppSecret', 'waToken', 'fbPageToken', 'igToken'])

export async function leggiImpostazione(chiave: string): Promise<string> {
  const riga = await db.impostazione.findUnique({ where: { chiave } })
  if (!riga || !riga.valore) return ''
  if (CHIAVI_CIFRATE.has(chiave)) {
    try {
      return decifra(riga.valore)
    } catch {
      return '' // APP_SECRET cambiato: il token va reinserito
    }
  }
  return riga.valore
}

export async function salvaImpostazione(chiave: string, valore: string): Promise<void> {
  const daSalvare = valore && CHIAVI_CIFRATE.has(chiave) ? cifra(valore) : valore
  await db.impostazione.upsert({
    where: { chiave },
    update: { valore: daSalvare },
    create: { chiave, valore: daSalvare },
  })
}

/** Legge più impostazioni in un colpo solo (i token tornano decifrati). */
export async function leggiImpostazioni(chiavi: string[]): Promise<Record<string, string>> {
  const righe = await db.impostazione.findMany({ where: { chiave: { in: chiavi } } })
  const mappa: Record<string, string> = {}
  for (const c of chiavi) mappa[c] = ''
  for (const r of righe) {
    if (!r.valore) continue
    if (CHIAVI_CIFRATE.has(r.chiave)) {
      try {
        mappa[r.chiave] = decifra(r.valore)
      } catch {
        mappa[r.chiave] = ''
      }
    } else {
      mappa[r.chiave] = r.valore
    }
  }
  return mappa
}
