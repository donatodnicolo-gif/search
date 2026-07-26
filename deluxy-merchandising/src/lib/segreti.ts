// Le chiavi che l'app usa per parlare con l'esterno (oggi: OpenAI).
//
// Stanno nel database **cifrate**, ma l'ambiente vince sempre: se una variabile
// è impostata su Vercel si usa quella. Così chi gestisce l'infrastruttura non
// si vede scavalcare da una chiave incollata in pagina, e chi usa l'app può
// comunque metterne una senza aspettare un deploy.

import { cifra, cifraturaConfigurata, decifra, impronta } from "./crypto";
import { prisma } from "./db";

export type NomeSegreto = "OPENAI_API_KEY";

export async function leggiSegreto(nome: NomeSegreto): Promise<string | null> {
  const daAmbiente = process.env[nome]?.trim();
  if (daAmbiente) return daAmbiente;
  if (!cifraturaConfigurata()) return null;
  const riga = await prisma.impostazione.findUnique({ where: { chiave: nome } });
  if (!riga) return null;
  try {
    return decifra(riga.valoreCifrato);
  } catch {
    // Succede se APP_SECRET è cambiata: meglio "non configurata" che un errore
    // incomprensibile in mezzo a una generazione.
    return null;
  }
}

export async function statoSegreto(nome: NomeSegreto): Promise<{
  presente: boolean;
  origine: "ambiente" | "app" | null;
  impronta: string | null;
  aggiornataIl: Date | null;
}> {
  if (process.env[nome]?.trim()) return { presente: true, origine: "ambiente", impronta: null, aggiornataIl: null };
  const riga = await prisma.impostazione.findUnique({ where: { chiave: nome } });
  if (!riga) return { presente: false, origine: null, impronta: null, aggiornataIl: null };
  return { presente: true, origine: "app", impronta: riga.impronta, aggiornataIl: riga.aggiornataIl };
}

export async function salvaSegreto(nome: NomeSegreto, valore: string): Promise<{ ok: boolean; errore?: string }> {
  const v = valore.trim();
  if (!v) return { ok: false, errore: "Valore vuoto." };
  if (!cifraturaConfigurata()) return { ok: false, errore: "APP_SECRET mancante: non salvo chiavi in chiaro." };
  await prisma.impostazione.upsert({
    where: { chiave: nome },
    create: { chiave: nome, valoreCifrato: cifra(v), impronta: impronta(v) },
    update: { valoreCifrato: cifra(v), impronta: impronta(v) },
  });
  return { ok: true };
}

export async function eliminaSegreto(nome: NomeSegreto): Promise<void> {
  await prisma.impostazione.deleteMany({ where: { chiave: nome } });
}
