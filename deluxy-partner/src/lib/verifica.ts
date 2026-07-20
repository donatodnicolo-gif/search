import { prisma } from "./db";
import { riepilogoPartner, ANNO_CORRENTE } from "./queries";
import { ivato } from "./calc";
import { normalizza, tokenPartner } from "./riconciliazione";

// Situazione finanziaria sintetica di un partner, condivisa dall'API di verifica
// e (in futuro) dalla UI. Tutti gli importi in euro.
export type SituazionePartner = {
  trovato: true;
  partner: {
    id: string;
    nome: string;
    ragioneSociale: string | null;
    categoria: string | null;
    citta: string | null;
    stato: string | null; // P.P. | Nuovo | Dismesso
    feePercent: number | null;
    compensazione: boolean;
    attivo: boolean;
  };
  situazione: {
    anno: number;
    venditeYtd: number;
    serviziFatturatiYtd: number;
    commissioniYtd: number;
    dovutoAlPartner: number;
    daIncassare: number; // quanto il partner deve a Deluxy (fatture aperte)
    daBonificare: number; // quanto Deluxy deve al partner
    residuo: number; // daIncassare - daBonificare
    fattureAperte: { numero: number; totaleIvato: number; scaduto: number };
    debiti2025: number;
    crediti2025: number;
  };
  aggiornatoAl: string;
};

export type EsitoVerifica =
  | SituazionePartner
  | { trovato: false; motivo: string; candidati?: { id: string; nome: string }[] };

// Trova un partner per id, P.IVA/insegna esatta o nome (match parziale robusto).
async function trovaPartner(query: string) {
  const q = query.trim();
  if (!q) return { partner: null, candidati: [] as { id: string; nome: string }[] };

  // 1. id esatto (id interno di deluxy-partner)
  const perId = await prisma.partner.findUnique({ where: { id: q } });
  if (perId) return { partner: perId, candidati: [] };

  // 1b. id del registro Anagrafiche (lingua comune di id tra le app):
  // così un'altra app che ha solo l'anagraficaId incrocia la situazione finanziaria.
  const perAnagrafica = await prisma.partner.findUnique({ where: { anagraficaId: q } });
  if (perAnagrafica) return { partner: perAnagrafica, candidati: [] };

  const partners = await prisma.partner.findMany();
  // 2. nome esatto (normalizzato)
  const qn = normalizza(q);
  const perNomeEsatto = partners.find((p) => normalizza(p.nome) === qn);
  if (perNomeEsatto) return { partner: perNomeEsatto, candidati: [] };

  // 3. match parziale: tutti i token della query compaiono nel nome, o viceversa
  const qTokens = qn.split(" ").filter((t) => t.length >= 3);
  const punteggio = (nome: string) => {
    const n = normalizza(nome);
    const cont = qTokens.filter((t) => n.includes(t));
    if (!cont.length) return 0;
    const forte = tokenPartner(nome).some((t) => qn.includes(t));
    return cont.reduce((a, t) => a + t.length, 0) + (forte ? 5 : 0);
  };
  const classificati = partners
    .map((p) => ({ p, s: punteggio(p.nome) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (classificati.length === 1 || (classificati.length > 1 && classificati[0].s >= classificati[1].s + 4)) {
    return { partner: classificati[0].p, candidati: [] };
  }
  return {
    partner: null,
    candidati: classificati.slice(0, 5).map((x) => ({ id: x.p.id, nome: x.p.nome })),
  };
}

export async function verificaPartner(query: string): Promise<EsitoVerifica> {
  const { partner, candidati } = await trovaPartner(query);
  if (!partner) {
    return {
      trovato: false,
      motivo: candidati.length ? "Più partner corrispondono: specifica meglio o usa l'id." : "Nessun partner corrisponde alla ricerca.",
      candidati,
    };
  }

  const anno = ANNO_CORRENTE;
  const { rolling, mesi, fatture } = await riepilogoPartner(partner.id, anno);
  const oggi = new Date();
  const fattureAperteList = fatture.filter((f) => !f.pagata && f.imponibile > 0);
  const totaleIvato = fattureAperteList.reduce((a, f) => a + ivato(f), 0);
  const scaduto = fattureAperteList
    .filter((f) => f.scadenza && f.scadenza < oggi)
    .reduce((a, f) => a + ivato(f), 0);
  void mesi;

  return {
    trovato: true,
    partner: {
      id: partner.id,
      nome: partner.nome,
      ragioneSociale: partner.ragioneSociale,
      categoria: partner.categoria,
      citta: partner.citta,
      stato: partner.clienteAnno,
      feePercent: partner.feePercent,
      compensazione: partner.compensazione,
      attivo: partner.attivo,
    },
    situazione: {
      anno,
      venditeYtd: round(rolling.vendite),
      serviziFatturatiYtd: round(rolling.fatture),
      commissioniYtd: round(rolling.commissioni),
      dovutoAlPartner: round(rolling.incassiNettoCommissioni),
      daIncassare: round(rolling.daIncassare),
      daBonificare: round(rolling.daBonificare),
      residuo: round(rolling.residuo),
      fattureAperte: { numero: fattureAperteList.length, totaleIvato: round(totaleIvato), scaduto: round(scaduto) },
      debiti2025: round(partner.debiti2025),
      crediti2025: round(partner.crediti2025),
    },
    aggiornatoAl: new Date().toISOString(),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
