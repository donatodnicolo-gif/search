import { prisma } from "./db";
import { accessToken, cercaPerTelefono, creaContatto, aggiornaContatto, googleConfigurato } from "./google";
import { elencoClienti, type Cliente } from "./clienti";

// Salvataggio dei clienti nella rubrica Google.
//
// Due regole che rendono l'operazione sicura su una rubrica personale:
//  1. si tocca SOLO un contatto che ha il nostro marcatore in biografia; se il
//     numero esiste già come contatto personale dell'utente, si lascia stare;
//  2. c'è sempre una PROVA A VUOTO (`anteprima`) che dice cosa succederebbe
//     senza scrivere niente. Diecimila contatti non si riversano alla cieca.
//
// Il nome in rubrica segue la convenzione già usata dall'app Messaggi:
// "FL Mario Rossi #1042" — sigla del negozio, nome, ordine più recente.

export const SIGLE: Record<string, string> = {};

// Sigla del negozio, stessa logica di deluxy-messaging (prefissoDaNegozio).
export function siglaBrand(brand: string): string {
  const t = brand.toLowerCase();
  if (/flower|fior/.test(t)) return "FL";
  if (/cake|pasticc|torta/.test(t)) return "CK";
  if (/deluxy/.test(t)) return "DL";
  return (brand.trim().slice(0, 2) || "XX").toUpperCase();
}

export function nomeContatto(sigla: string, nome: string, numeroOrdine: string): string {
  const numero = (numeroOrdine || "").trim();
  return [sigla.trim(), nome.trim() || "Cliente", numero.startsWith("#") || !numero ? numero : `#${numero}`]
    .filter(Boolean)
    .join(" ");
}

export type Selezione = {
  // quanti clienti considerare al massimo in questo giro
  limite: number;
  // solo i clienti con almeno N ordini (1 = tutti)
  minimoOrdini: number;
  // solo chi ha ordinato dal ... in poi (ISO, vuoto = da sempre)
  dal?: string;
};

export type VoceAnteprima = {
  chiave: string;
  nome: string;
  telefono: string | null;
  azione: "creare" | "aggiornare" | "gia-salvato" | "senza-telefono";
};

export type Riepilogo = {
  daCreare: number;
  daAggiornare: number;
  giaSalvati: number;
  senzaTelefono: number;
  totaleConsiderati: number;
};

// I clienti che rientrano nella selezione, con il nome che avranno in rubrica.
async function clientiSelezionati(sel: Selezione): Promise<(Cliente & { nomeRubrica: string })[]> {
  // si parte dai più recenti: sono quelli che servono davvero in rubrica
  const grezzi = await elencoClienti(undefined, "recenti", 0, Math.min(2000, sel.limite * 3));
  const filtrati = grezzi
    .filter((c) => c.ordini >= sel.minimoOrdini)
    .filter((c) => (sel.dal ? c.ultimoOrdine >= new Date(sel.dal) : true))
    .slice(0, sel.limite);

  // il numero dell'ordine più recente, per il nome del contatto
  const conNome: (Cliente & { nomeRubrica: string })[] = [];
  for (const c of filtrati) {
    const ultimo = await prisma.ordine.findFirst({
      where: whereCliente(c),
      orderBy: { data: "desc" },
      select: { numero: true, brand: true },
    });
    conNome.push({
      ...c,
      nomeRubrica: nomeContatto(siglaBrand(ultimo?.brand ?? c.brand[0] ?? ""), c.nome ?? "", ultimo?.numero ?? ""),
    });
  }
  return conNome;
}

function whereCliente(c: Cliente) {
  if (c.email) return { clienteEmail: { equals: c.email, mode: "insensitive" as const } };
  if (c.telefono) return { clienteTelefono: c.telefono };
  return { clienteNome: { equals: c.nome ?? "", mode: "insensitive" as const } };
}

// PROVA A VUOTO: dice cosa succederebbe, senza scrivere niente su Google.
export async function anteprima(sel: Selezione): Promise<{ riepilogo: Riepilogo; voci: VoceAnteprima[] }> {
  const clienti = await clientiSelezionati(sel);
  const giaFatti = new Set(
    (
      await prisma.contattoRubrica.findMany({
        where: { chiave: { in: clienti.map((c) => c.chiave) }, esito: "ok" },
        select: { chiave: true },
      })
    ).map((r) => r.chiave),
  );

  const voci: VoceAnteprima[] = clienti.map((c) => ({
    chiave: c.chiave,
    nome: c.nomeRubrica,
    telefono: c.telefono,
    azione: !c.telefono
      ? "senza-telefono"
      : giaFatti.has(c.chiave)
        ? "gia-salvato"
        : "creare",
  }));

  return {
    riepilogo: {
      daCreare: voci.filter((v) => v.azione === "creare").length,
      daAggiornare: voci.filter((v) => v.azione === "aggiornare").length,
      giaSalvati: voci.filter((v) => v.azione === "gia-salvato").length,
      senzaTelefono: voci.filter((v) => v.azione === "senza-telefono").length,
      totaleConsiderati: voci.length,
    },
    voci,
  };
}

export type EsitoSalvataggio = {
  creati: number;
  aggiornati: number;
  saltati: number; // già in rubrica ma non nostri, o senza telefono
  errori: { nome: string; messaggio: string }[];
};

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Salva davvero. Procede piano: la People API ha quote strette e una raffica di
// richieste viene rifiutata. Ogni esito finisce in ContattoRubrica.
export async function salvaInRubrica(sel: Selezione): Promise<EsitoSalvataggio> {
  if (!googleConfigurato()) {
    throw new Error("Google non è collegato: mancano GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.");
  }
  const token = await accessToken();
  const clienti = await clientiSelezionati(sel);
  const giaFatti = new Set(
    (
      await prisma.contattoRubrica.findMany({
        where: { chiave: { in: clienti.map((c) => c.chiave) }, esito: "ok" },
        select: { chiave: true },
      })
    ).map((r) => r.chiave),
  );

  const esito: EsitoSalvataggio = { creati: 0, aggiornati: 0, saltati: 0, errori: [] };

  for (const c of clienti) {
    if (!c.telefono || giaFatti.has(c.chiave)) {
      esito.saltati++;
      continue;
    }

    const dati = {
      nome: c.nomeRubrica,
      telefono: c.telefono,
      email: c.email,
      indirizzo: c.citta,
      note: `${c.ordini} ordini · ${Math.round(c.speso)} EUR`,
    };

    try {
      const esistente = await cercaPerTelefono(token, c.telefono);
      if (esistente && !esistente.nostro) {
        // contatto personale dell'utente: non si tocca
        esito.saltati++;
        await registra(c.chiave, "", dati.nome, "saltato", `già in rubrica come "${esistente.nome}"`);
        continue;
      }
      if (esistente) {
        await aggiornaContatto(token, esistente.resourceName, esistente.etag, dati);
        esito.aggiornati++;
        await registra(c.chiave, esistente.resourceName, dati.nome, "ok", null);
      } else {
        const creato = await creaContatto(token, dati);
        esito.creati++;
        await registra(c.chiave, creato.resourceName, dati.nome, "ok", null);
      }
    } catch (e) {
      const messaggio = (e as Error).message;
      esito.errori.push({ nome: dati.nome, messaggio });
      await registra(c.chiave, "", dati.nome, "errore", messaggio);
      // se Google ha smesso di rispondere (quota), inutile insistere
      if (/quota|troppe richieste|429/i.test(messaggio)) break;
    }

    // ritmo prudente: ~3 contatti al secondo
    await attesa(350);
  }

  return esito;
}

async function registra(
  chiave: string,
  resourceName: string,
  nome: string,
  esito: string,
  messaggio: string | null,
) {
  await prisma.contattoRubrica.upsert({
    where: { chiave },
    create: { chiave, resourceName, nome, esito, messaggio },
    update: { resourceName, nome, esito, messaggio },
  });
}
