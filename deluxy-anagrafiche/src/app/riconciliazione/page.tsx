import type { Prisma } from "@prisma/client";
import { Sidebar } from "@/components/Sidebar";
import { type RigaRiconc, TabellaRiconciliazione } from "@/components/TabellaRiconciliazione";
import { prisma } from "@/lib/db";
import { whereRicerca } from "@/lib/ricerca";

export const dynamic = "force-dynamic";

const PER_PAGINA = 40;

// Provider generici: il dominio non identifica l'azienda, niente suggerimento.
const DOMINI_GENERICI = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.it", "outlook.com", "outlook.it",
  "live.com", "live.it", "yahoo.com", "yahoo.it", "icloud.com", "me.com", "libero.it",
  "virgilio.it", "tin.it", "alice.it", "tiscali.it", "fastwebnet.it", "aruba.it", "pec.it",
]);

// Radice del dominio email utile a indovinare l'insegna (es. cristina@aeffe.com → "aeffe")
function radiceDominio(email: string | null): string | null {
  const dom = email?.split("@")[1]?.toLowerCase().trim();
  if (!dom || DOMINI_GENERICI.has(dom)) return null;
  const parti = dom.split(".");
  const radice = parti.length >= 2 ? parti[parti.length - 2] : parti[0];
  return radice && radice.length >= 3 ? radice : null;
}

type Ricerca = { q?: string; pagina?: string };

// Riconciliazione dei referenti: i contatti finiti sotto un'anagrafica
// «DA CLASSIFICARE» (contenitore "senza azienda" o holding create dal sync
// HubSpot) vanno riassegnati all'insegna giusta. Qui si smistano uno a uno.
export default async function Riconciliazione({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const filtri = await searchParams;
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  const where: Prisma.ContattoWhereInput = {
    archiviato: false,
    partner: { attivo: true, categoria: "DA CLASSIFICARE" },
  };
  if (filtri.q) {
    const q = filtri.q;
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { ruolo: { contains: q, mode: "insensitive" } },
      { partner: { is: { nome: { contains: q, mode: "insensitive" }, attivo: true } } },
    ];
  }

  const [totale, contatti] = await Promise.all([
    prisma.contatto.count({ where }),
    prisma.contatto.findMany({
      where,
      include: { partner: { select: { id: true, nome: true, citta: true } } },
      orderBy: [{ partner: { nome: "asc" } }, { nome: "asc" }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);

  // Suggerimenti d'insegna dal dominio email — calcolati una volta per radice
  // distinta (molti contatti condividono il dominio), solo verso anagrafiche
  // "vere" (non altri contenitori DA CLASSIFICARE).
  const radici = [...new Set(contatti.map((c) => radiceDominio(c.email)).filter(Boolean))] as string[];
  const perRadice = new Map<string, RigaRiconc["suggeriti"]>();
  await Promise.all(
    radici.map(async (r) => {
      const cand = await prisma.partner.findMany({
        where: { attivo: true, categoria: { not: "DA CLASSIFICARE" }, AND: whereRicerca(r) },
        select: { id: true, nome: true, categoria: true, citta: true },
        orderBy: { nome: "asc" },
        take: 2,
      });
      perRadice.set(r, cand);
    }),
  );

  const righe: RigaRiconc[] = contatti.map((c) => ({
    id: c.id,
    nome: c.nome,
    ruolo: c.ruolo,
    email: c.email,
    telefono: c.telefono,
    hubspotId: c.hubspotId,
    partnerId: c.partner.id,
    partnerNome: c.partner.nome,
    partnerCitta: c.partner.citta,
    suggeriti: (radiceDominio(c.email) && perRadice.get(radiceDominio(c.email)!)) || [],
  }));

  const pagineTotali = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const linkPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtri.q) p.set("q", filtri.q);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/riconciliazione?${qs}` : "/riconciliazione";
  };

  return (
    <div className="layout">
      <Sidebar riconciliazioneAttiva />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Riconciliazione</h1>
            <p className="page-sub">
              {totale} referenti sotto anagrafiche «DA CLASSIFICARE» (contenitore senza azienda + gruppi
              creati dal sync) — riassegnali all&apos;insegna giusta
            </p>
          </div>
        </div>

        <form className="filtri" method="get" action="/riconciliazione">
          <input
            type="search"
            name="q"
            placeholder="Cerca per nome, email, ruolo o anagrafica attuale…"
            defaultValue={filtri.q ?? ""}
          />
          <button className="btn" type="submit">Filtra</button>
        </form>

        {contatti.length === 0 ? (
          <div className="vuoto">Nessun referente da riconciliare{filtri.q ? " con questi filtri" : ""}. 🎉</div>
        ) : (
          <TabellaRiconciliazione righe={righe} />
        )}

        <div className="paginazione">
          <span>Pagina {pagina} di {pagineTotali} · {totale} referenti</span>
          <nav>
            {pagina > 1 && <a className="btn btn-secondario" href={linkPagina(pagina - 1)}>← Precedente</a>}
            {pagina < pagineTotali && <a className="btn btn-secondario" href={linkPagina(pagina + 1)}>Successiva →</a>}
          </nav>
        </div>
      </main>
    </div>
  );
}
