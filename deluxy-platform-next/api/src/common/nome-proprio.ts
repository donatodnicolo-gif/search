/**
 * NOMI PROPRI IN TITLE-CASE (regola dell'utente, 31/08/2026): prima lettera
 * maiuscola, resto minuscolo — per nome, cognome e insegna dei partner.
 *
 * ⚠️ Si capitalizza la prima lettera di OGNI sequenza di lettere, così i pezzi
 * separati da spazi, trattini, apostrofi o parentesi vengono tutti sistemati:
 * «de rosa» → «De Rosa», «d'angelo» → «D'Angelo», «(industries)» →
 * «(Industries)». Un semplice capitalize della prima lettera li perderebbe.
 */
function capitalizzaLettere(s: string): string {
  return s
    .toLocaleLowerCase('it')
    .replace(/\p{L}+/gu, (w) => w.charAt(0).toLocaleUpperCase('it') + w.slice(1));
}

/** Nome di persona: ogni parola capitalizzata. Vuoto/null tornano com'erano. */
export function titleCaseNome(s: string | null | undefined): string | null | undefined {
  if (s == null) return s;
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return capitalizzaLettere(t);
}

/**
 * Insegna di un partner: come il nome, ma preserva gli ACRONIMI tutto-maiuscoli
 * corti (≤3 lettere: NCC, DHL, MB, S.P.A.…) — capitalizzarli («Ncc») sarebbe
 * sbagliato. «ARMANI FIORI» → «Armani Fiori»; «NCC» → «NCC».
 */
export function titleCaseInsegna(s: string | null | undefined): string | null | undefined {
  if (s == null) return s;
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return t
    .split(' ')
    .map((p) => {
      const soloLettere = p.replace(/[^\p{L}]/gu, '');
      if (soloLettere.length > 0 && soloLettere.length <= 3 && p === p.toLocaleUpperCase('it')) return p;
      return capitalizzaLettere(p);
    })
    .join(' ');
}
