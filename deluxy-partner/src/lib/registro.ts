import { cookies } from "next/headers";
import { prisma } from "./db";
import { sessioneCorrente, type Ruolo } from "./auth";

// Registro delle modifiche (audit log). Un punto unico da cui le server action
// annotano "chi ha cambiato cosa e quando". La ricerca e la consultazione sono
// in /impostazioni/logs.
//
// CHI: con un ACCOUNT PERSONALE (email+password) o entrando dal Hub, il nome
// viaggia FIRMATO nel cookie di sessione ed è quello che si annota. Con la
// password di team un nome non esiste: si registra l'etichetta del profilo
// ("Accesso a password").
//
// ⚠️ 27/08/2026 — il ripiego sul vecchio cookie in chiaro `dp_utente` è stato
// TOLTO. Lo scriveva il client, quindi bastava un
// `document.cookie='dp_utente={"nome":"un collega"}'` perché le proprie
// modifiche comparissero in /impostazioni/logs sotto il nome di un altro: non
// è elevazione di privilegio, è ripudio dell'audit — e un registro che si può
// intestare a chi si vuole non è un registro. Nessun codice lo scrive più (i
// riferimenti rimasti lo cancellano soltanto) e le sessioni che lo portavano
// sono scadute da un pezzo.

export const COOKIE_UTENTE = "dp_utente";

export type Categoria =
  | "partner"
  | "fatture"
  | "vendite"
  | "pagamenti"
  | "saldi"
  | "transazioni"
  | "proforma"
  | "ordini"
  | "tasks"
  | "impostazioni"
  | "anagrafiche";

export type Attore = { utente: string; utenteId: string | null; ruolo: Ruolo | null };

// Ricava l'operatore corrente dai cookie: nome dal SSO se c'è, altrimenti
// un'etichetta legata al ruolo. Non lancia mai: l'audit non deve rompere l'azione.
export async function attoreCorrente(): Promise<Attore> {
  try {
    const jar = await cookies();
    const sessione = await sessioneCorrente(jar.get("dp_session")?.value);
    const ruolo = sessione?.ruolo ?? null;
    // Nome firmato nel cookie: è verificato, quindi ha la precedenza su tutto.
    if (sessione?.tipo === "utente" && sessione.nome.trim()) {
      return { utente: sessione.nome.trim(), utenteId: sessione.uid || null, ruolo };
    }
    const etichetta = ruolo === "sola_lettura" ? "Accesso sola lettura" : ruolo === "admin" ? "Accesso a password" : "Sistema";
    return { utente: etichetta, utenteId: null, ruolo };
  } catch {
    return { utente: "Sistema", utenteId: null, ruolo: null };
  }
}

type VoceRegistro = {
  azione: string;
  categoria: Categoria;
  entita?: string;
  entitaId?: string;
  partner?: string | null;
  dettaglio?: string | null;
};

// Scrive una voce nel registro. NON deve mai far fallire l'azione che la chiama:
// se il log va storto, l'operazione vera è già stata fatta e va confermata lo
// stesso — l'errore si annota nei log del server.
export async function registra(v: VoceRegistro): Promise<void> {
  try {
    const a = await attoreCorrente();
    await prisma.registroModifica.create({
      data: {
        utente: a.utente,
        utenteId: a.utenteId,
        ruolo: a.ruolo,
        azione: v.azione,
        categoria: v.categoria,
        entita: v.entita ?? null,
        entitaId: v.entitaId ?? null,
        partner: v.partner ?? null,
        dettaglio: v.dettaglio ?? null,
      },
    });
  } catch (e) {
    console.warn("[registro] impossibile annotare la modifica:", (e as Error).message);
  }
}

export const CATEGORIE: { valore: Categoria; etichetta: string }[] = [
  { valore: "partner", etichetta: "Partner" },
  { valore: "fatture", etichetta: "Fatture" },
  { valore: "vendite", etichetta: "Vendite" },
  { valore: "pagamenti", etichetta: "Pagamenti" },
  { valore: "saldi", etichetta: "Saldi e note" },
  { valore: "transazioni", etichetta: "Transazioni" },
  { valore: "proforma", etichetta: "Pro-forma" },
  { valore: "ordini", etichetta: "Ordini" },
  { valore: "tasks", etichetta: "Tasks" },
  { valore: "impostazioni", etichetta: "Impostazioni" },
  { valore: "anagrafiche", etichetta: "Anagrafiche" },
];
