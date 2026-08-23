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
import { caricaVenduto, QUOTA_STIMATA, quotaMisurata, sommaMesi, type Quota } from "./venduto";
import { primoMeseAperto } from "./periodo";

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

// ---- La quota D2C dell'anno: **una sola risposta per tutta l'app** ----
//
// ⚠️ Nata da un guasto trovato il 23/08/2026 riconciliando i numeri: la stessa
// voce «EBITDA» valeva **tre cose diverse** su tre pagine, perché ognuna
// decideva per conto suo la quota con cui il D2C entra a conto economico —
// `/consuntivo` non ne passava nessuna (quindi **100%**, cioè il venduto lordo),
// `/dashboard` chiamava `misuraQuota` **con il venduto vuoto** (quindi il
// ripiego stimato del **40%** travestito da misura), `/pl` usava quella vera
// (**27,7%**). Sull'anno facevano +333.731 €, −133.599 € e −229.401 €.
//
// ⭐ La lezione: `misuraQuota(anno, mesi, [])` **non fallisce** — restituisce la
// stima, e la stima non si distingue dalla misura guardando il numero. Una
// funzione che sa arrangiarsi va chiamata da un posto solo.
//
// La regola: si misura sui **mesi chiusi** (dove venduto e banca sono entrambi
// veri) e si usa quella per tutto l'anno. Sui mesi che restano non c'è niente da
// misurare, e la quota è una caratteristica del modello, non della stagione.
export async function quotaDeluxyAnno(
  anno: number,
  maisons: { slug: string; nome: string }[]
): Promise<Quota> {
  const aperto = primoMeseAperto(anno);
  const mesiChiusi = Array.from({ length: Math.min(aperto - 1, 12) }, (_, i) => i + 1);
  if (mesiChiusi.length === 0) return QUOTA_STIMATA;
  const vend = await caricaVenduto(anno, maisons);
  if (!vend.ok) return QUOTA_STIMATA;
  return misuraQuota(anno, mesiChiusi, vend.mese);
}
