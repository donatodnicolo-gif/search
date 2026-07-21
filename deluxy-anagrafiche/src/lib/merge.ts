// Motore di merge multi-sorgente (Fase 1 dell'architettura).
// Il registro possiede il golden record: ogni scrittura in arrivo è un merge
// governato da regole per campo, mai una sostituzione.

export type Provenienza = Record<string, { sistema: string; asOf?: string }>;

// Fiducia della sorgente: numero più alto = più autorevole. Decide i pareggi
// sui campi fattuali quando manca (o è pari) la freschezza `asOf`.
const FIDUCIA: Record<string, number> = {
  ui: 100, // team, dalla UI del registro — ha sempre l'ultima parola
  platform: 80, // piattaforma consegne (verità operativa/fatturazione)
  scout: 60, // rilevato sul campo
  suppliers: 55,
  hubspot: 40, // CRM / marketing
  search: 30,
  manuale: 30,
  excel: 25, // lotto storico
};
export function fiducia(sistema?: string | null): number {
  if (!sistema) return 0;
  return FIDUCIA[sistema] ?? 20; // sorgente sconosciuta: bassa, ma > 0
}

// Curati dal team: le scritture esterne non li toccano (stato, interessi) o li
// riempiono solo se vuoti (account). categoria è gestita a parte.
const BLOCCATI_DURI = ["stato", "interessi"] as const;
// Fattuali: vince il più fresco / la sorgente più autorevole.
const FATTUALI = [
  "nome",
  "ragioneSociale",
  "citta",
  "provincia",
  "regione",
  "indirizzo",
  "email",
  "telefono",
  "pIva",
  "codiceFiscale",
  "ultimaVisita",
  // dati finanziari / fatturazione (dopo la scrittura vengono propagati alle
  // sedi della stessa insegna: la fatturazione è della società)
  "pec",
  "codiceSdi",
  "iban",
  "banca",
  "metodoPagamento",
  "condizioniPagamento",
  "amministrazioneNome",
  "amministrazioneTelefono",
  "amministrazioneEmail",
] as const;

// categoria "non ancora classificata": può essere riempita da una sorgente
const CATEGORIA_VUOTA = new Set(["", "ALTRO", "DA CLASSIFICARE"]);

type Esistente = {
  categoria: string;
  account: string | null;
  note: string | null;
  provenienza: unknown;
  [k: string]: unknown;
};

export type EsitoMerge = {
  dati: Record<string, unknown>; // campi effettivamente da scrivere
  provenienza: Provenienza; // provenienza aggiornata
  ignorati: string[]; // campi bloccati non applicati (candidati a "proposta")
};

// Calcola, campo per campo, cosa scrivere quando l'anagrafica esiste già.
export function calcolaMerge(
  esistente: Esistente,
  incoming: Record<string, unknown>,
  sistema: string,
  asOf?: string,
  opzioni: { sbloccaCurati?: boolean } = {},
): EsitoMerge {
  const prov: Provenienza = (esistente.provenienza as Provenienza) ?? {};
  const nuovaProv: Provenienza = { ...prov };
  const dati: Record<string, unknown> = {};
  const ignorati: string[] = [];
  const fiduciaIn = fiducia(sistema);
  const timbro = (campo: string) => {
    nuovaProv[campo] = asOf ? { sistema, asOf } : { sistema };
  };

  for (const [campo, valore] of Object.entries(incoming)) {
    if (valore === undefined) continue;

    if ((BLOCCATI_DURI as readonly string[]).includes(campo)) {
      // Di norma stato/interessi sono curati dal team e ignorati. Un driver di
      // prima parte (es. Scout, che dichiara "cliente") può invece impostarli.
      if (opzioni.sbloccaCurati && valore != null) {
        dati[campo] = valore;
        timbro(campo);
      } else {
        ignorati.push(campo);
      }
      continue;
    }

    if (campo === "account") {
      if (esistente.account == null && valore != null) dati.account = valore;
      else if (valore != null && valore !== esistente.account) ignorati.push("account");
      continue;
    }

    if (campo === "categoria") {
      if (CATEGORIA_VUOTA.has(String(esistente.categoria))) dati.categoria = valore;
      else if (valore != null && valore !== esistente.categoria) ignorati.push("categoria");
      continue;
    }

    if (campo === "note" || campo === "noteAmministrative") {
      const attuale = esistente[campo] as string | null;
      if (valore && attuale && !attuale.includes(String(valore))) dati[campo] = `${attuale}\n${valore}`;
      else if (valore && !attuale) dati[campo] = valore;
      continue;
    }

    if ((FATTUALI as readonly string[]).includes(campo)) {
      const attuale = esistente[campo];
      if (attuale == null || attuale === "") {
        dati[campo] = valore;
        timbro(campo);
      } else if (valore != null && valore !== attuale) {
        const p = prov[campo];
        const piuFresco = asOf && p?.asOf ? new Date(asOf) > new Date(p.asOf) : false;
        const piuAutorevole = !(asOf && p?.asOf) && fiduciaIn >= fiducia(p?.sistema);
        if (piuFresco || piuAutorevole) {
          dati[campo] = valore;
          timbro(campo);
        }
      }
      continue;
    }

    // campi non classificati (tipoProspect, datiExtra, ...) passano invariati
    dati[campo] = valore;
  }

  return { dati, provenienza: nuovaProv, ignorati };
}

// Provenienza iniziale per una nuova anagrafica (solo campi fattuali presenti).
export function provenienzaIniziale(
  incoming: Record<string, unknown>,
  sistema: string,
  asOf?: string,
): Provenienza {
  const prov: Provenienza = {};
  for (const campo of FATTUALI) {
    if (incoming[campo] != null && incoming[campo] !== "") {
      prov[campo] = asOf ? { sistema, asOf } : { sistema };
    }
  }
  return prov;
}

// Chiave di identità di un referente per il merge (email > telefono > nome).
function chiaveContatto(c: { nome?: string | null; telefono?: string | null; email?: string | null }): string | null {
  if (c.email) return "e:" + c.email.toLowerCase().trim();
  if (c.telefono) return "t:" + c.telefono.replace(/\s+/g, "");
  if (c.nome) return "n:" + c.nome.toLowerCase().trim();
  return null;
}

type ContattoEsistente = { id: string; ruolo: string | null; nome: string | null; telefono: string | null; email: string | null };
type ContattoInput = { ruolo?: string | null; nome?: string | null; telefono?: string | null; email?: string | null };

// Fonde i referenti in arrivo con quelli esistenti SENZA cancellare gli altri:
// aggiorna quelli riconosciuti, aggiunge i nuovi, lascia intatto il resto.
// Ritorna le operazioni annidate Prisma (create/update).
export function mergeContatti(esistenti: ContattoEsistente[], incoming: ContattoInput[], sistema: string) {
  const perChiave = new Map<string, ContattoEsistente>();
  for (const c of esistenti) {
    const k = chiaveContatto(c);
    if (k && !perChiave.has(k)) perChiave.set(k, c);
  }
  const create: (ContattoInput & { fonte: string })[] = [];
  const update: { where: { id: string }; data: ContattoInput }[] = [];

  for (const c of incoming) {
    const k = chiaveContatto(c);
    const match = k ? perChiave.get(k) : undefined;
    if (match) {
      update.push({
        where: { id: match.id },
        data: {
          ruolo: c.ruolo ?? match.ruolo,
          nome: c.nome ?? match.nome,
          telefono: c.telefono ?? match.telefono,
          email: c.email ?? match.email,
        },
      });
    } else {
      create.push({ ...c, fonte: sistema });
    }
  }
  return { create, update };
}

// Normalizza il nome della sorgente: "deluxy-scout" -> "scout".
export function nomeSistema(nomeChiave: string, sistemaBody?: string | null): string {
  const s = (sistemaBody ?? "").trim();
  if (s) return s;
  return nomeChiave.replace(/^deluxy-/, "");
}
