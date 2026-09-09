"use server";

// **Modificare UNA sezione della scheda, dalla vista del prodotto.**
//
// Richiesta dell'utente (09/09/2026): «in visualizzazione del prodotto nei tab
// la matita apre solo l'input per modificare il tab». Prima la matitina portava
// al modulo intero: per correggere una riga di «Conservazione» si apriva una
// pagina con quaranta campi e si tornava indietro.
//
// ⚠️ **Si scrive una casella sola.** `sezioniScheda` tiene le sezioni di TUTTI
// i siti (`{ "Gifts": {…}, "Cake": {…} }`): questa azione rilegge il valore
// attuale e ne cambia una chiave, invece di riscrivere l'oggetto con quello che
// aveva la pagina quando è stata aperta. Se lo riscrivesse per intero, due
// persone su due tab del browser si cancellerebbero le modifiche a vicenda, e
// una scheda aperta da dieci minuti riporterebbe indietro tutto il resto.
//
// ⚠️ **Non tocca il negozio.** Il testo va nella nostra scheda; sul sito arriva
// al prossimo salvataggio del prodotto, come ogni altra sezione.

import { revalidatePath } from "next/cache";
import { prisma } from "./db";

export async function salvaSezioneProdottoAzione(fd: FormData) {
  const leggi = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const id = leggi("prodottoId").trim();
  const sito = leggi("sito").trim().slice(0, 80);
  const nome = leggi("sezione").trim().slice(0, 80);
  const valore = leggi("valore").trim().slice(0, 4000);
  if (!id || !sito || !nome) return;

  const p = await prisma.prodotto.findUnique({ where: { id }, select: { sezioniScheda: true } });
  if (!p) return;

  const scheda =
    p.sezioniScheda && typeof p.sezioniScheda === "object" && !Array.isArray(p.sezioniScheda)
      ? ({ ...(p.sezioniScheda as Record<string, Record<string, string>>) })
      : {};
  const suo = { ...(scheda[sito] ?? {}) };
  // Svuotare la casella toglie la sezione: lasciarla con la stringa vuota
  // vorrebbe dire un titolo senza niente sotto sulla scheda del cliente.
  if (valore) suo[nome] = valore;
  else delete suo[nome];
  scheda[sito] = suo;

  await prisma.prodotto.update({ where: { id }, data: { sezioniScheda: scheda } });
  revalidatePath(`/prodotti/${id}`);
}
