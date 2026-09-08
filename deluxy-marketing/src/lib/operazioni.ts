import { prisma } from "./db";
import { avvisoTipoNonDichiarato, dichiarazioniScript } from "./versione-script";

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
    tipo?: string;
    account?: string | null;
    canale?: string | null;
    campagnaId?: string | null;
    gruppoId?: string | null;
    avvisi?: string | null;
  };

  args = await conAvvisoNegativaLarga(args, d);

  if (d.account) return prisma.operazioneAdv.create(await conAvvisoScript(args, d.account));

  let brand: string | null = null;
  if (d.campagnaId) {
    brand = (await prisma.campagna.findUnique({ where: { id: d.campagnaId }, select: { brand: true } }))?.brand ?? null;
  } else if (d.gruppoId) {
    brand = (await prisma.gruppo.findUnique({ where: { id: d.gruppoId }, select: { brand: true } }))?.brand ?? null;
  }
  const account = d.canale ? await accountDiBrand(d.canale, brand) : null;

  return prisma.operazioneAdv.create(
    await conAvvisoScript({ ...args, data: { ...args.data, account } }, account)
  );
}

/**
 * L'avviso «questa esclusione vale per TUTTI i gruppi della campagna».
 *
 * ⚠️ **Perché esiste (08/09/2026).** Su Google Ads una parola esclusa può stare
 * a tre livelli — gruppo, campagna, lista condivisa d'account — e la scelta *è*
 * la decisione. L'app ne legge tre (`NegativaCampagna.livello`: a database ci
 * sono 59.851 negative di gruppo, tutte scritte da mani umane dentro Google
 * Ads) ma **ne sa scrivere uno solo**: lo script ha una sola primitiva,
 * `campagna.createNegativeKeyword()`. Quindi chi esclude una ricerca *stando
 * dentro la scheda di un gruppo* la spegne anche in tutti gli altri gruppi
 * della stessa campagna.
 *
 * Finché la campagna ha **un solo gruppo attivo** i due livelli coincidono e
 * non c'è niente da dire: misurato, **tutte e 56 le negative eseguite finora**
 * sono finite su campagne con esattamente un gruppo acceso, quindi il difetto
 * non è ancora costato niente. Con più gruppi accesi invece il danno è reale e
 * silenzioso — escludere «roses» dal gruppo English la spegne anche
 * nell'italiano, e il traffico che non arriva non lascia traccia.
 *
 * Perciò: **si avvisa, non si blocca**, e solo quando i gruppi accesi sono più
 * di uno. Sta qui, nel collo di bottiglia, e non nei sette punti che accodano
 * negative: una regola scritta in un posto solo è una regola che non si dimentica
 * al prossimo punto di accodamento.
 */
async function conAvvisoNegativaLarga(
  args: ArgomentiCreate,
  d: { tipo?: string; campagnaId?: string | null; avvisi?: string | null }
): Promise<ArgomentiCreate> {
  if (d.tipo !== "negativa" || !d.campagnaId) return args;
  const accesi = await prisma.gruppo.count({
    where: { campagnaId: d.campagnaId, statoPiattaforma: "ENABLED" },
  });
  if (accesi <= 1) return args;
  const avviso =
    `Questa campagna ha ${accesi} gruppi accesi e l'esclusione vale per TUTTI: ` +
    `Google tiene le parole escluse sulla campagna, non sul singolo gruppo. ` +
    `Se serviva spegnerla in un gruppo solo, va fatta a mano dentro Google Ads.`;
  return { ...args, data: { ...args.data, avvisi: d.avvisi ? `${d.avvisi} · ${avviso}` : avviso } };
}

/**
 * L'avviso «la copia dello script su quel conto non sa eseguire questo tipo»,
 * attaccato all'operazione appena nasce.
 *
 * ⚠️ Sta QUI e non nella rotta API per lo stesso motivo per cui ci sta
 * `account`: le operazioni nascono da undici punti diversi (le pagine, le
 * proposte dell'AI, l'API) e un controllo scritto in uno solo di quelli è un
 * controllo che dieci volte su undici non c'è. Questo è il collo di bottiglia.
 *
 * ⚠️ Avvisa, non blocca — come tutto il change control dal 04/08/2026. Una
 * copia può essere stata reincollata un minuto fa e non avere ancora fatto il
 * suo giro di «esegui»: rifiutare l'operazione punirebbe il caso normale.
 */
async function conAvvisoScript(args: ArgomentiCreate, account: string | null): Promise<ArgomentiCreate> {
  const d = args.data as { tipo?: string; canale?: string | null; avvisi?: string | null };
  if (!account || (d.canale ?? "google_ads") !== "google_ads" || !d.tipo) return args;
  const avviso = avvisoTipoNonDichiarato(d.tipo, account, (await dichiarazioniScript()).get(account.trim()));
  if (!avviso) return args;
  return {
    ...args,
    data: { ...args.data, avvisi: d.avvisi ? `${d.avvisi} · ${avviso}` : avviso },
  };
}
