import { prisma } from "@/lib/db";

// Le campagne che l'app ha «lanciato» e che Google non ha mai confermato.
//
// ⚠️ PERCHÉ SERVE: `creaCampagna` nello script chiama `upload.apply()` e basta.
// Il bulk upload di Google Ads **non restituisce niente** e viene lavorato in
// modo asincrono: se una riga è sbagliata l'errore finisce nel registro dei
// caricamenti dentro Google Ads e **non torna mai indietro**. Lo script quindi
// riferisce onestamente «bulk upload INVIATO» — ma l'app registra l'operazione
// come «eseguita», e chi legge capisce «campagna creata».
//
// È la stessa famiglia di `createNegativeKeyword()`, corretta l'08/08 con
// `negativaPresente()` che rilegge prima e dopo: lì il dubbio si dichiara. Qui
// non era mai stato fatto, e il risultato è una campagna che nell'app esiste e
// su Google no, senza che niente lo dica.
//
// La prova che l'app ha già in mano: il giro `anagrafica` manda TUTTE le
// campagne dell'account, comprese quelle in pausa. Se dopo il lancio sono
// arrivate una o più anagrafiche e la campagna non ha ancora né `idEsterno` né
// `statoPiattaforma`, allora Google non ce l'ha. Non serve chiedere niente in
// più, e non serve reincollare lo script.

export type CampagnaNonConfermata = {
  id: string;
  /** L'operazione che l'ha lanciata: serve per rimetterla in coda. */
  operazioneId: string;
  nome: string;
  brand: string;
  account: string | null;
  lanciataIl: Date;
  /** Quante consegne di anagrafica sono arrivate DOPO il lancio, su quell'account. */
  anagraficheDopo: number;
  ultimaAnagrafica: Date | null;
  esitoDichiarato: string | null;
};

export async function campagneNonConfermate(): Promise<CampagnaNonConfermata[]> {
  const lanci = await prisma.operazioneAdv.findMany({
    where: { tipo: "nuova_campagna", stato: "eseguita", campagnaId: { not: null } },
    orderBy: { eseguitaIl: "desc" },
    take: 30,
    select: { id: true, campagnaId: true, account: true, eseguitaIl: true, esito: true, creataIl: true },
  });
  if (lanci.length === 0) return [];

  const campagne = await prisma.campagna.findMany({
    where: { id: { in: lanci.map((l) => l.campagnaId!) } },
    select: { id: true, nome: true, brand: true, idEsterno: true, statoPiattaforma: true },
  });
  const perId = new Map(campagne.map((c) => [c.id, c]));

  // I lanci ancora senza conferma. Si filtra PRIMA di leggere le anagrafiche:
  // quasi sempre la lista è vuota e non serve nessuna seconda query.
  const sospesi = lanci.filter((l) => {
    const c = perId.get(l.campagnaId!);
    // Google l'ha mandata almeno una volta: è nata davvero, niente da dire.
    return c && !c.idEsterno && !c.statoPiattaforma;
  });
  if (sospesi.length === 0) return [];

  // ⚠️ UNA query per tutti, non una per riga. Con `take: 30` sarebbero fino a
  // 30 andate e ritorno per disegnare un avviso — ed è il difetto che su questo
  // Postgres (connection_limit 5) satura il pool e fa cadere l'intera pagina,
  // non solo l'avviso.
  const conti = [...new Set(sospesi.map((l) => l.account).filter((a): a is string => Boolean(a)))];
  const daPiuVecchio = sospesi.reduce<Date | null>((min, l) => {
    const d = l.eseguitaIl ?? l.creataIl;
    return !min || d < min ? d : min;
  }, null);
  const anagraficheTutte =
    conti.length > 0 && daPiuVecchio
      ? await prisma.ricezioneDati.findMany({
          where: {
            fonte: "google_ads",
            account: { in: conti },
            tipo: "anagrafica",
            ricevutoIl: { gt: daPiuVecchio },
          },
          select: { account: true, ricevutoIl: true },
        })
      : [];

  const fuori: CampagnaNonConfermata[] = [];
  for (const l of sospesi) {
    const c = perId.get(l.campagnaId!)!;
    const da = l.eseguitaIl ?? l.creataIl;
    // ⚠️ Solo le anagrafiche dell'ACCOUNT giusto e successive a QUESTO lancio:
    // un giro su Cake non dice niente su una campagna lanciata su Flowers.
    // Senza account non si può concludere, e allora non si conclude.
    const anagrafiche = l.account
      ? anagraficheTutte.filter((a) => a.account === l.account && a.ricevutoIl > da)
      : [];

    fuori.push({
      id: c.id,
      operazioneId: l.id,
      nome: c.nome,
      brand: c.brand,
      account: l.account,
      lanciataIl: da,
      anagraficheDopo: anagrafiche.length,
      ultimaAnagrafica: anagrafiche.length
        ? anagrafiche.reduce((max, a) => (a.ricevutoIl > max ? a.ricevutoIl : max), anagrafiche[0].ricevutoIl)
        : null,
      esitoDichiarato: l.esito ?? null,
    });
  }
  return fuori;
}

/**
 * Come si legge il caso. Con ZERO anagrafiche dopo il lancio non si può ancora
 * dire niente — il bulk upload è asincrono e va dato il tempo di un giro. Con
 * una o più, Google ha censito l'account e quella campagna non c'era.
 */
export function letturaNonConfermata(c: CampagnaNonConfermata): { grave: boolean; frase: string } {
  if (!c.account) {
    return {
      grave: false,
      frase:
        "L'operazione non porta l'account, quindi non so su quale conto cercarla: non posso dire se è nata o no.",
    };
  }
  if (c.anagraficheDopo === 0) {
    return {
      grave: false,
      frase:
        "Il caricamento è asincrono: Google non ha ancora rimandato l'elenco delle campagne di questo account. Si saprà al prossimo giro dello script.",
    };
  }
  return {
    grave: true,
    frase:
      `Dopo il lancio l'account ha rimandato l'elenco completo delle sue campagne ${c.anagraficheDopo} volt${c.anagraficheDopo === 1 ? "a" : "e"}` +
      " e questa non c'era: **il caricamento è stato rifiutato da Google**." +
      " Il motivo esatto sta solo nel registro dei caricamenti dentro Google Ads" +
      " (Strumenti e impostazioni → Azioni collettive → Caricamenti): il bulk upload non lo rimanda all'app.",
  };
}
