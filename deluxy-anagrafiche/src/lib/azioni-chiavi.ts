"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { AMBITI, normalizzaNomeChiave, permessiDa } from "./chiavi";
import { prisma } from "./db";

// Gestione delle chiavi API dalla UI (pagina /chiavi). Fa esattamente quello
// che fa `npm run chiave`, ma senza terminale: nel database finisce solo lo
// SHA-256, la chiave in chiaro torna una volta sola a chi l'ha creata.
//
// La UI è protetta dalla password unica dell'app (middleware): chi entra qui
// può creare chiavi di scrittura, quindi la password vale quanto le chiavi.

export type EsitoChiave =
  | { ok: true; nome: string; chiave?: string; messaggio?: string }
  | { ok: false; errore: string };

function generaChiave() {
  const chiave = `dlxk_${randomBytes(24).toString("hex")}`;
  return {
    chiave,
    hash: createHash("sha256").update(chiave).digest("hex"),
    // Primi 12 caratteri: bastano a riconoscerla, non a usarla.
    prefisso: `${chiave.slice(0, 12)}…`,
  };
}

function ambitiDaForm(fd: FormData): string[] {
  return fd.getAll("ambiti").map(String).filter((a) => AMBITI.some((x) => x.id === a));
}

export async function creaChiave(fd: FormData): Promise<EsitoChiave> {
  const nome = normalizzaNomeChiave(String(fd.get("nome") ?? ""));
  if (!nome) return { ok: false, errore: "Serve il nome dell'app (lettere, numeri e trattini)." };
  const esistente = await prisma.apiKey.findUnique({ where: { nome } });
  if (esistente) {
    return {
      ok: false,
      errore: `Esiste già una chiave "${nome}": rigenerala dall'elenco invece di crearne un'altra (il nome è anche la sorgente nella provenienza dei dati).`,
    };
  }
  const note = String(fd.get("note") ?? "").trim() || null;
  const { chiave, hash, prefisso } = generaChiave();
  await prisma.apiKey.create({
    data: { nome, hash, prefisso, note, ...permessiDa(ambitiDaForm(fd)) },
  });
  revalidatePath("/chiavi");
  return { ok: true, nome, chiave, messaggio: `Chiave "${nome}" creata.` };
}

// Rigenera: la vecchia chiave smette di valere all'istante. Va rimessa nel
// .env dell'app client (e su Vercel) o l'integrazione si ferma.
export async function rigeneraChiave(id: string): Promise<EsitoChiave> {
  const record = await prisma.apiKey.findUnique({ where: { id } });
  if (!record) return { ok: false, errore: "Chiave non trovata." };
  const { chiave, hash, prefisso } = generaChiave();
  await prisma.apiKey.update({ where: { id }, data: { hash, prefisso, attiva: true } });
  revalidatePath("/chiavi");
  return {
    ok: true,
    nome: record.nome,
    chiave,
    messaggio: `Chiave "${record.nome}" rigenerata: la precedente non vale più.`,
  };
}

export async function aggiornaChiave(id: string, fd: FormData): Promise<EsitoChiave> {
  const record = await prisma.apiKey.findUnique({ where: { id } });
  if (!record) return { ok: false, errore: "Chiave non trovata." };
  const note = String(fd.get("note") ?? "").trim() || null;
  await prisma.apiKey.update({
    where: { id },
    data: { note, ...permessiDa(ambitiDaForm(fd)) },
  });
  revalidatePath("/chiavi");
  return { ok: true, nome: record.nome, messaggio: `Permessi di "${record.nome}" aggiornati.` };
}

// Sospensione reversibile: la chiave resta ma non autentica più (`attiva`
// è controllata in `autentica()`). È il modo giusto per "spegnere" un'app
// senza perdere la traccia di chi era.
export async function impostaAttivaChiave(id: string, attiva: boolean): Promise<EsitoChiave> {
  const record = await prisma.apiKey.findUnique({ where: { id } });
  if (!record) return { ok: false, errore: "Chiave non trovata." };
  await prisma.apiKey.update({ where: { id }, data: { attiva } });
  revalidatePath("/chiavi");
  return {
    ok: true,
    nome: record.nome,
    messaggio: attiva ? `Chiave "${record.nome}" riattivata.` : `Chiave "${record.nome}" sospesa.`,
  };
}

// Cancellazione definitiva. Il record sparisce: se un'app la sta ancora usando
// prende 401. La provenienza già scritta con quel nome resta dov'è.
export async function eliminaChiave(id: string): Promise<EsitoChiave> {
  const record = await prisma.apiKey.findUnique({ where: { id } });
  if (!record) return { ok: false, errore: "Chiave non trovata." };
  await prisma.apiKey.delete({ where: { id } });
  revalidatePath("/chiavi");
  return { ok: true, nome: record.nome, messaggio: `Chiave "${record.nome}" eliminata.` };
}
