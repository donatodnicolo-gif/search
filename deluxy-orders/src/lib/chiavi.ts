import { createHash, randomBytes } from "crypto";
import { prisma } from "./db";

// LE CHIAVI API DELLE ALTRE APP.
//
// Regola unica, e sta qui: nel database finisce **solo lo SHA-256**. La chiave in
// chiaro esiste per il tempo di una risposta — si mostra una volta a chi l'ha
// chiesta e poi non è più recuperabile da nessuno, nemmeno da noi. Se si perde,
// se ne rigenera un'altra: è più sicuro che poterla rileggere.
//
// Il prefisso `dlxo_` serve a riconoscerla a colpo d'occhio dentro un `.env`
// pieno di stringhe uguali, e a cercarla se un giorno finisce dove non deve.
//
// Questo file è l'unico posto dove una chiave nasce: la usano sia la pagina
// Impostazioni sia lo script da riga di comando (`npm run chiave`). Due modi di
// generare la stessa cosa divergono, e sulle credenziali divergere vuol dire
// scoprirlo il giorno che una non funziona.

const PREFISSO = "dlxo_";

export function generaChiave(): { chiave: string; hash: string } {
  const chiave = `${PREFISSO}${randomBytes(24).toString("hex")}`;
  return { chiave, hash: createHash("sha256").update(chiave).digest("hex") };
}

// Il nome è l'identità della chiave: una per app. Si normalizza perché
// «Deluxy Search» e «deluxy-search» sono la stessa app, e due righe con lo
// stesso significato rendono impossibile capire chi sta chiamando.
export function nomeNormalizzato(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type EsitoChiave =
  | { ok: true; nome: string; chiave: string; rigenerata: boolean }
  | { ok: false; motivo: string };

// Crea la chiave di un'app. Se il nome esiste già, `rigenera` decide: o si
// rifiuta (per non spegnere per sbaglio l'app che sta usando quella chiave), o
// si sostituisce il segreto lasciando lo stesso nome.
export async function creaChiave(
  nomeGrezzo: string,
  scrittura: boolean,
  rigenera = false,
): Promise<EsitoChiave> {
  const nome = nomeNormalizzato(nomeGrezzo);
  if (nome.length < 3) return { ok: false, motivo: "Serve un nome di almeno tre lettere (es. deluxy-marketing)." };

  const esistente = await prisma.apiKey.findUnique({ where: { nome } });
  if (esistente && !rigenera) {
    return {
      ok: false,
      motivo: `Esiste già una chiave per «${nome}». Rigenerala dalla sua riga se l'hai persa: la vecchia smette di funzionare all'istante.`,
    };
  }

  const { chiave, hash } = generaChiave();
  await prisma.apiKey.upsert({
    where: { nome },
    create: { nome, hash, scrittura },
    update: { hash, scrittura, attiva: true },
  });
  return { ok: true, nome, chiave, rigenerata: Boolean(esistente) };
}

export async function rigeneraChiave(id: string): Promise<EsitoChiave> {
  const k = await prisma.apiKey.findUnique({ where: { id } });
  if (!k) return { ok: false, motivo: "Chiave non trovata." };
  const { chiave, hash } = generaChiave();
  await prisma.apiKey.update({ where: { id }, data: { hash, attiva: true } });
  return { ok: true, nome: k.nome, chiave, rigenerata: true };
}

export async function eliminaChiave(id: string): Promise<{ ok: boolean; motivo?: string }> {
  const k = await prisma.apiKey.findUnique({ where: { id } });
  if (!k) return { ok: false, motivo: "Chiave non trovata." };
  await prisma.apiKey.delete({ where: { id } });
  return { ok: true };
}
