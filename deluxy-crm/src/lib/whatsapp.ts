import { chiaveApp } from "./chiavi-app";

// WhatsApp dal CRM, su DUE canali — e la differenza va capita:
// · «api» — parte dal numero WhatsApp Business del marchio, via Customer
//   Service (che possiede token e numeri). ⚠️ Meta consegna il testo libero
//   solo se il cliente ha scritto a quel numero nelle ULTIME 24 ORE: a freddo
//   l'invio fallisce con un errore chiaro, e va mostrato, non riprovato.
// · «wame» — si apre la chat sul WhatsApp DELL'OPERATORE col testo già
//   pronto (wa.me): lo manda una persona dal suo telefono, senza limiti di
//   finestra. Per i clienti top è spesso il canale più giusto.

const BASE_DEFAULT = "https://deluxy-messaging.vercel.app";

export type NumeroWA = { phoneNumberId: string; nome: string; numeroVisibile: string; brand: string; attivo: boolean };

async function base(): Promise<string> {
  return ((await chiaveApp("MESSAGGI_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
}

export async function numeriWA(): Promise<{ ok: true; numeri: NumeroWA[] } | { ok: false; errore: string }> {
  const k = await chiaveApp("MESSAGGI_API_KEY");
  if (!k) return { ok: false, errore: "Manca MESSAGGI_API_KEY." };
  try {
    const res = await fetch(`${await base()}/api/v1/whatsapp/numeri`, {
      headers: { "x-api-key": k },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => null)) as { numeri?: NumeroWA[]; errore?: string } | null;
    if (!res.ok) return { ok: false, errore: corpo?.errore ?? `Il Customer Service risponde ${res.status}.` };
    return { ok: true, numeri: corpo?.numeri ?? [] };
  } catch {
    return { ok: false, errore: "Il Customer Service non risponde." };
  }
}

export async function inviaWA(dati: {
  a: string;
  testo: string;
  numeroId?: string;
}): Promise<{ ok: true } | { ok: false; errore: string }> {
  const k = await chiaveApp("MESSAGGI_API_KEY");
  if (!k) return { ok: false, errore: "Manca MESSAGGI_API_KEY." };
  try {
    const res = await fetch(`${await base()}/api/v1/whatsapp`, {
      method: "POST",
      headers: { "x-api-key": k, "Content-Type": "application/json" },
      body: JSON.stringify(dati),
      signal: AbortSignal.timeout(20_000),
    });
    const corpo = (await res.json().catch(() => null)) as { ok?: boolean; errore?: string } | null;
    if (!res.ok || !corpo?.ok) {
      const errore = corpo?.errore ?? `Il Customer Service risponde ${res.status}.`;
      // L'errore della finestra 24h di Meta, tradotto in parole che aiutano.
      if (/re.?engagement|24|131047/i.test(errore)) {
        return {
          ok: false,
          errore:
            "Finestra WhatsApp chiusa: questo cliente non ha scritto al nostro numero nelle ultime 24 ore, e Meta non consegna messaggi liberi a freddo. Usa «Apri su WhatsApp» (parte dal tuo telefono).",
        };
      }
      return { ok: false, errore };
    }
    return { ok: true };
  } catch {
    return { ok: false, errore: "Il Customer Service non risponde: il messaggio non è partito." };
  }
}

// Il numero come lo vuole WhatsApp: solo cifre col prefisso internazionale.
// I telefoni negli ordini sono spesso italiani senza prefisso: il ripiego +39
// vale solo per i numeri che sembrano cellulari italiani (10 cifre, inizia
// per 3) — sugli altri non si indovina.
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let n = telefono.replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (!n.startsWith("+")) {
    if (/^3\d{8,9}$/.test(n)) n = `+39${n}`;
    else if (/^39\d{9,10}$/.test(n)) n = `+${n}`;
    else return null;
  }
  const cifre = n.slice(1);
  if (cifre.length < 8 || cifre.length > 15) return null;
  return n;
}

export function linkWaMe(numero: string, testo: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(testo)}`;
}
