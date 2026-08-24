"use server";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { authAttiva, leggiSessione, SESSION_COOKIE } from "./auth";
import { prisma } from "./db";
import { isAdmin } from "./ruoli";

// Chiavi API delle app che leggono l'organico (Hub, Budgets…), gestite dalla
// pagina /chiavi. La chiave in chiaro esiste per un istante: si mostra UNA
// volta a chi l'ha appena creata e nel database resta solo il suo SHA-256.

async function richiediAdmin(): Promise<{ ok: true } | { ok: false; messaggio: string }> {
  if (!authAttiva()) return { ok: true }; // sviluppo locale: aperto
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (!sessione) return { ok: false, messaggio: "Sessione scaduta: rientra." };
  if (!isAdmin(sessione.ruolo)) {
    return { ok: false, messaggio: "Solo un amministratore può gestire le chiavi." };
  }
  return { ok: true };
}

export type EsitoChiave = { ok: boolean; messaggio: string; chiave?: string };

export async function creaChiaveAction(nome: string, scrittura: boolean): Promise<EsitoChiave> {
  const permesso = await richiediAdmin();
  if (!permesso.ok) return { ok: false, messaggio: permesso.messaggio };

  const pulito = nome.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(pulito)) {
    return {
      ok: false,
      messaggio: "Nome non valido: lettere minuscole, numeri e trattini (es. deluxy-hub).",
    };
  }

  const chiave = `dlpe_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(chiave).digest("hex");

  try {
    await prisma.apiKey.upsert({
      where: { nome: pulito },
      create: { nome: pulito, hash, scrittura },
      update: { hash, scrittura, attiva: true },
    });
  } catch {
    return { ok: false, messaggio: "Non sono riuscito a salvare la chiave (database)." };
  }

  revalidatePath("/chiavi");
  return {
    ok: true,
    messaggio: `Chiave di «${pulito}» pronta: copiala ora, non sarà più recuperabile.`,
    chiave,
  };
}

export async function revocaChiaveAction(id: string): Promise<EsitoChiave> {
  const permesso = await richiediAdmin();
  if (!permesso.ok) return { ok: false, messaggio: permesso.messaggio };

  try {
    await prisma.apiKey.update({ where: { id }, data: { attiva: false } });
  } catch {
    return { ok: false, messaggio: "Chiave non trovata." };
  }
  revalidatePath("/chiavi");
  return { ok: true, messaggio: "Chiave revocata: da adesso non funziona più." };
}

export async function riattivaChiaveAction(id: string): Promise<EsitoChiave> {
  const permesso = await richiediAdmin();
  if (!permesso.ok) return { ok: false, messaggio: permesso.messaggio };

  try {
    await prisma.apiKey.update({ where: { id }, data: { attiva: true } });
  } catch {
    return { ok: false, messaggio: "Chiave non trovata." };
  }
  revalidatePath("/chiavi");
  return { ok: true, messaggio: "Chiave riattivata." };
}
