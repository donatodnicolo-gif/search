import { BadRequestException } from '@nestjs/common';

/**
 * ⭐ 08/09/2026 — RICERCA AVANZATA DELLE CONSEGNE (regola utente: «consenti di
 * aggiungere filtri di ricerca anche in consegne, con un pop-up che permette di
 * aggiungere varie condizioni di ricerca»).
 *
 * PERCHE'. Le linguette in cima rispondono alle domande frequenti (oggi, domani, la
 * famiglia del servizio, lo stato). Le domande di lavoro vere sono piu' strette —
 * «quelle senza valet di questa settimana», «quelle sopra i 100 € col DDT di quel
 * brand», «quelle consegnate ma senza orario» — e finora si risolvevano scorrendo
 * l'elenco a mano, o non si risolvevano affatto.
 *
 * COM'E' FATTA. Un elenco di condizioni `{campo, operatore, valore}` che si sommano in
 * AND. Non e' una query libera: qui sotto c'e' la LISTA BIANCA dei campi e, per ognuno,
 * il suo tipo — che decide quali operatori accetta e come si legge il valore. Un campo
 * fuori elenco fa fallire la richiesta con un messaggio, non la allarga in silenzio.
 *
 * ⚠️ IL VALORE NON TOCCA MAI SQL. Ogni condizione diventa un oggetto Prisma tipizzato
 * (`{ ddtNumber: { contains: '...', mode: 'insensitive' } }`): niente stringhe
 * concatenate, niente `$queryRaw`. E il risultato entra in AND con lo scope di ruolo,
 * che resta l'ultima parola: un partner che scrive `partnerId = altro` non vede nulla.
 *
 * ⚠️ TETTO ALLE CONDIZIONI. Dieci per richiesta. Non e' pignoleria: ogni condizione su
 * un campo senza indice e' una scansione in piu' sul Postgres condiviso da 14 app, e
 * una lista di condizioni senza fondo e' un modo per fermare il cluster da dentro
 * l'interfaccia. Le condizioni si applicano SEMPRE sopra i filtri di base (data, vista,
 * ruolo), che hanno gia' ristretto l'insieme.
 */

/** Il tipo del campo decide gli operatori e come si legge il valore. */
type TipoCampo = 'testo' | 'numero' | 'data' | 'scelta' | 'booleano' | 'prodotto';

interface CampoAvanzato {
  /** Il campo Prisma su `Delivery`, o un nome speciale gestito a parte. */
  readonly prisma: string;
  readonly tipo: TipoCampo;
  /** Etichetta per il pop-up (la traduzione vera sta nel front). */
  readonly etichetta: string;
  /** Per i campi a scelta: i valori ammessi, quando sono un elenco chiuso. */
  readonly valori?: readonly string[];
}

const OPERATORI: Record<TipoCampo, readonly string[]> = {
  testo: ['contiene', 'non_contiene', 'uguale', 'inizia', 'vuoto', 'non_vuoto'],
  numero: ['uguale', 'maggiore', 'minore', 'tra', 'vuoto', 'non_vuoto'],
  data: ['uguale', 'dopo', 'prima', 'tra', 'vuoto', 'non_vuoto'],
  scelta: ['uguale', 'diverso', 'uno_di', 'vuoto', 'non_vuoto'],
  booleano: ['vero', 'falso'],
  prodotto: ['contiene', 'non_contiene'],
};

/**
 * LA LISTA BIANCA. Ogni voce e' un campo che l'ufficio puo' interrogare.
 *
 * ⚠️ Non ci sono qui — di proposito — `internalNotes` (note riservate all'ufficio, che
 * il ruolo PARTNER non deve poter sondare a tentativi) ne' `trackingToken` (e' la
 * chiave del link pubblico: un filtro «inizia per» lo indovinerebbe un pezzo per volta).
 */
export const CAMPI_AVANZATI: Readonly<Record<string, CampoAvanzato>> = {
  code: { prisma: 'code', tipo: 'numero', etichetta: 'Numero consegna' },
  ddtNumber: { prisma: 'ddtNumber', tipo: 'testo', etichetta: 'Numero DDT' },
  ddtBrand: { prisma: 'ddtBrand', tipo: 'testo', etichetta: 'Brand del DDT' },
  recipientAddress: { prisma: 'recipientAddress', tipo: 'testo', etichetta: 'Indirizzo destinatario' },
  recipientFirstName: { prisma: 'recipientFirstName', tipo: 'testo', etichetta: 'Nome destinatario' },
  recipientLastName: { prisma: 'recipientLastName', tipo: 'testo', etichetta: 'Cognome destinatario' },
  recipientPhone: { prisma: 'recipientPhone', tipo: 'testo', etichetta: 'Telefono destinatario' },
  recipientEmail: { prisma: 'recipientEmail', tipo: 'testo', etichetta: 'Email destinatario' },
  senderFirstName: { prisma: 'senderFirstName', tipo: 'testo', etichetta: 'Nome mittente' },
  senderLastName: { prisma: 'senderLastName', tipo: 'testo', etichetta: 'Cognome mittente' },
  pickupAddress: { prisma: 'pickupAddress', tipo: 'testo', etichetta: 'Indirizzo di ritiro' },
  notes: { prisma: 'notes', tipo: 'testo', etichetta: 'Note' },
  receivedBy: { prisma: 'receivedBy', tipo: 'testo', etichetta: 'Ritirato da' },
  realOrderNumber: { prisma: 'realOrderNumber', tipo: 'testo', etichetta: 'Numero ordine' },
  shop: { prisma: 'shop', tipo: 'testo', etichetta: 'Negozio di origine' },
  externalOrderSource: { prisma: 'externalOrderSource', tipo: 'testo', etichetta: 'Origine esterna' },

  price: { prisma: 'price', tipo: 'numero', etichetta: 'Prezzo al partner' },
  additionalPrice: { prisma: 'additionalPrice', tipo: 'numero', etichetta: 'Variazione prezzo' },
  deliveryPrice: { prisma: 'deliveryPrice', tipo: 'numero', etichetta: 'Prezzo consegna al cliente' },
  paymentAmount: { prisma: 'paymentAmount', tipo: 'numero', etichetta: 'Contanti da incassare' },
  valetSalary: { prisma: 'valetSalary', tipo: 'numero', etichetta: 'Paga del valet' },
  distanceKm: { prisma: 'distanceKm', tipo: 'numero', etichetta: 'Distanza (km)' },

  date: { prisma: 'date', tipo: 'data', etichetta: 'Giorno della consegna' },
  deliveredAt: { prisma: 'deliveredAt', tipo: 'data', etichetta: 'Consegnata il' },
  startedAt: { prisma: 'startedAt', tipo: 'data', etichetta: 'Partita il' },
  createdAt: { prisma: 'createdAt', tipo: 'data', etichetta: 'Creata il' },

  status: { prisma: 'status', tipo: 'scelta', etichetta: 'Stato' },
  paymentStatus: {
    prisma: 'paymentStatus', tipo: 'scelta', etichetta: 'Stato pagamento',
    valori: ['default', 'paid', 'toBePaid'],
  },
  saleType: { prisma: 'saleType', tipo: 'scelta', etichetta: 'Tipo vendita' },
  createdFrom: { prisma: 'createdFrom', tipo: 'scelta', etichetta: 'Creata da' },
  partnerId: { prisma: 'partnerId', tipo: 'scelta', etichetta: 'Partner' },
  valetId: { prisma: 'valetId', tipo: 'scelta', etichetta: 'Valet' },
  serviceTypeId: { prisma: 'serviceTypeId', tipo: 'scelta', etichetta: 'Servizio' },
  provinceId: { prisma: 'provinceId', tipo: 'scelta', etichetta: 'Provincia' },
  customerId: { prisma: 'customerId', tipo: 'scelta', etichetta: 'Cliente' },

  deluxyDelivery: { prisma: 'deluxyDelivery', tipo: 'booleano', etichetta: 'Vendita Deluxy' },
  deliveredByPartner: { prisma: 'deliveredByPartner', tipo: 'booleano', etichetta: 'Consegna del fornitore' },
  billable: { prisma: 'billable', tipo: 'booleano', etichetta: 'Da fatturare' },
  payable: { prisma: 'payable', tipo: 'booleano', etichetta: 'Da pagare' },
  paymentOnDelivery: { prisma: 'paymentOnDelivery', tipo: 'booleano', etichetta: 'Pagamento alla consegna' },
  tryAndReturn: { prisma: 'tryAndReturn', tipo: 'booleano', etichetta: 'Prova e reso' },

  prodotto: { prisma: 'products', tipo: 'prodotto', etichetta: 'Prodotto in consegna' },
};

export interface CondizioneAvanzata {
  campo: string;
  operatore: string;
  valore?: unknown;
  /** Secondo estremo, per «tra». */
  valore2?: unknown;
}

const MAX_CONDIZIONI = 10;

/** Il catalogo che il pop-up legge per costruirsi: campi, tipo, operatori ammessi. */
export function catalogoFiltriAvanzati() {
  return {
    max: MAX_CONDIZIONI,
    operatori: OPERATORI,
    campi: Object.entries(CAMPI_AVANZATI).map(([chiave, c]) => ({
      chiave, tipo: c.tipo, etichetta: c.etichetta,
      operatori: OPERATORI[c.tipo], valori: c.valori ?? null,
    })),
  };
}

function testoRichiesto(v: unknown, campo: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new BadRequestException(`La condizione su «${campo}» ha bisogno di un valore.`);
  if (s.length > 200) throw new BadRequestException(`Il valore per «${campo}» è troppo lungo.`);
  return s;
}

function numeroRichiesto(v: unknown, campo: string): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new BadRequestException(`La condizione su «${campo}» vuole un numero.`);
  return n;
}

function dataRichiesta(v: unknown, campo: string): Date {
  const d = new Date(String(v ?? ''));
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`La condizione su «${campo}» vuole una data.`);
  return d;
}

/** Il giorno intero: da mezzanotte a mezzanotte. Una data «uguale a» è un GIORNO, non un istante. */
function giorno(d: Date): { gte: Date; lt: Date } {
  const da = new Date(d); da.setHours(0, 0, 0, 0);
  const a = new Date(da); a.setDate(a.getDate() + 1);
  return { gte: da, lt: a };
}

/** Una condizione → un pezzo di `where` Prisma. */
function unaCondizione(c: CondizioneAvanzata): Record<string, unknown> {
  const def = CAMPI_AVANZATI[c.campo];
  if (!def) throw new BadRequestException(`Non si può filtrare per «${c.campo}».`);
  const op = String(c.operatore ?? '');
  if (!OPERATORI[def.tipo].includes(op)) {
    throw new BadRequestException(`L'operatore «${op}» non vale per «${def.etichetta}».`);
  }
  const k = def.prisma;

  // «Vuoto» e «non vuoto» valgono per ogni tipo che li dichiara, e sono la ragione
  // principale per cui questa ricerca esiste: «senza valet», «consegnata senza orario».
  if (op === 'vuoto') return { [k]: null };
  if (op === 'non_vuoto') return { NOT: { [k]: null } };

  switch (def.tipo) {
    case 'testo': {
      const s = testoRichiesto(c.valore, def.etichetta);
      if (op === 'contiene') return { [k]: { contains: s, mode: 'insensitive' } };
      if (op === 'non_contiene') return { NOT: { [k]: { contains: s, mode: 'insensitive' } } };
      if (op === 'uguale') return { [k]: { equals: s, mode: 'insensitive' } };
      return { [k]: { startsWith: s, mode: 'insensitive' } };
    }
    case 'numero': {
      const n = numeroRichiesto(c.valore, def.etichetta);
      if (op === 'uguale') return { [k]: n };
      if (op === 'maggiore') return { [k]: { gt: n } };
      if (op === 'minore') return { [k]: { lt: n } };
      const n2 = numeroRichiesto(c.valore2, def.etichetta);
      // ⚠️ Gli estremi si riordinano: «tra 100 e 50» è un errore di battitura, non
      // una richiesta di zero righe.
      return { [k]: { gte: Math.min(n, n2), lte: Math.max(n, n2) } };
    }
    case 'data': {
      const d = dataRichiesta(c.valore, def.etichetta);
      if (op === 'uguale') return { [k]: giorno(d) };
      if (op === 'dopo') return { [k]: { gte: giorno(d).lt } };
      if (op === 'prima') return { [k]: { lt: giorno(d).gte } };
      const d2 = dataRichiesta(c.valore2, def.etichetta);
      const [a, b] = d <= d2 ? [d, d2] : [d2, d];
      // Il secondo estremo è INCLUSO: chi scrive «dal 1 al 5» vuole anche il 5.
      return { [k]: { gte: giorno(a).gte, lt: giorno(b).lt } };
    }
    case 'scelta': {
      if (op === 'uno_di') {
        const elenco = (Array.isArray(c.valore) ? c.valore : String(c.valore ?? '').split(','))
          .map((x) => String(x).trim()).filter(Boolean).slice(0, 50);
        if (!elenco.length) throw new BadRequestException(`La condizione su «${def.etichetta}» ha bisogno di almeno un valore.`);
        if (def.valori && elenco.some((x) => !def.valori!.includes(x))) {
          throw new BadRequestException(`Valore non ammesso per «${def.etichetta}».`);
        }
        return { [k]: { in: elenco } };
      }
      const s = testoRichiesto(c.valore, def.etichetta);
      if (def.valori && !def.valori.includes(s)) {
        throw new BadRequestException(`Valore non ammesso per «${def.etichetta}».`);
      }
      return op === 'uguale' ? { [k]: s } : { NOT: { [k]: s } };
    }
    case 'booleano':
      return { [k]: op === 'vero' };
    case 'prodotto': {
      // ⚠️ Il nome del prodotto sta sulle RIGHE della consegna, che ne sono la
      // fotografia: si cerca lì, non nel catalogo, perché il catalogo intanto cambia
      // e una riga può portare un prodotto che oggi non esiste più.
      const s = testoRichiesto(c.valore, def.etichetta);
      const riga = { products: { some: { deletedAt: null, productName: { contains: s, mode: 'insensitive' } } } };
      return op === 'contiene' ? riga : { NOT: riga };
    }
  }
}

/**
 * Le condizioni del pop-up → un `where` Prisma da mettere in AND con lo scope.
 * Torna `null` quando non ce ne sono: così la query di sempre resta identica.
 */
export function condizioniAvanzate(json: string | undefined): Record<string, unknown> | null {
  const testo = (json ?? '').trim();
  if (!testo) return null;
  let elenco: unknown;
  try {
    elenco = JSON.parse(testo);
  } catch {
    throw new BadRequestException('Le condizioni di ricerca non sono leggibili.');
  }
  if (!Array.isArray(elenco)) throw new BadRequestException('Le condizioni di ricerca devono essere un elenco.');
  if (!elenco.length) return null;
  if (elenco.length > MAX_CONDIZIONI) {
    throw new BadRequestException(`Al massimo ${MAX_CONDIZIONI} condizioni per ricerca.`);
  }
  const pezzi = (elenco as CondizioneAvanzata[]).map(unaCondizione);
  return { AND: pezzi };
}
