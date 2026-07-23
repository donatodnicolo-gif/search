import { cookies } from "next/headers";
import { prisma } from "./db";
import { ruoloDaSessione, type Ruolo } from "./auth";

// Registro delle modifiche (audit log). Un punto unico da cui le server action
// annotano "chi ha cambiato cosa e quando". La ricerca e la consultazione sono
// in /impostazioni/logs.
//
// CHI: l'app entra con una password di team, quindi di suo conosce solo il
// ruolo. Il nome della persona arriva dal Single Sign-On del Hub (il token porta
// `nome`), che viene messo nel cookie `dp_utente` al momento dell'ingresso. Se si
// entra con la password diretta, non c'è un nome: si registra l'etichetta del
// profilo ("Accesso a password").

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
    const ruolo = await ruoloDaSessione(jar.get("dp_session")?.value);
    const raw = jar.get(COOKIE_UTENTE)?.value;
    if (raw) {
      try {
        const p = JSON.parse(decodeURIComponent(raw)) as { nome?: string; uid?: string };
        if (p.nome?.trim()) return { utente: p.nome.trim(), utenteId: p.uid ?? null, ruolo };
      } catch {
        // cookie in formato vecchio/manomesso: si ignora e si usa il fallback
      }
    }
    const etichetta = ruolo === "sola_lettura" ? "Accesso sola lettura" : ruolo === "admin" ? "Accesso a password" : "Sistema";
    return { utente: etichetta, utenteId: null, ruolo };
  } catch {
    return { utente: "Sistema", utenteId: null, ruolo: null };
  }
}

// Serializza il nome per il cookie `dp_utente` (lo scrive il flusso SSO).
export function cookieUtente(nome: string, uid?: string): string {
  return encodeURIComponent(JSON.stringify({ nome, uid }));
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
