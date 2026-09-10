import { prisma } from "./db";
import type { ClienteRiga } from "./orders";

// ── SOGLIE E CLUSTER DEI CLIENTI ──
//
// Il CRM legge TUTTI i clienti da Orders (decisione dell'utente 10/09/2026:
// «in ogni caso fai entrare tutti i clienti»). Qui si decide, in Impostazioni,
// chi è «in soglia» (spesa totale minima, spesa annua minima, frequenza) e in
// quale CLUSTER sta ognuno: gruppi definiti a mano, in ordine di priorità, il
// primo che combacia vince. I cluster si affiancano ai segmenti di Orders
// (vip, fedele…), che restano quelli del registro: qui è il punto di vista
// del client advisor, e si cambia senza toccare Orders.
//
// ⚠️ La spesa ANNUA e la frequenza sono STIME: Orders dà totale speso, numero
// di ordini e data del primo ordine; qui si divide per gli anni di vita del
// cliente (minimo 1). Un cliente di 3 mesi con 2 ordini conta «2 ordini/anno»,
// non 8: chi arriva ora non viene gonfiato.

export type Soglie = {
  spesaTotaleMin: number; // € — 0 = nessuna soglia
  spesaAnnuaMin: number; // €/anno stimati
  ordiniAnnoMin: number; // ordini/anno stimati (frequenza)
};

export type Cluster = {
  chiave: string; // slug stabile (nome normalizzato)
  nome: string;
  colore: string; // token del design system
  spesaTotaleMin?: number;
  spesaAnnuaMin?: number;
  ordiniAnnoMin?: number;
  ordiniMin?: number;
  punteggioMin?: number; // il voto dato a mano nella scheda (0-100)
};

export type ImpostazioniClienti = { soglie: Soglie; cluster: Cluster[] };

export const COLORI_CLUSTER: { chiave: string; nome: string }[] = [
  { chiave: "var(--gold-strong)", nome: "Oro" },
  { chiave: "var(--purple)", nome: "Viola" },
  { chiave: "var(--blue)", nome: "Blu" },
  { chiave: "var(--green)", nome: "Verde" },
  { chiave: "var(--orange)", nome: "Arancio" },
  { chiave: "var(--red)", nome: "Rosso" },
  { chiave: "var(--text-secondary)", nome: "Grigio" },
];

// I cluster di partenza: un'ipotesi ragionevole per un negozio di regali di
// lusso, da rifinire in Impostazioni. L'ultimo non ha condizioni: raccoglie
// chi non entra negli altri, così NESSUNO resta senza gruppo.
export const IMPOSTAZIONI_DEFAULT: ImpostazioniClienti = {
  soglie: { spesaTotaleMin: 0, spesaAnnuaMin: 0, ordiniAnnoMin: 0 },
  cluster: [
    { chiave: "top", nome: "Top", colore: "var(--gold-strong)", spesaTotaleMin: 2000 },
    { chiave: "affezionati", nome: "Affezionati", colore: "var(--green)", ordiniAnnoMin: 3 },
    { chiave: "in-crescita", nome: "In crescita", colore: "var(--blue)", spesaAnnuaMin: 300 },
    { chiave: "occasionali", nome: "Occasionali", colore: "var(--text-secondary)" },
  ],
};

export const MAX_CLUSTER = 8;

export function slug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "cluster";
}

function numeroOk(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Normalizza ciò che arriva dal database (o da un form): mai fidarsi della
// forma di un Json.
export function normalizza(grezzo: unknown): ImpostazioniClienti {
  const g = (grezzo ?? {}) as Partial<ImpostazioniClienti>;
  const s = (g.soglie ?? {}) as Partial<Soglie>;
  const cluster = Array.isArray(g.cluster) ? g.cluster : [];
  const puliti: Cluster[] = [];
  for (const c of cluster.slice(0, MAX_CLUSTER)) {
    if (!c || typeof c !== "object") continue;
    const nome = String((c as Cluster).nome ?? "").trim().slice(0, 40);
    if (!nome) continue;
    const colore = String((c as Cluster).colore ?? "");
    puliti.push({
      chiave: slug(nome),
      nome,
      colore: COLORI_CLUSTER.some((x) => x.chiave === colore) ? colore : "var(--text-secondary)",
      spesaTotaleMin: numeroOk((c as Cluster).spesaTotaleMin),
      spesaAnnuaMin: numeroOk((c as Cluster).spesaAnnuaMin),
      ordiniAnnoMin: numeroOk((c as Cluster).ordiniAnnoMin),
      ordiniMin: numeroOk((c as Cluster).ordiniMin),
      punteggioMin: numeroOk((c as Cluster).punteggioMin),
    });
  }
  return {
    soglie: {
      spesaTotaleMin: numeroOk(s.spesaTotaleMin) ?? 0,
      spesaAnnuaMin: numeroOk(s.spesaAnnuaMin) ?? 0,
      ordiniAnnoMin: numeroOk(s.ordiniAnnoMin) ?? 0,
    },
    cluster: puliti.length ? puliti : IMPOSTAZIONI_DEFAULT.cluster,
  };
}

export async function impostazioniClienti(): Promise<ImpostazioniClienti> {
  const riga = await prisma.impostazioniCrm.findUnique({ where: { id: "crm" } }).catch(() => null);
  return riga ? normalizza(riga.clienti) : IMPOSTAZIONI_DEFAULT;
}

// Le metriche stimate di un cliente, dalle cifre di Orders.
export function metriche(c: Pick<ClienteRiga, "speso" | "ordini" | "ultimoOrdine" | "acquisizione">): {
  anni: number;
  spesaAnnua: number;
  ordiniAnno: number;
} {
  const primo = c.acquisizione?.primoOrdine ? new Date(c.acquisizione.primoOrdine) : null;
  const inizio = primo && !Number.isNaN(primo.getTime()) ? primo : c.ultimoOrdine ? new Date(c.ultimoOrdine) : new Date();
  const anni = Math.max(1, (Date.now() - inizio.getTime()) / (365.25 * 86_400_000));
  return { anni, spesaAnnua: c.speso / anni, ordiniAnno: c.ordini / anni };
}

export function inSoglia(c: Pick<ClienteRiga, "speso" | "ordini" | "ultimoOrdine" | "acquisizione">, imp: ImpostazioniClienti): boolean {
  const m = metriche(c);
  const s = imp.soglie;
  return c.speso >= s.spesaTotaleMin && m.spesaAnnua >= s.spesaAnnuaMin && m.ordiniAnno >= s.ordiniAnnoMin;
}

// Il primo cluster che combacia, nell'ordine deciso in Impostazioni. Un
// cluster senza condizioni prende tutti (è il «resto»). Se nessuno combacia e
// non c'è un «resto», torna null: in pagina si mostra «—», mai un gruppo finto.
// `punteggio` è il voto dato a mano nella scheda: un cluster che lo chiede
// non prende chi non ce l'ha.
export function clusterDi(
  c: Pick<ClienteRiga, "speso" | "ordini" | "ultimoOrdine" | "acquisizione">,
  imp: ImpostazioniClienti,
  punteggio: number | null = null,
): Cluster | null {
  const m = metriche(c);
  for (const k of imp.cluster) {
    if (k.punteggioMin != null && (punteggio == null || punteggio < k.punteggioMin)) continue;
    if (k.spesaTotaleMin != null && c.speso < k.spesaTotaleMin) continue;
    if (k.spesaAnnuaMin != null && m.spesaAnnua < k.spesaAnnuaMin) continue;
    if (k.ordiniAnnoMin != null && m.ordiniAnno < k.ordiniAnnoMin) continue;
    if (k.ordiniMin != null && c.ordini < k.ordiniMin) continue;
    return k;
  }
  return null;
}

export function descriviCluster(k: Cluster): string {
  const p: string[] = [];
  if (k.spesaTotaleMin != null) p.push(`spesa totale ≥ ${k.spesaTotaleMin} €`);
  if (k.spesaAnnuaMin != null) p.push(`spesa annua ≥ ${k.spesaAnnuaMin} €`);
  if (k.ordiniAnnoMin != null) p.push(`≥ ${k.ordiniAnnoMin} ordini/anno`);
  if (k.ordiniMin != null) p.push(`≥ ${k.ordiniMin} ordini`);
  if (k.punteggioMin != null) p.push(`punteggio ≥ ${k.punteggioMin}`);
  return p.length ? p.join(" e ") : "tutti gli altri";
}
