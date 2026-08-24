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
