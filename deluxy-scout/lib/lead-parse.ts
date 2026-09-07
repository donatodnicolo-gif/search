// Le richieste che arrivano dal MODULO DI CONTATTO dei siti Shopify sono mail
// di notifica: mittente robot («Business Deluxy (Shopify)») e dentro, in forma
// fissa, i dati veri del cliente — «Country Code: IT Name: … Email: … Phone: …
// Body: …». Mostrare la notifica com'è obbliga a leggere il gergo del robot per
// trovare la persona. Qui i campi si ESTRAGGONO per mostrarli: solo lettura,
// nel database resta il testo originale, che è la fonte.
export type LeadLeggibile = {
  /** Nome della persona che ha scritto, se il testo lo dichiara. */
  persona: string | null;
  email: string | null;
  telefono: string | null;
  /** Il messaggio del cliente (Body) se estratto, altrimenti il testo com'era. */
  testo: string;
  /** true = notifica del modulo di contatto (mittente robot, dati dentro). */
  daModuloSito: boolean;
};

export function analizzaMessaggioLead(nome: string, messaggio: string | null | undefined): LeadLeggibile {
  const t = (messaggio ?? '').trim();
  const mittenteRobot = /\(shopify\)/i.test(nome);
  // Il formato del modulo: intestazione «New customer message …» (o la sua
  // traduzione fatta da un vecchio import) oppure direttamente i campi fissi.
  const sembraModulo =
    /new customer message|nuovo messaggio cliente/i.test(t) || /(^|\s)Name:\s*\S[\s\S]*\bEmail:\s*\S+@/i.test(t);
  if (!t || !sembraModulo) {
    return { persona: null, email: null, telefono: null, testo: t, daModuloSito: mittenteRobot && sembraModulo };
  }
  const prendi = (re: RegExp) => t.match(re)?.[1]?.trim() || null;
  // I campi stanno su una riga sola separati da spazi: ogni estrazione si ferma
  // all'etichetta successiva, non a fine riga.
  const persona = prendi(/\bName:\s*([\s\S]*?)\s*(?=\bEmail:|\bPhone:|\bBody:|$)/i);
  const email = prendi(/\bEmail:\s*(\S+@[^\s,;]+)/i);
  const telefono = prendi(/\bPhone:\s*([+\d][\d\s().\-]{4,}?)\s*(?=\bBody:|$)/i);
  const corpo = prendi(/\bBody:\s*([\s\S]+)$/i);
  return { persona, email, telefono, testo: corpo ?? t, daModuloSito: true };
}

/**
 * ⭐ I RECAPITI DI UNA RICHIESTA, IN UN PUNTO SOLO (07/09/2026, migr. 0119).
 *
 * La stessa riga — «se `contatto` contiene @ allora è una mail, altrimenti è
 * un telefono» — era ricopiata in CINQUE punti (LeadCard, la tabella di /lead,
 * il foglio di lettura, QualificaLeadModal, `qualificaLead`). Cinque copie
 * della stessa regola sono cinque occasioni di farla divergere: qui ce n'è una.
 *
 * L'ordine dice anche quanto ci si può fidare:
 *  1. le colonne `email`/`telefono` — qualcuno le ha SCRITTE, valgono di più;
 *  2. quello che il parser estrae dal modulo del sito — è la fonte, letta;
 *  3. `contatto`, spacchettato a indovinare — il ripiego delle righe vecchie.
 */
export function recapitiLead(
  lead: { nome: string; messaggio?: string | null; contatto?: string | null; email?: string | null; telefono?: string | null },
  info?: LeadLeggibile,
): { email: string | null; telefono: string | null } {
  const i = info ?? analizzaMessaggioLead(lead.nome, lead.messaggio);
  const c = lead.contatto?.trim() || null;
  return {
    email: lead.email?.trim() || i.email || (c?.includes('@') ? c : null),
    telefono: lead.telefono?.trim() || i.telefono || (c && !c.includes('@') ? c : null),
  };
}

/**
 * Il numero come lo vuole un link `tel:`: via spazi, punti e parentesi, restano
 * cifre e il prefisso internazionale. Il telefono si CONTINUA a mostrare come
 * l'ha scritto chi l'ha scritto — è quello che si legge al telefono — ma il
 * link deve poterlo comporre.
 */
export function soloCifre(telefono: string): string {
  return telefono.replace(/[^+0-9]/g, '');
}
