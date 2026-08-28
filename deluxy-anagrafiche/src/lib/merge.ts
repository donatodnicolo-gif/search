// Motore di merge multi-sorgente (Fase 1 dell'architettura).
// Il registro possiede il golden record: ogni scrittura in arrivo è un merge
// governato da regole per campo, mai una sostituzione.

import { gradinoFornitore } from "./stati";

export type Provenienza = Record<string, { sistema: string; asOf?: string }>;

// Fiducia della sorgente: numero più alto = più autorevole. Decide i pareggi
// sui campi fattuali quando manca (o è pari) la freschezza `asOf`.
const FIDUCIA: Record<string, number> = {
  ui: 100, // team, dalla UI del registro — ha sempre l'ultima parola
  platform: 80, // piattaforma consegne (verità operativa/fatturazione)
  partner: 70, // FINANCE: fisco, incassi, stato finanziario e perimetro di analisi
  scout: 60, // rilevato sul campo
  suppliers: 55,
  hubspot: 40, // CRM / marketing
  search: 30,
  manuale: 30,
  excel: 25, // lotto storico
};
// Una data dichiarata non puo' essere nel futuro: se lo e', vale «adesso».
export function limitaAdAdesso(asOf?: string): string | undefined {
  if (!asOf) return undefined;
  const t = new Date(asOf);
  if (Number.isNaN(t.getTime())) return undefined;
  const ora = new Date();
  return t > ora ? ora.toISOString() : asOf;
}

export function fiducia(sistema?: string | null): number {
  if (!sistema) return 0;
  return FIDUCIA[sistema] ?? 20; // sorgente sconosciuta: bassa, ma > 0
}

// Curati dal team: le scritture esterne non li toccano (stato commerciale,
// interessi) o li riempiono solo se vuoti (account). categoria è gestita a
// parte. Stato finanziario e stato analisi NON sono qui: nascono in FINANCE,
// quindi seguono la regola fattuale (vince il più fresco / il più autorevole).
// `livello` sta con `stato`: è la stessa dimensione commerciale vista più da
// vicino, e chi può dichiarare «è cliente» può dire anche «sta aspettando».
const BLOCCATI_DURI = ["stato", "livello", "interessi"] as const;
// Fattuali: vince il più fresco / la sorgente più autorevole.
const FATTUALI = [
  "nome",
  "ragioneSociale",
  "citta",
  "provincia",
  "regione",
  "sede",
  "tipoLuogo",
  "indirizzo",
  "email",
  "telefono",
  "pIva",
  "codiceFiscale",
  "ultimaVisita",
  // stati non commerciali: FINANCE è la sorgente naturale, la UI del registro
  // (fiducia 100) resta comunque l'ultima parola
  "statoFinanziario",
  "statoAnalisi",
  // il rapporto di fornitura: lo scrive chi coi fornitori ci parla (ricerca
  // fornitori, acquisti), la UI resta l'ultima parola come per gli altri due
  "statoFornitore",
  // dati finanziari / fatturazione (dopo la scrittura vengono propagati alle
  // sedi della stessa insegna: la fatturazione è della società)
  "pec",
  "codiceSdi",
  "iban",
  "intestatarioConto",
  "banca",
  "metodoPagamento",
  "condizioniPagamento",
  "gruppoPagamento",
  "amministrazioneNome",
  "amministrazioneTelefono",
  "amministrazioneEmail",
] as const;

// categoria "non ancora classificata": può essere riempita da una sorgente
const CATEGORIA_VUOTA = new Set(["", "ALTRO", "DA CLASSIFICARE"]);

// "da_verificare" è il valore di partenza dello stato finanziario: vale come
// casella vuota, altrimenti nessuna app riuscirebbe mai a scriverlo la prima
// volta senza vincere il confronto di autorevolezza.
function vuotoPerMerge(campo: string, valore: unknown): boolean {
  if (valore == null || valore === "") return true;
  return campo === "statoFinanziario" && valore === "da_verificare";
}

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
  // ⚠️ Un `asOf` nel FUTURO vince ogni confronto di freschezza per sempre: era
  // il secondo mezzo (col `sistema` falso) per imporre un valore e renderlo
  // inamovibile. La freschezza dichiarata non puo' superare adesso.
  asOf = limitaAdAdesso(asOf);
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

    // «Da evitare» è una bocciatura del TEAM: nessuna app la ribalta, nemmeno
    // con un asOf più fresco (24/08/2026). Il caso concreto: il Customer
    // Service ripaga un arretrato a un fornitore bocciato e manderebbe
    // «abituale» — il pagamento è un fatto, la bocciatura una decisione, e
    // qui vince la decisione. Si toglie solo dalla UI del registro.
    if (campo === "statoFornitore" && esistente.statoFornitore === "da_evitare") {
      ignorati.push(campo);
      continue;
    }

    // ⚠️⚠️ IL RAPPORTO DI FORNITURA PUÒ SOLO AVANZARE, MAI RETROCEDERE — dalle
    // app. Lo stato fornitore è un campo fattuale, quindi «vince il più
    // fresco»: senza questa guardia, un negozio già **abituale** risalvato
    // dall'app di ricerca fornitori tornava **«da provare»**, perché quella
    // scrittura era più recente. Il gesto di oggi cancellava il rapporto di sei
    // mesi, e nessuno se ne accorgeva: lo stato è una pillola in una scheda.
    //
    // ⚠️ Vale SOLO per le scritture delle app. La UI del registro non passa di
    // qui (aggiornaPartner scrive diretto): una persona può sempre retrocedere
    // un fornitore, ed è giusto che debba farlo a mano — come per «da evitare»,
    // che pure si toglie solo dalla UI.
    //
    // ⚠️ «Da evitare» resta fuori dalla scala e continua a passare: è un veto, e
    // alzare un veto è la direzione prudente.
    if (campo === "statoFornitore" && typeof valore === "string" && valore !== "da_evitare") {
      const arrivo = gradinoFornitore(valore);
      const attuale = gradinoFornitore(esistente.statoFornitore as string | null);
      if (arrivo != null && attuale != null && arrivo < attuale) {
        ignorati.push(campo);
        continue;
      }
    }


    if ((FATTUALI as readonly string[]).includes(campo)) {
      const attuale = esistente[campo];
      if (vuotoPerMerge(campo, attuale)) {
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
// ⚠️⚠️ CHI CHIAMA NON DICE PIU' CHI E' (27/08/2026).
//
// Prima questa funzione faceva vincere il `sistema` scritto nel CORPO della
// richiesta sul nome della chiave. Il corpo lo scrive il chiamante: bastava
// mandare `"sistema":"ui"` per prendersi la fiducia 100 — piu' della
// piattaforma e di FINANCE — e riscrivere i campi fattuali, **IBAN compreso**,
// cioe' il conto su cui FINANCE paga. Le stesse tre lettere falsificavano lo
// storico («l'ha fatto il team dal registro»), accendevano le regole
// automatiche riservate a certe app, e con `idEsterno` si potevano rubare i
// riferimenti esterni di un'altra app.
//
// Adesso l'identita' viene dalla CHIAVE, che e' un segreto e non un campo. Il
// `sistema` del corpo resta ammesso come SOTTO-ETICHETTA della stessa app —
// «scout-web» per la chiave «deluxy-scout» — perche' un'app puo' avere piu'
// canali; ma non puo' spacciarsi per un'altra, quindi tutto cio' che decide
// permessi, fiducia e regole guarda `sistemaDellaChiave()`.
export function sistemaDellaChiave(nomeChiave: string): string {
  return nomeChiave.trim().replace(/^deluxy-/, "");
}

export function nomeSistema(nomeChiave: string, sistemaBody?: string | null): string {
  const base = sistemaDellaChiave(nomeChiave);
  const dichiarato = (sistemaBody ?? "").trim();
  if (!dichiarato) return base;
  const d = dichiarato.toLowerCase().replace(/^deluxy-/, "");
  // Ammesso solo se e' lo stesso sistema o un suo canale: «scout», «scout-web».
  if (d === base.toLowerCase() || d.startsWith(base.toLowerCase() + "-")) return dichiarato;
  // ⚠️ Non e' un errore da 400: rifiutare romperebbe in silenzio le app che
  // mandano un'etichetta storica. Si IGNORA e si usa la chiave — l'etichetta
  // falsa non entra ne' nella fiducia ne' nello storico.
  return base;
}
