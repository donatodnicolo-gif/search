// **La bozza SEO scritta da una regola, non dall'AI.**
//
// Richiesta dell'utente (09/09/2026): «porta la SEO ad essere autocompilata con
// delle regole anche in sede di creazione del prodotto».
//
// ⚠️ **La regola è stata misurata sui 561 titoli SEO veri**, non inventata:
//   · il titolo non è MAI il nome puro (0 su 561) e solo 164 lo contengono;
//   · la forma riconoscibile più diffusa è «… | DELUXY» (93 titoli), e 257
//     nominano Deluxy in qualche modo;
//   · **110 titoli su 561 superano i 60 caratteri**, cioè Google li taglia a
//     metà nei risultati: è un difetto del pregresso, non un modello da imitare;
//   · le descrizioni: mediana 138 caratteri, **77 sopra i 160** (di nuovo
//     tagliate), e **207 su 307 promettono i guanti bianchi**.
//
// Da qui le due regole:
//   titolo      = «<nome> | DELUXY», accorciato per stare in 60 caratteri
//   descrizione = la prima parte del testo del prodotto + la promessa di
//                 consegna, dentro i 160 caratteri
//
// ⚠️ **È una bozza, non una pubblicazione.** Riempie solo quello che è vuoto e
// resta modificabile: il testo che i clienti leggono su Google non cambia
// finché qualcuno non lo manda al negozio.

/** Quanto Google mostra prima di tagliare. */
export const MAX_TITOLO = 60;
export const MAX_DESCRIZIONE = 160;

const FIRMA = " | DELUXY";
/** La promessa che 207 descrizioni su 307 fanno già. */
const CONSEGNA = "Consegna in guanti bianchi.";

/** Taglia su una parola intera, non a metà: «Bouquet Rose Ros…» non si legge. */
function accorcia(testo: string, max: number): string {
  const t = testo.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const tagliato = t.slice(0, max);
  const spazio = tagliato.lastIndexOf(" ");
  return (spazio > max * 0.6 ? tagliato.slice(0, spazio) : tagliato).trim();
}

/** Le prime frasi intere che stanno nel limite. */
function primeFrasi(testo: string, max: number): string {
  const pulito = testo.replace(/\s+/g, " ").trim();
  if (!pulito) return "";
  if (pulito.length <= max) return pulito;
  // Si chiude su un punto: una descrizione troncata a metà frase sembra un
  // errore, e nei risultati di ricerca è la prima cosa che si legge.
  const frasi = pulito.split(/(?<=[.!?])\s+/);
  let fuori = "";
  for (const f of frasi) {
    if ((fuori ? `${fuori} ${f}` : f).length > max) break;
    fuori = fuori ? `${fuori} ${f}` : f;
  }
  return fuori || accorcia(pulito, max);
}

/**
 * Toglie dalla testa i «tre punti» appiattiti, quando ci sono.
 *
 * ⚠️ Serve perché **579 schede su 3.659 hanno ancora il campo descrizione
 * sporco** (punto aperto del 09/09): là dentro la pagina è tutta concatenata, e
 * la prima frase non è la descrizione ma «Fiori : peonie rosa e bianche Inclusi
 * : biglietto scritto a mano…». Presa così finiva su Google, con «Consegna»
 * scritto due volte. Finché quel campo non è ripulito, la regola SEO non deve
 * propagarne il difetto.
 *
 * Il riconoscimento è la firma dei punti: «Etichetta **spazio** due punti
 * **spazio** valore», che la prosa normale non usa. Si tolgono al massimo tre
 * segmenti e solo se dopo resta abbastanza testo: meglio una descrizione
 * imperfetta che una amputata.
 */
function senzaPuntiInTesta(testo: string): string {
  const t = testo.replace(/\s+/g, " ").trim();
  let resto = t;
  for (let i = 0; i < 3; i++) {
    const m = resto.match(/^[^.!?:]{2,40} : [^.!?:]{2,90}?(?=\s+[A-ZÀ-Ú][^.!?:]{2,40} : |\s+[A-ZÀ-Ú])/);
    if (!m) break;
    const dopo = resto.slice(m[0].length).trim();
    if (dopo.length < 40) break;
    resto = dopo;
  }
  return resto.length >= 40 ? resto : t;
}

export type DatiSeo = {
  nome: string;
  descrizione?: string | null;
  /** Il primo dei tre punti: spesso è la frase che descrive meglio il prodotto. */
  plusProdotto?: string | null;
  /**
   * I nomi delle sezioni che questo prodotto ha. **Non si indovinano**: sul
   * campo sporco il testo prosegue con «Dettagli Prodotto Le corolle…», e un
   * titolo di sezione in testa alla descrizione di Google si legge come un
   * errore. Sapendo come si chiamano, si toglie quello giusto invece di
   * tirare a indovinare quali parole in maiuscolo siano un titolo.
   */
  sezioni?: string[];
};

const senzaAccenti = (x: string) =>
  x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Toglie dalla testa il nome di una sezione, se il testo comincia con quello. */
function senzaTitoloSezione(testo: string, sezioni: string[]): string {
  let resto = testo;
  for (let giro = 0; giro < 3; giro++) {
    const trovata = sezioni.find((n) => n.trim() && senzaAccenti(resto).startsWith(senzaAccenti(n)));
    if (!trovata) break;
    const dopo = resto.slice(trovata.trim().length).replace(/^[\s:–—-]+/, "").trim();
    if (dopo.length < 40) break;
    resto = dopo;
  }
  return resto;
}

/**
 * La bozza. Torna stringhe vuote quando non c'è materiale: **non si inventa**
 * un testo per riempire una casella — una descrizione SEO scritta a caso è
 * peggio di una assente, perché è quella che finisce su Google.
 */
export function seoDaRegole(d: DatiSeo): { titolo: string; descrizione: string } {
  const nome = (d.nome ?? "").replace(/\s+/g, " ").trim();
  if (!nome) return { titolo: "", descrizione: "" };

  // Il nome si accorcia quanto basta perché la firma ci stia dentro.
  const titolo = `${accorcia(nome, MAX_TITOLO - FIRMA.length)}${FIRMA}`;

  // Per la descrizione: prima il testo del prodotto; se manca, il plus, che è
  // comunque una frase scritta da una persona su QUESTO prodotto.
  const fonte = (d.descrizione ?? "").trim() || (d.plusProdotto ?? "").trim();
  if (!fonte) return { titolo, descrizione: "" };

  const pulita = senzaTitoloSezione(senzaPuntiInTesta(fonte), d.sezioni ?? []);
  // Se la consegna è già promessa nel testo, non la si ripete: «…in guanti
  // bianchi, a casa o dove vuoi tu. Consegna in guanti bianchi.» era il
  // risultato della prima stesura, ed è la firma di una regola che non guarda
  // quello che ha già in mano.
  const giaDetta = /guanti bianchi|consegn/i.test(pulita);
  const coda = giaDetta ? "" : ` ${CONSEGNA}`;
  const corpo = primeFrasi(pulita, MAX_DESCRIZIONE - coda.length);
  const descrizione = corpo
    ? `${corpo}${/[.!?]$/.test(corpo) || !coda ? "" : "."}${coda}`.trim()
    : primeFrasi(pulita, MAX_DESCRIZIONE);

  return { titolo, descrizione: accorcia(descrizione, MAX_DESCRIZIONE) };
}
