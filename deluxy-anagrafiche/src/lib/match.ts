import type { Partner, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { whereRicerca, whereRicercaNome, paroleSignificative, eFormaGiuridica } from "./ricerca";

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ⚠️⚠️ UN SOLO RISULTATO NON È UN'IDENTITÀ.
//
// `whereRicerca` è una ricerca «a parole»: ogni parola deve comparire in almeno
// un campo — compresi i CONTATTI collegati. È giusta per una persona che guarda
// l'elenco e sceglie; non per affermare che due nomi sono la stessa azienda.
//
// Il caso vero, 25/08/2026: il Customer Service ha chiesto «Paradis des
// fleurs». L'unico risultato è stato «Contatti senza azienda (HubSpot)» — un
// contenitore con 288 contatti dentro, in cui «paradis» compariva in uno, «des»
// in sei e «fleurs» in un altro. Un solo risultato → «agganciata» → e quel
// contenitore si è preso un `statoFornitore: abituale` che non gli appartiene.
//
// Quindi il risultato unico viene promosso ad «agganciata» solo se **si chiama
// davvero così**; altrimenti torna come CANDIDATO, e sceglie una persona.
const attaccato = (s: string) => norm(s).replace(/ /g, "");

function affiniAParole(ta: string[], tb: string[]): boolean {
  if (!ta.length || !tb.length) return false;
  const a = ta.join(" ");
  const b = tb.join(" ");
  if (a === b) return true;
  // Stesso nome con punteggiatura diversa: «S.R.L.S.» contro «srls».
  if (attaccato(a) === attaccato(b)) return true;
  const corto = ta.length <= tb.length ? ta : tb;
  const lungo = corto === ta ? tb : ta;
  // ⚠️ Il nome corto deve avere sostanza: due parole e sei caratteri. Senza,
  // un'anagrafica generica («Fiori») si aggancerebbe a mezzo registro.
  if (corto.length < 2 || corto.join("").length < 6) return false;
  return ` ${lungo.join(" ")} `.includes(` ${corto.join(" ")} `);
}

const formeDi = (parole: string[]) => parole.filter(eFormaGiuridica).sort().join(" ");

export function nomeAffine(cercato: string, trovato: string): boolean {
  const ta = norm(cercato).split(" ").filter(Boolean);
  const tb = norm(trovato).split(" ").filter(Boolean);
  if (affiniAParole(ta, tb)) return true;

  // ⚠️ Secondo giro SENZA le forme giuridiche: «Ketty Flowers srl» è la stessa
  // azienda di «Ketty Flowers · PORTO CERVO», e «srl» non lo cambia.
  //
  // ⚠️⚠️ Ma solo se le forme NON si contraddicono: «Rossi Fiori SRL» e «Rossi
  // Fiori SAS» sono due soggetti giuridici diversi e non si agganciano mai da
  // soli. La forma si ignora quando c'è da una parte sola, mai quando le due
  // parti ne dichiarano una diversa.
  const fa = formeDi(ta);
  const fb = formeDi(tb);
  if (!fa && !fb) return false;
  if (fa && fb && fa !== fb) return false;
  const sa = ta.filter((p) => !eFormaGiuridica(p));
  const sb = tb.filter((p) => !eFormaGiuridica(p));
  // ⚠️ Togliendo una parola il nome si accorcia, e la sostanza va richiesta di
  // nuovo: «Fiori srl» e «Fiori» diventano identici, ma «Fiori» non identifica
  // nessuno. Sei caratteri, la stessa soglia di affiniAParole().
  if (sa.join("").length < 6 || sb.join("").length < 6) return false;
  return affiniAParole(sa, sb);
}

export type TipoMatch = "piva" | "codice_fiscale" | "nome_citta" | "nome" | "vuota";
export type EsitoMatch = "agganciata" | "candidati" | "nessuna";
export type Confidenza = "alta" | "media" | "nessuna";

export type RisultatoMatch = {
  tipo: TipoMatch;
  esito: EsitoMatch;
  confidenza: Confidenza;
  match: Partner | null;
  candidati: Partner[];
};

// Risoluzione dell'identità per il "primo contatto senza id", in ordine di
// certezza: P.IVA → codice fiscale → nome+città. È il gemello in lettura della
// cascata di scrittura del POST. Ogni criterio che NON aggancia ricade sul
// successivo (così una P.IVA che non è nel registro non chiude la ricerca:
// si prova comunque per nome).
export async function risolviMatch(input: {
  pIva?: string | null;
  codiceFiscale?: string | null;
  nome?: string | null;
  citta?: string | null;
}): Promise<RisultatoMatch> {
  const pIva = input.pIva?.trim();
  const cf = input.codiceFiscale?.trim();
  const nome = input.nome?.trim();
  const citta = input.citta?.trim();

  // P.IVA — identità forte: se aggancia, si chiude qui.
  if (pIva) {
    const match = await prisma.partner.findFirst({ where: { pIva, attivo: true } });
    if (match) return { tipo: "piva", esito: "agganciata", confidenza: "alta", match, candidati: [] };
  }
  // Codice fiscale — identità forte.
  if (cf) {
    const match = await prisma.partner.findFirst({ where: { codiceFiscale: cf, attivo: true } });
    if (match) return { tipo: "codice_fiscale", esito: "agganciata", confidenza: "alta", match, candidati: [] };
  }
  // Nome (+ città) — ricade qui se P.IVA/CF non hanno agganciato.
  if (nome) {
    const tipo: TipoMatch = citta ? "nome_citta" : "nome";
    const dovePer = (and: Prisma.PartnerWhereInput[]) => ({
      attivo: true,
      AND: and,
      ...(citta ? { citta: citta.toUpperCase() } : {}),
    });
    let trovati = await prisma.partner.findMany({
      where: dovePer(whereRicerca(nome)),
      take: 10,
      orderBy: { nome: "asc" },
    });

    // ⚠️ RIPIEGO: la ricerca a parole le vuole TUTTE, e una forma giuridica
    // scritta da una parte sola («Battistella fioreria srl» contro «Fioreria
    // Battistella») bastava a rispondere «nessuna» — così chi chiamava creava
    // il quasi-doppione. Si riprova senza le forme giuridiche, e solo sul NOME:
    // il ripiego è più largo, quindi NON deve poter pescare fra i contatti.
    // Scatta solo quando il primo giro non ha trovato niente: non toglie né
    // cambia nessun risultato: al massimo ne aggiunge dove non c'era nulla.
    if (trovati.length === 0) {
      const parole = paroleSignificative(nome);
      if (parole.length && parole.length < nome.trim().split(/s+/).length) {
        trovati = await prisma.partner.findMany({
          where: dovePer(whereRicercaNome(parole)),
          take: 10,
          orderBy: { nome: "asc" },
        });
      }
    }
    const nn = norm(nome);
    const esatti = trovati.filter((p) => norm(p.nome) === nn);
    if (esatti.length === 1) {
      // nome esatto: alta se anche la città vincola, altrimenti media (omonimi)
      return { tipo, esito: "agganciata", confidenza: citta ? "alta" : "media", match: esatti[0], candidati: [] };
    }
    if (esatti.length > 1) return { tipo, esito: "candidati", confidenza: "media", match: null, candidati: esatti };
    if (trovati.length === 1) {
      // ⚠️ Vedi nomeAffine(): un solo risultato non basta a dire «è lui».
      return nomeAffine(nome, trovati[0].nome)
        ? { tipo, esito: "agganciata" as const, confidenza: "media" as const, match: trovati[0], candidati: [] }
        : { tipo, esito: "candidati" as const, confidenza: "nessuna" as const, match: null, candidati: trovati };
    }
    if (trovati.length > 1) return { tipo, esito: "candidati", confidenza: "nessuna", match: null, candidati: trovati };
  }

  // Niente ha agganciato: esito "nessuna" col tipo del criterio più forte fornito.
  const tipo: TipoMatch = pIva ? "piva" : cf ? "codice_fiscale" : nome ? (citta ? "nome_citta" : "nome") : "vuota";
  return { tipo, esito: "nessuna", confidenza: "nessuna", match: null, candidati: [] };
}

// Vista sintetica di un partner per la risposta di match
export function sintesiPartner(p: Partner) {
  return { id: p.id, nome: p.nome, categoria: p.categoria, citta: p.citta, provincia: p.provincia, stato: p.stato };
}
