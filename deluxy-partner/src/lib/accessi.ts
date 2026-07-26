import { prisma } from "./db";
import type { Ruolo } from "./auth";

// Registro degli ACCESSI all'app: si scrive nel momento in cui qualcuno ENTRA
// (login a password o ingresso dal Hub via SSO), non a ogni pagina aperta. Il
// cookie di sessione dura 30 giorni: una persona compare qui quando fa il
// login, poi naviga per settimane senza generare altre righe. Per «cosa ha
// fatto» c'è il registro modifiche (`registro.ts`), che è la sua metà.
//
// Non deve mai far fallire il login: se la scrittura va storta si annota nei
// log del server e si va avanti — meglio un accesso non tracciato che una
// persona chiusa fuori.

export type Via = "password" | "sso";

/** IP del chiamante. Su Vercel arriva in `x-forwarded-for` come catena
 *  "client, proxy1, proxy2": il primo è quello vero. */
function ipDaHeader(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return h.get("x-real-ip");
}

export async function registraAccesso(
  v: {
    utente: string;
    utenteId?: string | null;
    ruolo?: Ruolo | string | null;
    via: Via;
    esito?: "ok" | "fallito";
  },
  h: Headers
): Promise<void> {
  try {
    await prisma.accessoApp.create({
      data: {
        utente: v.utente,
        utenteId: v.utenteId ?? null,
        ruolo: v.ruolo ? String(v.ruolo) : null,
        via: v.via,
        esito: v.esito ?? "ok",
        ip: ipDaHeader(h),
        agente: (h.get("user-agent") ?? "").slice(0, 300) || null,
      },
    });
  } catch (e) {
    console.warn("[accessi] impossibile annotare l'accesso:", (e as Error).message);
  }
}

/** Etichetta corta del dispositivo, per non mostrare in tabella l'user agent
 *  intero (che è illeggibile). Riconoscimento grossolano e dichiarato tale:
 *  serve a distinguere «è un altro dispositivo», non a identificare il browser. */
export function dispositivo(agente: string | null): string {
  if (!agente) return "—";
  const a = agente.toLowerCase();
  const so = a.includes("iphone") || a.includes("ipad")
    ? "iPhone/iPad"
    : a.includes("android")
      ? "Android"
      : a.includes("mac os") || a.includes("macintosh")
        ? "Mac"
        : a.includes("windows")
          ? "Windows"
          : a.includes("linux")
            ? "Linux"
            : "—";
  const browser = a.includes("edg/")
    ? "Edge"
    : a.includes("chrome/") && !a.includes("edg/")
      ? "Chrome"
      : a.includes("firefox/")
        ? "Firefox"
        : a.includes("safari/")
          ? "Safari"
          : "";
  return [browser, so].filter((x) => x && x !== "—").join(" su ") || "—";
}

export const VIE: Record<string, { label: string; badge: string }> = {
  sso: { label: "Dal portale (Hub)", badge: "blue" },
  password: { label: "Password di team", badge: "neutral" },
};
