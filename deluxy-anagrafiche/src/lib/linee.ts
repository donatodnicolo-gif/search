import "server-only";
import { INTERESSI } from "./interessi";

// Linee di interesse dal MASTER (Deluxy Scout). Sola lettura, chiave condivisa
// `LINEE_API_KEY` (secret server-side). In cache 1h: le linee cambiano di rado.
// Se il master non risponde, fallback al catalogo statico allineato.
const MASTER = "https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/linee?soloAttive=1";

export async function getLinee(): Promise<string[]> {
  const key = process.env.LINEE_API_KEY;
  if (!key) return [...INTERESSI];
  try {
    const res = await fetch(MASTER, {
      headers: { "x-api-key": key },
      next: { revalidate: 3600 },
      // Il master non deve mai bloccare le pagine: se è lento, fallback statico.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { linee?: { nome?: string }[] };
    const nomi = (json.linee ?? []).map((l) => l?.nome?.trim()).filter((n): n is string => !!n);
    return nomi.length ? nomi : [...INTERESSI];
  } catch {
    return [...INTERESSI];
  }
}
