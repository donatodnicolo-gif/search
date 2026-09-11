// **Tradurre una scheda senza smontarla.**
//
// ⚠️⚠️ 11/09/2026 — segnalazione dell'utente, con la schermata: su
// cakedesign.me la versione inglese di una torta è **un paragrafo unico**,
// mentre l'italiana ha le sue tab. La causa non era il modello: era che alla
// traduzione si mandava il **testo semplice** (`prodotto.descrizione`, o
// l'HTML con i tag tolti a forza di `replace`), e quello che tornava — testo
// semplice — finiva in `body_html` con gli a capo trasformati in `<br>`. Il
// tema costruisce **una tab per ogni `<h6>`** (vedi `descrizione-shopify.ts`):
// senza titoli, nessuna tab.
//
// Misura del danno prima di scrivere una riga
// (`scripts/conta-traduzioni-mancanti.ts`, 11/09/2026): sui quattro negozi
// **307 schede attive** hanno la descrizione inglese piatta mentre l'italiana
// ha i titoli — 150 su Business Deluxy, 109 su Gifts, 47 su Cake, 1 su Flowers.
// Non è un caso limite: è metà catalogo di un negozio.
//
// Qui si fa l'unica cosa che non può sbagliare la struttura: **i tag non si
// traducono affatto**. L'HTML si taglia in due elenchi — i pezzi di testo e
// tutto il resto — si manda al modello solo il testo, e si rimette dentro
// pezzo per pezzo. Il modello non vede un tag, quindi non può perderlo,
// spostarlo o inventarne uno; e se torna un numero di pezzi diverso da quello
// mandato lo si scopre subito, invece di scriverlo sul negozio.

/** Da entità HTML a testo leggibile: è quello che si manda al traduttore. */
function leggibile(t: string): string {
  return t
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** E ritorno: le stesse tre sostituzioni che fa `descrizione-shopify.ts`. */
function riscritto(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SchedaSpezzata = {
  /** Solo i pezzi di testo, nell'ordine in cui stanno nella pagina. */
  pezzi: string[];
  /** Rimette i pezzi tradotti al loro posto, coi tag intatti. */
  rimetti: (tradotti: string[]) => string;
};

/**
 * Spezza l'HTML nei suoi pezzi di testo. Gli spazi attorno a ogni pezzo
 * restano dov'erano: un `<b>Consegna</b>: in giornata` tradotto non deve
 * perdere lo spazio dopo i due punti.
 */
export function spezzaPerTraduzione(html: string): SchedaSpezzata {
  const parti = (html ?? "").split(/(<[^>]*>)/);
  const pezzi: string[] = [];
  // Per ogni pezzo: dov'è nell'elenco `parti`, e gli spazi ai due lati.
  const posti: { indice: number; prima: string; dopo: string }[] = [];

  parti.forEach((p, i) => {
    if (p.startsWith("<") || !p.trim()) return;
    const prima = p.slice(0, p.length - p.trimStart().length);
    const dopo = p.slice(p.trimEnd().length);
    pezzi.push(leggibile(p.trim()));
    posti.push({ indice: i, prima, dopo });
  });

  return {
    pezzi,
    rimetti(tradotti: string[]) {
      const fuori = [...parti];
      posti.forEach((posto, k) => {
        const t = (tradotti[k] ?? "").trim();
        // Un pezzo che torna vuoto si lascia com'era: meglio una riga in
        // italiano che un buco nella scheda del cliente.
        if (!t) return;
        fuori[posto.indice] = posto.prima + riscritto(t) + posto.dopo;
      });
      return fuori.join("");
    },
  };
}

/** Ha dei titoli, cioè il tema ci costruisce le tab? */
export function haTitoliDiSezione(html: string | null | undefined): boolean {
  return /<h[1-6][^>]*>/i.test(html ?? "");
}
