import { NextResponse } from 'next/server'
import { leggiQuotaFornitore } from '@/lib/orders'

export const dynamic = 'force-dynamic'

// Quanto è previsto che vada al fornitore, in percentuale sul venduto.
//
// ⚠️⚠️ La regola NON sta qui e non si ricopia: vive in **Deluxy Orders**
// (`controllo.quotaFornitore`) ed è lui l'unico a saperla. Un 60% scritto nel
// nostro codice resterebbe al vecchio valore il giorno che la cambiano là, e
// nessuna delle due schermate darebbe errore — direbbero solo due numeri
// diversi sulla stessa cosa.
//
// ⚠️ Se Orders non risponde si torna `quota: null`, e chi chiama **non dà
// nessun verdetto**: mostra i numeri e dice che la regola non è raggiungibile.
// Meglio nessun giudizio che un giudizio inventato accanto a una cifra che sta
// per partire verso una banca.
export async function GET() {
  const q = await leggiQuotaFornitore()
  return NextResponse.json({
    quota: q?.quota ?? null,
    dove: q?.dove ?? '',
  })
}
