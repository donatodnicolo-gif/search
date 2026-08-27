import { prisma } from "./db";
import { headers } from "next/headers";

// IL FRENO SUI TENTATIVI DI ACCESSO (27/08/2026).
//
// Prima non c'era **nessun** limite: si potevano provare password all'infinito,
// alla velocita' della rete. Detto onestamente, il rischio misurato era basso —
// la password di team e' lunga, quella degli utenti passa da `scrypt` (che
// costa CPU a ogni tentativo) e gli account personali sono pochissimi. Ma
// «lungo» e' una proprieta' della password di oggi, non dell'app: il giorno che
// qualcuno ne sceglie una corta, l'app non deve essere l'unica cosa che non
// oppone resistenza.
//
// ⚠️ Il conteggio sta a **database** e non in una variabile: su Vercel ogni
// richiesta puo' cadere su un'istanza diversa, quindi un contatore in memoria
// conta per istanza e si azzera da solo. Sembra un freno, non lo e'.
//
// ⭐ Il freno **non blocca**: rallenta. Dopo `SOGLIA` tentativi falliti nella
// finestra, la risposta arriva comunque, ma dopo un'attesa che cresce. Chi ha
// davvero sbagliato la password se ne accorge appena; chi ne prova migliaia
// paga un secondo alla volta. Un blocco secco, invece, sarebbe un modo per
// chiudere fuori un collega conoscendo solo il suo indirizzo.
const FINESTRA_MINUTI = 15;
const SOGLIA = 5;
const ATTESA_MAX_MS = 5000;

/** Da dove arriva la richiesta, per quel che se ne puo' sapere dietro un proxy. */
export async function origineRichiesta(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || h.get("x-real-ip") || "ignota").trim().slice(0, 60);
}

/**
 * Quanto e' gia' stato sbagliato da qui, e l'attesa che ne consegue.
 * Va chiamata **prima** di controllare la password.
 */
export async function frena(chiave: string): Promise<void> {
  const da = new Date(Date.now() - FINESTRA_MINUTI * 60_000);
  const falliti = await prisma.tentativoAccesso
    .count({ where: { chiave, quando: { gte: da } } })
    .catch(() => 0);
  if (falliti < SOGLIA) return;
  const attesa = Math.min(ATTESA_MAX_MS, (falliti - SOGLIA + 1) * 500);
  await new Promise((r) => setTimeout(r, attesa));
}

/** Un tentativo andato male. */
export async function segnaFallito(chiave: string): Promise<void> {
  await prisma.tentativoAccesso.create({ data: { chiave } }).catch(() => null);
  // Pulizia opportunista: le righe vecchie non servono a nessuno e questa
  // tabella non ha altro custode.
  const vecchie = new Date(Date.now() - FINESTRA_MINUTI * 60_000 * 4);
  await prisma.tentativoAccesso.deleteMany({ where: { quando: { lt: vecchie } } }).catch(() => null);
}

/** Entrato: si azzera il conto di questa origine. */
export async function segnaRiuscito(chiave: string): Promise<void> {
  await prisma.tentativoAccesso.deleteMany({ where: { chiave } }).catch(() => null);
}
