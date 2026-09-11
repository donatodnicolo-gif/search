import { prisma } from "./db";

// L'occasione letta DALLE PAROLE del biglietto (e della nota dell'ordine),
// senza AI: «buon compleanno» è un compleanno, «anniversario» è un
// anniversario, e così via. Richiesta dell'utente (11/09/2026): 9.500
// ricorrenze su 9.500 erano «da precisare» perché la lettura con l'AI va
// lanciata a mano, a 100 per volta, e nessuno l'aveva fatto.
//
// LE REGOLE, le stesse dell'AI (eventi-ai.ts):
//  · si accetta solo un tipo di TIPI_EVENTO;
//  · «auguri» da solo NON basta (può essere di tutto): serve la parola
//    dell'occasione;
//  · le condoglianze vincono su tutto (sbagliare lì è grave), poi la nascita
//    (che «auguri mamma» NON è: quella è la festa della mamma → ricorrenza);
//  · si salva la PROVA (il pezzo di testo) e il motivo, con tipoDa = "parole",
//    così chi legge la pagina sa da dove viene e l'AI non la rilegge;
//  · quello che ha scritto una persona (tipoDa = manuale) non si tocca.
//
// Italiano, inglese, spagnolo, francese: i tre negozi vendono a chi scrive in
// tutte e quattro le lingue.

export type EsitoParole = { tipo: string; prova: string; motivo: string };

type Regola = { tipo: string; motivo: string; parole: RegExp[] };

// In ordine di PRIORITÀ: la prima regola che combacia vince.
const REGOLE: Regola[] = [
  {
    tipo: "condoglianze",
    motivo: "Il testo parla di un lutto o di vicinanza nel dolore.",
    parole: [/condoglianz/i, /\bcordoglio\b/i, /\blutto\b/i, /riposi in pace/i, /\brip\b/i, /\bcondolenc/i, /\bp[eé]same\b/i, /nel dolore/i, /vicini nel/i, /in memoria di/i, /\bsympathy\b/i, /deepest condolences/i],
  },
  {
    tipo: "nascita",
    motivo: "Il testo parla di un bambino appena nato o di un battesimo.",
    parole: [/benvenut[oa] (al mondo|tra noi)/i, /\bnato\b|\bnata\b/i, /\bnascita\b/i, /\bnewborn\b/i, /\bbattesim/i, /\bbaptism\b/i, /baby shower/i, /new ?born/i, /welcome (to the world|baby)/i, /fiocco (rosa|azzurro|celeste)/i, /\bneonat/i],
  },
  {
    tipo: "matrimonio",
    motivo: "Il testo parla di nozze o di sposi.",
    parole: [/\bmatrimonio\b/i, /\bnozze\b/i, /\bspos[iae]\b/i, /\bwedding\b/i, /\bboda\b/i, /\bmariage\b/i, /viva gli sposi/i, /felicitazioni per (le nozze|il matrimonio)/i],
  },
  {
    tipo: "anniversario",
    motivo: "Il testo parla di un anniversario.",
    parole: [/\banniversar/i, /\banniversary\b/i, /\baniversario\b/i, /\banniversaire\b/i, /\banni insieme\b/i, /\byears together\b/i],
  },
  {
    tipo: "compleanno",
    motivo: "Il testo dice «buon compleanno» (o l'equivalente).",
    parole: [/\bcompleann/i, /\bcompleaños\b/i, /\bcumpleaños\b/i, /\bbirthday\b/i, /\bbday\b/i, /\banniversaire\b.*\bnaissance\b/i, /\bjoyeux anniversaire\b/i, /buon comple/i, /auguroni per i tuoi/i, /\bhappy birthday\b/i, /\b\d{2} anni\b/i, /\btanti auguri per i (tuoi|suoi) \d+/i],
  },
  {
    tipo: "laurea",
    motivo: "Il testo parla di laurea, diploma o di un traguardo raggiunto.",
    parole: [/\blaure[aoe]\b/i, /\bdottoress?a\b|\bdottore\b/i, /\bgraduation\b/i, /\bdiploma\b/i, /\bpromozion[ei]\b/i, /\bcongratulations on your/i, /\btraguardo\b/i, /\bnuovo lavoro\b/i, /\bpensione\b/i],
  },
  {
    tipo: "ricorrenza",
    motivo: "Il testo nomina una festa del calendario (mamma, papà, donna, San Valentino, Natale, Pasqua, onomastico…).",
    parole: [
      /festa della mamma/i, /auguri mamma/i, /\bmother'?s day\b/i, /d[ií]a de la madre/i, /f[êe]te des m[èe]res/i,
      /festa del pap[àa]/i, /auguri pap[àa]/i, /\bfather'?s day\b/i,
      /festa della donna/i, /\b8 marzo\b/i, /women'?s day/i,
      /san valentino/i, /\bvalentine/i, /\bvalent[ií]n\b/i,
      /buon natale/i, /\bnatale\b/i, /merry christmas/i, /\bchristmas\b/i, /feliz navidad/i, /joyeux no[eë]l/i,
      /buona pasqua/i, /\bpasqua\b/i, /happy easter/i,
      /buon anno/i, /happy new year/i, /\bcapodanno\b/i,
      /\bonomastico\b/i, /\bname day\b/i,
      /santa lucia/i, /\bbefana\b/i, /\bepifania\b/i,
      /buone feste/i, /happy holidays/i,
    ],
  },
  {
    tipo: "ringraziamento",
    motivo: "Il testo è un grazie.",
    parole: [/\bgrazie (di|per) (tutto|cuore)/i, /\bthank you\b/i, /\bthanks\b/i, /\bgracias\b/i, /\bmerci\b/i, /\bringrazi/i, /un grazie/i],
  },
];

// Il pezzo di testo che ha fatto decidere: la finestra attorno alla parola.
function prova(testo: string, re: RegExp): string {
  const m = re.exec(testo);
  if (!m) return testo.slice(0, 120);
  const inizio = Math.max(0, m.index - 40);
  return testo.slice(inizio, Math.min(testo.length, m.index + m[0].length + 60)).trim().slice(0, 120);
}

export function classificaDaParole(testo: string): EsitoParole | null {
  const t = (testo ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 4) return null;
  for (const r of REGOLE) {
    for (const re of r.parole) {
      if (re.test(t)) return { tipo: r.tipo, prova: prova(t, re), motivo: r.motivo };
    }
  }
  return null;
}

export type EsitoClassificazione = {
  esaminati: number;
  riconosciuti: number;
  senzaTesto: number;
  perTipo: Record<string, number>;
};

// Passa gli eventi «da precisare» non scritti a mano, legge i testi dei loro
// ordini (biglietto prima, nota Shopify poi) e classifica. `applica: false`
// conta soltanto (prova a secco).
export async function classificaEventiDaParole(opzioni: { applica: boolean; limite?: number }): Promise<EsitoClassificazione> {
  const esito: EsitoClassificazione = { esaminati: 0, riconosciuti: 0, senzaTesto: 0, perTipo: {} };
  const eventi = await prisma.eventoCliente.findMany({
    where: { tipo: "da-precisare", tipoDa: { not: "manuale" }, stato: { not: "ignorato" } },
    select: { id: true, ordini: true, titolo: true },
    take: opzioni.limite,
  });
  esito.esaminati = eventi.length;
  const numeri = [...new Set(eventi.flatMap((e) => e.ordini.split(" ").filter(Boolean)))];
  const perNumero = new Map<string, { biglietto: string | null; noteShopify: string | null }>();
  // A blocchi: 9.500 eventi portano ~15.000 numeri d'ordine.
  for (let i = 0; i < numeri.length; i += 2000) {
    const ordini = await prisma.ordine.findMany({
      where: { numero: { in: numeri.slice(i, i + 2000) } },
      select: { numero: true, biglietto: true, noteShopify: true },
    });
    for (const o of ordini) perNumero.set(o.numero, o);
  }

  for (const e of eventi) {
    const testi = e.ordini
      .split(" ")
      .filter(Boolean)
      .map((n) => perNumero.get(n))
      .flatMap((o) => (o ? [o.biglietto, o.noteShopify] : []))
      .filter((t): t is string => typeof t === "string" && t.trim().length > 3);
    if (testi.length === 0) {
      esito.senzaTesto++;
      continue;
    }
    const letto = classificaDaParole(testi.join(" / "));
    if (!letto) continue;
    esito.riconosciuti++;
    esito.perTipo[letto.tipo] = (esito.perTipo[letto.tipo] ?? 0) + 1;
    if (opzioni.applica) {
      await prisma.eventoCliente.update({
        where: { id: e.id },
        data: { tipo: letto.tipo, tipoDa: "parole", motivoTipo: letto.motivo, prova: letto.prova },
      });
    }
  }
  return esito;
}
