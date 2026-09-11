/**
 * ⭐ 11/09/2026 (contratto §2-quater) — LA CITTÀ LETTA DALL'INDIRIZZO.
 *
 * Gli indirizzi dei partner arrivano nella forma di Google: «Via Vittorio Emanuele II, 48, 20052 Monza
 * MB, Italy». Il pezzo col CAP porta anche il nome della città e la sigla della provincia; dove il CAP
 * manca («Via Montenapoleone 10, Milano») vale l'ultimo pezzo che non è il paese e non ha cifre.
 *
 * ⚠️ Torna `null` quando non è sicura. Meglio un campo vuoto che una città sbagliata: chi la riceve la
 * scrive su una scheda di vendita, e nessuno rilegge un dato che sembra a posto.
 */
export function cittaDaIndirizzo(indirizzo: string | null | undefined): string | null {
  const pezzi = (indirizzo ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!pezzi.length) return null;
  const PAESI = /^(italia|italy|it)$/i;
  for (const p of pezzi) {
    const conCap = p.match(/^\d{5}\s+(.+?)(?:\s+[A-Z]{2})?$/);
    if (conCap?.[1]) return conCap[1].trim();
  }
  const candidati = pezzi.filter((p) => !PAESI.test(p) && !/\d/.test(p));
  const ultimo = candidati[candidati.length - 1];
  return ultimo && ultimo.length > 2 ? ultimo : null;
}

/**
 * ⭐ 11/09/2026 (contratto §2-quater) — L'ORA MINIMA, dagli orari di apertura.
 *
 * È la prima ora in cui il partner è aperto in un giorno qualsiasi della settimana: di là diventa
 * `custom.minimo_orario`, cioè da che ora il cliente può scegliere la consegna.
 *
 * ⚠️ Si arrotonda per ECCESSO: un negozio che apre alle 9:30 non può consegnare alle 9, e un'ora
 * minima troppo bassa promette al cliente una fascia che il partner non può fare.
 */
export function oraMinima(orari: { openTime?: string | null; closed?: boolean | null }[] | null | undefined): number | null {
  let minimo: number | null = null;
  for (const o of orari ?? []) {
    if (o.closed) continue;
    const m = (o.openTime ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const ora = Number(m[1]) + (Number(m[2]) > 0 ? 1 : 0);
    if (ora < 0 || ora > 23) continue;
    if (minimo === null || ora < minimo) minimo = ora;
  }
  return minimo;
}
