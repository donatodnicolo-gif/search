// Il secondo fattore per entrare nell'app: un codice a 6 cifre da un'app di
// autenticazione (TOTP), oltre alla password del team.
//
// Perché serve: la password è **una sola e condivisa**. Basta che finisca in
// una chat, in uno screenshot o sul telefono sbagliato e chiunque vede budget,
// premi e stipendi. Il codice cambia ogni trenta secondi e sta su un
// dispositivo: saperla non basta più.
//
// **Non ci si può chiudere fuori**, ed è la regola che governa questo file:
//  - finché nessuno ha registrato un'app di autenticazione, il login resta
//    quello di prima (solo password);
//  - il codice diventa obbligatorio **solo dopo** che se ne è digitato uno
//    valido: un segreto generato e mai confermato non blocca nessuno;
//  - se `APP_SECRET` manca, il segreto non è né scrivibile né leggibile, e
//    l'app si comporta come se il secondo fattore non ci fosse — invece di
//    rifiutare tutti perché non riesce a decifrare.

import { prisma } from "./db";
import { cifra, cifraturaConfigurata, decifra } from "./crypto";

// Sta nella stessa tabella delle chiavi API (cifrata allo stesso modo), ma con
// un nome che NON è nell'elenco di Configurazione → Chiavi: da lì non si può
// scrivere né leggere, si gestisce solo da Configurazione → Accesso.
const NOME = "ACCESSO_TOTP";
const ATTIVO = "attivo";

export type StatoAccesso = {
  // Il codice è obbligatorio all'ingresso.
  obbligatorio: boolean;
  // Esiste un segreto generato ma non ancora confermato con un codice.
  daConfermare: boolean;
  // La cifratura è configurata: senza, non si può registrare niente.
  cifraturaOk: boolean;
};

async function riga() {
  if (!cifraturaConfigurata()) return null;
  return prisma.chiaveApi.findUnique({ where: { nome: NOME } }).catch(() => null);
}

export async function statoAccesso(): Promise<StatoAccesso> {
  const r = await riga();
  // Non basta che la riga esista: il segreto deve essere anche **leggibile**.
  // Se `APP_SECRET` è cambiata, decifrarlo fallisce — e un «codice
  // obbligatorio» su un segreto illeggibile chiederebbe un codice che nessuno
  // può sbagliare né azzeccare: peggio che non averlo.
  let leggibile = false;
  if (r) {
    try {
      leggibile = Boolean(decifra(r.cifrato));
    } catch {
      leggibile = false;
    }
  }
  return {
    obbligatorio: Boolean(r && r.note === ATTIVO && leggibile),
    daConfermare: Boolean(r && r.note !== ATTIVO && leggibile),
    cifraturaOk: cifraturaConfigurata(),
  };
}

// Il segreto in chiaro, per verificare un codice. `null` se non c'è o se non
// si riesce a decifrare (APP_SECRET cambiata): in quel caso il secondo fattore
// si comporta come se non ci fosse, invece di bloccare l'accesso a tutti.
export async function segretoAccesso(): Promise<string | null> {
  const r = await riga();
  if (!r) return null;
  try {
    return decifra(r.cifrato) || null;
  } catch {
    return null;
  }
}

export async function salvaSegreto(segreto: string): Promise<void> {
  await prisma.chiaveApi.upsert({
    where: { nome: NOME },
    create: { nome: NOME, cifrato: cifra(segreto), note: null },
    update: { cifrato: cifra(segreto), note: null },
  });
}

export async function attiva(): Promise<void> {
  await prisma.chiaveApi.update({ where: { nome: NOME }, data: { note: ATTIVO } }).catch(() => null);
}

export async function rimuovi(): Promise<void> {
  await prisma.chiaveApi.delete({ where: { nome: NOME } }).catch(() => null);
}
