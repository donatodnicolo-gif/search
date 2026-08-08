import { prisma } from "./db";

// Su quale account va eseguita un'operazione in coda.
//
// ⚠️ **Perché esiste questo file.** Il campo `OperazioneAdv.account` c'era da
// sempre e non lo riempiva nessuno: misurato l'08/08/2026, **32 operazioni su
// 32 avevano `account` vuoto**. Con l'account vuoto lo script di *ogni* account
// guarda l'operazione, non trova il bersaglio in casa propria e la conta fra le
// **saltate** — non fra le fallite. Le saltate non riferiscono niente all'app,
// quindi l'operazione resta `approvata` **per sempre** e il motivo esiste solo
// nel log dentro Google Ads, dove nessuno guarda.
//
// Caso reale: `attiva_keyword` su «flowers delivery milan» (campagna
// `[Deluxy] - Fiori Milano ENG`, account Gifts), approvata il 07/08 alle 02:51
// e ancora ferma il giorno dopo, mentre nello stesso giro altre cinque
// operazioni dello stesso account partivano regolarmente.
//
// Con l'account scritto, la stessa macchina che c'è già cambia comportamento in
// due punti di `eseguiOperazioni` (in `scripts/google-ads-script.js`):
//   1. gli account estranei la scartano **subito**, senza nemmeno cercare;
//   2. sull'account giusto un bersaglio non trovato smette di essere una
//      «saltata» e diventa un **errore che torna indietro** con la sua causa
//      (`if (op.account)` → `fallite++` → `riferisci(...)`).
// Cioè: non ripara la ricerca, ma toglie il silenzio — che era il difetto vero.

/**
 * L'id dell'account pubblicitario di un brand su un canale, come lo conosce il
 * registro `AccountAdv` (`248-656-1148`, `2802316249885506`…).
 *
 * `null` quando non si sa, e in quel caso è giusto lasciarlo vuoto: un brand
 * `cross` vuol dire «non lo so», e scrivere un account a caso manderebbe
 * l'operazione a farsi eseguire nel posto sbagliato — molto peggio del silenzio.
 */
export async function accountDiBrand(canale: string, brand: string | null | undefined): Promise<string | null> {
  if (!brand || brand === "cross") return null;
  const acc = await prisma.accountAdv.findFirst({
    where: { piattaforma: canale, brand, attivo: true },
    select: { idEsterno: true },
  });
  return acc?.idEsterno?.trim() || null;
}

type ArgomentiCreate = Parameters<typeof prisma.operazioneAdv.create>[0];

/**
 * Mette un'operazione in coda riempiendo l'account quando si può ricavare.
 *
 * ⚠️ **Passare sempre da qui**, non da `prisma.operazioneAdv.create`: è il
 * punto unico in cui l'account si scrive, ed era proprio l'assenza di un punto
 * unico a lasciarlo vuoto in tutti e undici i posti che creano operazioni.
 * Prende gli stessi argomenti di `create`, così sostituirla è uno scambio di
 * nome e non una riscrittura di dieci chiamate — dove si sbaglia.
 *
 * Il brand si ricava dalla campagna o dal gruppo indicati. Un `account` già
 * scritto da chi chiama non viene mai toccato: chi lo sa, lo sa meglio.
 */
export async function accodaOperazione(args: ArgomentiCreate) {
  const d = args.data as {
    account?: string | null;
    canale?: string | null;
    campagnaId?: string | null;
    gruppoId?: string | null;
  };

  if (d.account) return prisma.operazioneAdv.create(args);

  let brand: string | null = null;
  if (d.campagnaId) {
    brand = (await prisma.campagna.findUnique({ where: { id: d.campagnaId }, select: { brand: true } }))?.brand ?? null;
  } else if (d.gruppoId) {
    brand = (await prisma.gruppo.findUnique({ where: { id: d.gruppoId }, select: { brand: true } }))?.brand ?? null;
  }
  const account = d.canale ? await accountDiBrand(d.canale, brand) : null;

  return prisma.operazioneAdv.create({ ...args, data: { ...args.data, account } });
}
