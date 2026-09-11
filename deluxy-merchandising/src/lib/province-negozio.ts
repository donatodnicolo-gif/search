// **Le province, come le scrivono i siti.**
//
// `custom.nations_availability` non contiene sigle: contiene voci intere come
// `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI)`. I nomi non seguono una
// regola — c'è ROMA in italiano e MILAN in inglese, MONZA AND BRIANZA per esteso
// — quindi **non si generano**: si imparano dalle schede che quel campo ce
// l'hanno già (964 al 11/09/2026).
//
// La piattaforma consegne, invece, i partner li descrive con le **sigle**
// (`MI`, `RM`, `VT`). Questo modulo fa il ponte fra le due lingue.

import { prisma } from "./db";

/** Da una stringa `nations_availability` alle voci intere che contiene. */
export function vociProvincia(valore: unknown): string[] {
  return String(valore ?? "")
    .split(/\s+(?=[A-Z]{3,}-)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** La sigla dentro una voce: `ITALY-MILAN(MI)` → `MI`. */
export function siglaDiVoce(voce: string): string | null {
  const m = voce.match(/\(([A-Za-z]{2})\)\s*$/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * La mappa **sigla → voce intera**, imparata dai prodotti attivi. Si prende la
 * grafia più usata: se due schede scrivono la stessa provincia in due modi,
 * vince quella che compare di più, non l'ultima letta.
 */
export async function vociPerSigla(): Promise<Map<string, string>> {
  const righe = await prisma.prodotto.findMany({
    where: { statoShopify: "ACTIVE", metafieldShopify: { not: undefined } },
    select: { metafieldShopify: true },
    take: 6000,
  });
  const conta = new Map<string, Map<string, number>>();
  for (const r of righe) {
    const mf = r.metafieldShopify;
    if (!mf || typeof mf !== "object" || Array.isArray(mf)) continue;
    const valore = (mf as Record<string, unknown>)["custom.nations_availability"];
    if (!valore) continue;
    for (const voce of vociProvincia(valore)) {
      const sigla = siglaDiVoce(voce);
      if (!sigla) continue;
      const m = conta.get(sigla) ?? new Map<string, number>();
      m.set(voce, (m.get(voce) ?? 0) + 1);
      conta.set(sigla, m);
    }
  }
  const mappa = new Map<string, string>();
  for (const [sigla, m] of conta) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) mappa.set(sigla, top[0]);
  }
  return mappa;
}

/**
 * Da un elenco di sigle al valore da scrivere nel campo. Le sigle che non
 * abbiamo mai visto su nessuna scheda **si lasciano fuori e si dicono**:
 * inventare `ITALY-VITERBO(VT)` quando nessun sito lo scrive così vuol dire
 * mettere in vetrina una provincia che il tema non sa leggere.
 */
export function componiProvince(
  sigle: string[],
  mappa: Map<string, string>,
): { valore: string; fuori: string[] } {
  const voci: string[] = [];
  const fuori: string[] = [];
  for (const s of sigle.map((x) => x.trim().toUpperCase()).filter(Boolean)) {
    const voce = mappa.get(s);
    if (voce) voci.push(voce);
    else fuori.push(s);
  }
  return { valore: voci.join(" "), fuori };
}
