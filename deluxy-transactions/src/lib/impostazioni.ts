import { prisma } from "./db";

// Le regole che decidono quando serve la doppia firma e quando una richiesta
// va bloccata. Stanno sul database (pagina /impostazioni) con dei valori di
// partenza prudenti: un'app di pagamenti appena installata deve essere severa,
// non permissiva.

export type Regole = {
  // sopra questa cifra servono due approvatori distinti
  sogliaDoppiaFirma: number;
  // sopra questa cifra nessuno può approvare: la richiesta resta bloccata e va
  // gestita fuori dall'app (è il freno di emergenza)
  tettoAssoluto: number;
  // punteggio di rischio oltre il quale scatta comunque la doppia firma
  sogliaRischioDoppiaFirma: number;
  // solo beneficiari già verificati in rubrica possono essere approvati
  soloBeneficiariVerificati: boolean;
  // richieste API oltre questo numero al minuto per chiave vengono respinte
  colpiAlMinuto: number;
  // minuti di tolleranza sull'orologio per la firma delle richieste API
  minutiFirma: number;
  // nome e IBAN dell'ordinante nelle distinte SEPA
  ordinanteNome: string;
  ordinanteIban: string;
  ordinanteBic: string;
  // L'UNICA persona che può far uscire denaro. Riceve il codice per email e
  // sblocca con codice + PIN. Chiunque altro, admin compresi, può preparare la
  // distinta ma non generarla.
  pagatoreEmail: string;
  // minuti di validità del codice ricevuto per email
  minutiCodicePagamento: number;
  // minuti in cui la distinta resta sbloccata dopo lo sblocco riuscito
  minutiSbloccoPagamento: number;
};

const PREDEFINITE: Regole = {
  sogliaDoppiaFirma: 100_000, // 1.000,00 €
  tettoAssoluto: 5_000_000, // 50.000,00 €
  sogliaRischioDoppiaFirma: 50,
  soloBeneficiariVerificati: false,
  colpiAlMinuto: 60,
  minutiFirma: 5,
  ordinanteNome: "",
  ordinanteIban: "",
  ordinanteBic: "",
  // Valore di partenza deciso dal titolare: finché non lo si cambia qui, il
  // denaro esce solo con lo sblocco di questa persona.
  pagatoreEmail: "nicolo.donato@deluxy.it",
  minutiCodicePagamento: 10,
  minutiSbloccoPagamento: 15,
};

const NUMERICHE = new Set([
  "sogliaDoppiaFirma",
  "tettoAssoluto",
  "sogliaRischioDoppiaFirma",
  "colpiAlMinuto",
  "minutiFirma",
  "minutiCodicePagamento",
  "minutiSbloccoPagamento",
]);

export async function leggiRegole(): Promise<Regole> {
  try {
    const righe = await prisma.impostazione.findMany();
    const mappa = new Map(righe.map((r) => [r.chiave, r.valore]));
    const out = { ...PREDEFINITE } as Record<string, unknown>;
    for (const [k, def] of Object.entries(PREDEFINITE)) {
      const v = mappa.get(k);
      if (v == null) continue;
      if (NUMERICHE.has(k)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
      } else if (typeof def === "boolean") {
        out[k] = v === "true";
      } else {
        out[k] = v;
      }
    }
    return out as Regole;
  } catch {
    // Database non raggiungibile: si torna alle regole prudenti, mai a nessuna.
    return { ...PREDEFINITE };
  }
}

export async function salvaRegola(chiave: keyof Regole, valore: string): Promise<void> {
  await prisma.impostazione.upsert({
    where: { chiave },
    update: { valore },
    create: { chiave, valore },
  });
}

export const regolePredefinite = PREDEFINITE;
