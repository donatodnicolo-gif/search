// **Quanto del venduto resta a Deluxy**, misurato invece che stimato.
//
// Modello C (deciso il 28/07/2026): sull'ecommerce Deluxy fa l'intermediario —
// il partner documenta la vendita al cliente e il denaro che gli si gira è una
// partita di giro, non un costo. La quota che resta è quindi, letteralmente,
// «venduto meno quello che è uscito verso i partner».
//
// Le categorie che contano sono quelle marcate **«quota partner»** nel CFO: è
// l'unico posto in cui questa informazione vive, e cambiarla lì cambia insieme
// il conto economico e questa misura, che è esattamente quello che deve
// succedere.
//
// Sta in un file suo perché tocca banca e categorie (quindi Prisma), mentre
// `venduto.ts` deve restare leggero.

import { caricaCategorie } from "./cfo";
import { fetchSpeseBanca } from "./finance";
import { QUOTA_STIMATA, quotaMisurata, sommaMesi, type Quota } from "./venduto";

export type { Quota };

export async function misuraQuota(
  anno: number,
  mesi: number[],
  vendutoMese: number[]
): Promise<Quota> {
  if (mesi.length === 0) return QUOTA_STIMATA;
  const dal = Math.min(...mesi);
  const al = Math.max(...mesi);
  const [spese, categorie] = await Promise.all([
    fetchSpeseBanca({ anno, dal, al }),
    caricaCategorie(),
  ]);
  if (!spese.ok) return QUOTA_STIMATA;

  const quotaPartner = new Set(categorie.filter((c) => c.quotaPartner).map((c) => c.id));
  const predefinita = categorie.find((c) => c.predefinita) ?? null;
  const partnerMese = Array(12).fill(0) as number[];
  const bancaMese = Array(12).fill(0) as number[];
  for (const c of spese.dati.controparti) {
    const cat = trovaCategoria(c.controparte, categorie) ?? predefinita;
    for (let i = 0; i < 12; i++) {
      const v = c.perMese[i] ?? 0;
      bancaMese[i] += v;
      if (cat && quotaPartner.has(cat.id)) partnerMese[i] += v;
    }
  }

  const venduto = sommaMesi(vendutoMese, mesi);
  const pagato = sommaMesi(partnerMese, mesi);
  const mesiConVenduto = mesi.filter((m) => (vendutoMese[m - 1] ?? 0) > 0).length;
  const mesiConBanca = mesi.filter((m) => (bancaMese[m - 1] ?? 0) > 0).length;
  return quotaMisurata(venduto, pagato, mesiConVenduto, mesiConBanca) ?? QUOTA_STIMATA;
}

// Copia locale della regola di match, per non importare `categoriaDi` e con
// essa mezza catena: qui serve solo l'id della categoria.
function trovaCategoria<T extends { id: string; regole: { match: string; esatto: boolean }[] }>(
  controparte: string,
  categorie: T[]
): T | null {
  const c = controparte.toLowerCase();
  let migliore: { cat: T; peso: number } | null = null;
  for (const cat of categorie) {
    for (const r of cat.regole) {
      const m = r.match.trim().toLowerCase();
      if (!m) continue;
      if (r.esatto ? c === m : c.includes(m)) {
        const peso = m.length + (r.esatto ? 1000 : 0);
        if (!migliore || peso > migliore.peso) migliore = { cat, peso };
      }
    }
  }
  return migliore?.cat ?? null;
}
