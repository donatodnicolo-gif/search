// Le reazioni: il cuore o il pollice che un cliente attacca a un messaggio.
//
// ⚠️⚠️ **Una reazione non è un messaggio.** Su WhatsApp e su Instagram è un
// francobollo appiccicato a un messaggio che c'è già, e chi legge vuole vedere
// il cuore **sotto la frase a cui è stato messo**. Registrarla come riga a sé
// dava «[reaction]» in mezzo al filo, che non diceva né quale emoji né a che
// cosa: in tabella ne sono rimaste **19** così, con l'emoji persa per sempre —
// l'evento arrivava e quel campo non lo leggeva nessuno.
//
// ⚠️ **L'emoji vuota vuol dire «reazione tolta»**, non «evento da ignorare»:
// chi leva il cuore se lo deve veder sparire.

import { db } from './db'

/**
 * Attacca (o toglie) una reazione al messaggio a cui si riferisce.
 *
 * Torna `true` se il messaggio di riferimento è stato trovato. Se non c'è —
 * reazione a un messaggio più vecchio del nostro archivio, o mai salvato — chi
 * chiama registra una riga normale con l'emoji dentro: meglio un cuore senza
 * contesto che un cuore perso.
 *
 * ⚠️ Non tocca `ultimoMessaggioIl` della conversazione, ed è voluto: il filo si
 * riordina per quello, e rimettere in cima una chat perché qualcuno ha messo un
 * pollice vorrebbe dire scambiare un gesto di cortesia per lavoro da fare.
 */
export async function attaccaReazione(idMessaggio: string, emoji: string): Promise<boolean> {
  if (!idMessaggio) return false
  const riferito = await db.messaggio.findFirst({
    where: { idEsterno: idMessaggio },
    select: { id: true },
  })
  if (!riferito) return false
  await db.messaggio.update({ where: { id: riferito.id }, data: { reazione: emoji } })
  return true
}
