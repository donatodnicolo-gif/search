import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from './db'

// Autenticazione delle API di lettura del Customer Service: chiave nell'header
// "x-api-key" (in alternativa "Authorization: Bearer …"). Stesso schema di
// deluxy-orders e deluxy-anagrafiche (standard Deluxy §4.3): nel database c'è
// solo lo SHA-256 della chiave. Si creano con `npm run chiave -- <nome-app>`.
//
// Sono API di SOLA LETTURA: chi legge i reclami non li può creare né chiudere.
// Reclami e feedback si aprono solo da qui dentro, dove c'è la persona che ha
// parlato col cliente.

export type ClientApi = { id: string; nome: string }

export function erroreApi(status: number, messaggio: string) {
  return NextResponse.json({ errore: messaggio }, { status })
}

function estraiChiave(req: NextRequest): string | null {
  const diretta = req.headers.get('x-api-key')
  if (diretta) return diretta.trim()
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return null
}

export async function autentica(req: NextRequest): Promise<ClientApi | NextResponse> {
  const chiave = estraiChiave(req)
  if (!chiave) {
    return erroreApi(401, 'Chiave API mancante: header x-api-key o Authorization: Bearer')
  }
  const hash = createHash('sha256').update(chiave).digest('hex')
  const record = await db.apiKey.findUnique({ where: { hash } })
  if (!record || !record.attiva) return erroreApi(401, 'Chiave API non valida')

  // Traccia l'ultimo uso senza bloccare la risposta
  db.apiKey.update({ where: { id: record.id }, data: { ultimoUso: new Date() } }).catch(() => {})
  return { id: record.id, nome: record.nome }
}
