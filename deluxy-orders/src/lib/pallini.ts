// Quale voce del menu deve accendere il pallino giallo.
// Libro UX&UI v1.4 §7 (sistema del Customer Service): la regola è la stessa
// di deluxy-messaging/src/lib/pallini.ts, portata qui tale e quale.
//
// ⚠️⚠️ Sta in un file SUO e senza `prisma`: la parte di menu che accende i
// pallini è un componente del browser, e importare la libreria delle query
// (che apre Prisma) si tirerebbe dietro il client del database in un bundle
// del browser — con un errore che parla di webpack e non nomina mai la causa.
//
// ⚠️⚠️ E sta fuori dal componente perché è la parte che si può sbagliare in
// silenzio: un pallino che non si accende mai non dà errore, e uno che resta
// acceso per sempre nemmeno. Le prove: scripts/prova-pallini.mts.

/** Cosa il browser si ricorda di aver già visto: sezione → data dell'ultima cosa vista. */
export type Visto = Record<string, string>;

export type EsitoPallini = {
  /** Le sezioni con qualcosa di nuovo. */
  accesi: string[];
  /** Il segnalibro aggiornato, da riscrivere nel browser. */
  visto: Visto;
};

/**
 * @param sezioni  sezione → data della cosa più recente CHE C'È (dal server)
 * @param visto    sezione → data dell'ultima cosa GIÀ VISTA (dal browser)
 * @param path     dove si trova adesso chi guarda
 * @param mai      `true` la primissima volta: non c'è nessun segnalibro
 *
 * ⚠️⚠️ NON SI CONFRONTANO OROLOGI, si confrontano due letture della stessa data.
 * Segnando «visto» con l'ora del browser, un computer avanti di un minuto
 * avrebbe il pallino sempre acceso e uno indietro non l'avrebbe mai.
 */
export function decidiPallini(
  sezioni: Record<string, { ultimo: string }>,
  visto: Visto,
  path: string,
  mai: boolean
): EsitoPallini {
  const accesi: string[] = [];
  const nuovo: Visto = { ...visto };
  for (const [href, s] of Object.entries(sezioni)) {
    const quando = s?.ultimo ?? "";
    // Sezione vuota: non c'è niente da segnalare e niente da ricordare.
    if (!quando) continue;
    // ⚠️⚠️ LA PRIMA VOLTA NON SI ACCENDE NIENTE. Senza questo, chi apre l'app da
    // un browser nuovo si troverebbe tutti i pallini accesi insieme: non
    // vorrebbero dire «è arrivato qualcosa», vorrebbero dire «non ti conosco» —
    // e un segnale che parte sbagliato non lo si guarda più.
    // ⚠️ Stando SU quella pagina la si sta guardando adesso: niente pallino, e
    // il segnalibro avanza mentre arriva roba.
    if (mai || suQuestaPagina(path, href)) {
      nuovo[href] = quando;
      continue;
    }
    // ⚠️⚠️ «PIÙ RECENTE», non «diverso». Con `!==` il pallino si accenderebbe
    // anche quando `ultimo` **torna indietro**: le sezioni filtrano le righe
    // risolte/archiviate, quindi risolvendo la cosa più recente la data
    // precedente diventa quella corrente — e il menu segnalerebbe come
    // «novità» qualcosa che è **sparito**.
    const gia = nuovo[href] ?? "";
    if (quando > gia) accesi.push(href);
  }
  return { accesi, visto: nuovo };
}

/**
 * ⚠️ La stessa regola con cui il menu decide quale voce è accesa: il prefisso
 * col taglio sulla barra. `/controllo` non deve contare come «ci sono sopra»
 * quando si è su `/controllo-incassi`, ma `/controllo/2026` sì, perché di lì si passa.
 */
export function suQuestaPagina(path: string, href: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}
