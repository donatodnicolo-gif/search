import { prisma } from "./db";

// Il CENSIMENTO dei pubblici da Meta: le custom audience degli account
// entrano nel registro `Pubblico` dell'app, con l'id di piattaforma — senza
// il quale un pubblico non si può agganciare a un lancio.
//
// ⚠️ Lo STATO non lo tocca mai: come per gruppi e keyword, lo stato
// nell'app è una scelta dell'utente (un «estinto» resta estinto anche se
// Meta lo elenca ancora). Il censimento aggiorna dimensione, tipo e
// `verificatoIl`; i pubblici nuovi nascono «attivo» perché su Meta esistono.

const VERSIONE = process.env.META_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSIONE}`;

const TIPO_DA_SUBTYPE: Record<string, string> = {
  LOOKALIKE: "lookalike",
  WEBSITE: "retargeting",
  ENGAGEMENT: "retargeting",
  VIDEO: "retargeting",
  OFFLINE_CONVERSION: "retargeting",
  CUSTOM: "cliente",
};

type VoceMeta = {
  id: string;
  name: string;
  subtype?: string;
  approximate_count_lower_bound?: number;
};

export async function sincronizzaPubbliciMeta(): Promise<{
  visti: number;
  nuovi: number;
  aggiornati: number;
  errori: string[];
}> {
  const token = (process.env.META_ACCESS_TOKEN ?? "").trim();
  if (token.length < 20) {
    return { visti: 0, nuovi: 0, aggiornati: 0, errori: ["META_ACCESS_TOKEN non impostato"] };
  }
  const account = await prisma.accountAdv.findMany({
    where: { piattaforma: "meta_ads", attivo: true, idEsterno: { not: "" } },
    select: { brand: true, idEsterno: true },
  });

  let visti = 0;
  let nuovi = 0;
  let aggiornati = 0;
  const errori: string[] = [];

  for (const acc of account) {
    let url =
      `${BASE}/act_${acc.idEsterno.replace(/^act_/, "")}/customaudiences` +
      `?fields=id,name,subtype,approximate_count_lower_bound&limit=100&access_token=${encodeURIComponent(token)}`;
    let pagine = 0;
    while (url && pagine < 10) {
      pagine++;
      let corpo: { data?: VoceMeta[]; paging?: { next?: string }; error?: { message?: string } };
      try {
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        corpo = await r.json();
      } catch (e) {
        errori.push(`${acc.brand}: ${String(e).slice(0, 120)}`);
        break;
      }
      if (corpo.error) {
        errori.push(`${acc.brand}: ${corpo.error.message ?? "errore Meta"}`);
        break;
      }
      for (const voce of corpo.data ?? []) {
        visti++;
        const dati = {
          tipo: TIPO_DA_SUBTYPE[voce.subtype ?? ""] ?? "altro",
          dimensione: voce.approximate_count_lower_bound ?? null,
          verificatoIl: new Date(),
        };
        // Prima per id di piattaforma (la chiave vera), poi per nome: i
        // pubblici censiti a mano prima di oggi non hanno l'id e vanno
        // AGGANCIATI, non doppiati.
        const perId = await prisma.pubblico.findFirst({ where: { idEsterno: voce.id } });
        if (perId) {
          await prisma.pubblico.update({ where: { id: perId.id }, data: dati });
          aggiornati++;
          continue;
        }
        const perNome = await prisma.pubblico.findUnique({
          where: { nome_piattaforma: { nome: voce.name, piattaforma: "meta" } },
        });
        if (perNome) {
          await prisma.pubblico.update({
            where: { id: perNome.id },
            data: { ...dati, idEsterno: voce.id, ...(perNome.brand === "cross" ? { brand: acc.brand } : {}) },
          });
          aggiornati++;
        } else {
          await prisma.pubblico.create({
            data: {
              nome: voce.name,
              piattaforma: "meta",
              brand: acc.brand,
              idEsterno: voce.id,
              stato: "attivo",
              fonte: "censimento Meta",
              ...dati,
            },
          });
          nuovi++;
        }
      }
      url = corpo.paging?.next ?? "";
    }
  }
  return { visti, nuovi, aggiornati, errori };
}
