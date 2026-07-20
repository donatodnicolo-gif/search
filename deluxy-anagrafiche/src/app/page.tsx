import type { Prisma } from "@prisma/client";
import { GruppoEspandibile } from "@/components/GruppoEspandibile";
import { MenuInteressi } from "@/components/MenuInteressi";
import { MenuStato } from "@/components/MenuStato";
import { Riconcilia } from "@/components/Riconcilia";
import { etichetta, Sidebar } from "@/components/Sidebar";
import { impostaArchiviato } from "@/lib/azioni";
import { ETICHETTE_INTERESSE, isInteresse } from "@/lib/interessi";
import { prisma } from "@/lib/db";
import { whereRicerca } from "@/lib/ricerca";
import { ETICHETTE_STATO, STATI } from "@/lib/stati";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

// Colonne ordinabili: parametro ?ordina= → campo Prisma
const COLONNE_ORDINABILI = {
  nome: "Nome",
  categoria: "Categoria",
  citta: "Città",
  stato: "Stato",
  account: "Account",
  ultimaVisita: "Ultimo contatto",
  creatoIl: "Creata",
} as const;
type CampoOrdinamento = keyof typeof COLONNE_ORDINABILI;

type Ricerca = {
  q?: string;
  categoria?: string;
  citta?: string;
  stato?: string;
  interesse?: string;
  pagina?: string;
  ordina?: string;
  dir?: string;
  archiviati?: string;
};

export default async function Elenco({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const filtri = await searchParams;
  const pagina = Math.max(1, Number(filtri.pagina) || 1);
  const inArchivio = filtri.archiviati === "1";
  const ordina: CampoOrdinamento =
    filtri.ordina && filtri.ordina in COLONNE_ORDINABILI ? (filtri.ordina as CampoOrdinamento) : "nome";
  const dir: "asc" | "desc" = filtri.dir === "desc" ? "desc" : "asc";

  const interesse = filtri.interesse && isInteresse(filtri.interesse) ? filtri.interesse : undefined;

  const where: Prisma.PartnerWhereInput = { attivo: !inArchivio };
  if (filtri.q) where.AND = whereRicerca(filtri.q);
  // Le sedi di un gruppo non compaiono come righe a sé: stanno annidate sotto
  // l'insegna madre. Durante una ricerca invece l'elenco torna piatto, così
  // una sede resta comunque trovabile per nome.
  if (!filtri.q) where.capogruppoId = null;
  if (filtri.categoria) where.categoria = filtri.categoria;
  if (filtri.citta) where.citta = filtri.citta;
  if (filtri.stato) where.stato = filtri.stato;
  if (interesse) where.interessi = { has: interesse };

  // La sezione "Novità" appare solo sulla visione globale pulita
  const conNovita =
    !inArchivio && !filtri.categoria && !filtri.q && !filtri.citta && !filtri.stato && !interesse && pagina === 1;

  const [totale, partner, citta, novita] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({
      where,
      include: {
        contatti: true,
        sedi: { where: { attivo: !inArchivio }, include: { contatti: true }, orderBy: { nome: "asc" } },
      },
      // Nome come criterio secondario per un ordine stabile a parità di valore;
      // per "Ultimo contatto" i record senza data vanno in fondo
      orderBy:
        ordina === "nome"
          ? { nome: dir }
          : ordina === "ultimaVisita"
            ? [{ ultimaVisita: { sort: dir, nulls: "last" } }, { nome: "asc" }]
            : [{ [ordina]: dir }, { nome: "asc" }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.partner.groupBy({
      by: ["citta"],
      // Le città proposte seguono la tipologia selezionata nella sidebar (o l'archivio)
      where: { attivo: !inArchivio, citta: { not: null }, ...(filtri.categoria ? { categoria: filtri.categoria } : {}) },
      orderBy: { citta: "asc" },
    }),
    // Novità = top 10 per data più recente tra creazione e ultimo contatto.
    // Le date future di ultimo contatto (appuntamenti pianificati) non contano
    // finché non arrivano. Prisma non ordina per GREATEST: si prendono i top 10
    // di entrambi i criteri e si fondono.
    conNovita
      ? (async () => {
          const adesso = new Date();
          const [creati, contattati] = await Promise.all([
            prisma.partner.findMany({
              where: { attivo: true },
              include: { contatti: true },
              orderBy: { creatoIl: "desc" },
              take: 10,
            }),
            prisma.partner.findMany({
              where: { attivo: true, ultimaVisita: { lte: adesso } },
              include: { contatti: true },
              orderBy: { ultimaVisita: "desc" },
              take: 10,
            }),
          ]);
          const perId = new Map([...creati, ...contattati].map((p) => [p.id, p]));
          // Per il lotto storico dell'Excel la data di creazione è quella
          // convenzionale (uguale per tutti): lì conta solo l'ultimo contatto.
          const rilevante = (p: (typeof creati)[number]) =>
            Math.max(
              p.fonte === "excel" ? 0 : p.creatoIl.getTime(),
              p.ultimaVisita && p.ultimaVisita <= adesso ? p.ultimaVisita.getTime() : 0,
            );
          return [...perId.values()]
            .filter((p) => rilevante(p) > 0)
            .sort((a, b) => rilevante(b) - rilevante(a))
            .slice(0, 10);
        })()
      : Promise.resolve([]),
  ]);

  const pagineTotali = Math.max(1, Math.ceil(totale / PER_PAGINA));

  const parametriBase = () => {
    const p = new URLSearchParams();
    if (inArchivio) p.set("archiviati", "1");
    if (filtri.q) p.set("q", filtri.q);
    if (filtri.categoria) p.set("categoria", filtri.categoria);
    if (filtri.citta) p.set("citta", filtri.citta);
    if (filtri.stato) p.set("stato", filtri.stato);
    if (interesse) p.set("interesse", interesse);
    return p;
  };

  const linkPagina = (n: number) => {
    const p = parametriBase();
    if (ordina !== "nome") p.set("ordina", ordina);
    if (dir !== "asc") p.set("dir", dir);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  // Click sull'intestazione: ordina per quella colonna; secondo click inverte.
  // Cambiando ordinamento si riparte dalla prima pagina.
  const linkOrdina = (campo: CampoOrdinamento) => {
    const p = parametriBase();
    if (campo !== "nome") p.set("ordina", campo);
    if (campo === ordina && dir === "asc") p.set("dir", "desc");
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  const dataIt = (d: Date) =>
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Telefono da mostrare in colonna: quello dell'anagrafica o del primo referente
  type ConContatti = { telefono: string | null; contatti: { telefono: string | null }[] };
  const telefonoDi = (p: ConContatti) =>
    p.telefono ?? p.contatti.find((c) => c.telefono)?.telefono ?? null;

  const FONTI: Record<string, string> = {
    excel: "Excel",
    platform: "app.deluxy.it",
    manuale: "API",
    ui: "registro",
    hubspot: "HubSpot",
  };

  // Le celle di una riga dell'elenco: identiche per un'insegna madre e per una
  // sua sede (ogni sede ha stato, interessi e azioni propri).
  type RigaPartner = (typeof partner)[number]["sedi"][number];
  const Celle = ({ p, sede }: { p: RigaPartner; sede?: boolean }) => (
    <>
      <td>
        <a href={`/partner/${p.id}`}>
          <div className={sede ? "cella-nome cella-nome-sede" : "cella-nome"}>{p.nome}</div>
          {p.indirizzo && <div className="cella-sub">{p.indirizzo}</div>}
        </a>
      </td>
      <td className="cella-muta">{p.categoria}</td>
      <td className="cella-muta">{p.citta ?? "—"}</td>
      <td className="cella-muta">{telefonoDi(p) ?? "—"}</td>
      <td><MenuStato partnerId={p.id} stato={p.stato} archiviato={inArchivio} /></td>
      <td><MenuInteressi partnerId={p.id} interessi={p.interessi} compatto /></td>
      <td className="cella-muta col-secondaria">{p.account ?? "—"}</td>
      <td className="cella-muta">{p.ultimaVisita ? dataIt(p.ultimaVisita) : "—"}</td>
      <td className="cella-muta">
        {p.note ? <span className="cella-note" title={p.note}>{p.note}</span> : "—"}
      </td>
      <td className="cella-muta col-secondaria">{dataIt(p.creatoIl)}</td>
      <td>
        <span style={{ display: "inline-flex", gap: 2 }}>
          <Riconcilia cerca="hubspot" partnerId={p.id} nomeRiga={p.nome} collegato={Boolean(p.hubspotId)} />
          <form action={impostaArchiviato.bind(null, p.id, !inArchivio)}>
            <button type="submit" className="btn-archivia" title={inArchivio ? "Ripristina" : "Archivia"}>
              {inArchivio ? "↩" : "⌫"}
            </button>
          </form>
        </span>
      </td>
    </>
  );

  // Riga di testata di un gruppo per insegna: riassume le sedi senza essere
  // un'anagrafica (stato, interessi e azioni stanno sulle sedi, che restano
  // record autonomi). Le città sono l'informazione utile a colpo d'occhio.
  const CelleGruppo = ({ nome, membri }: { nome: string; membri: RigaPartner[] }) => {
    const citta = [...new Set(membri.map((m) => m.citta).filter(Boolean))] as string[];
    const categorie = [...new Set(membri.map((m) => m.categoria))];
    return (
      <>
        <td>
          <div className="cella-nome">{nome}</div>
          <div className="cella-sub">
            {membri.length} sedi{citta.length > 0 ? ` · ${citta.join(", ")}` : ""}
          </div>
        </td>
        <td className="cella-muta">{categorie.length === 1 ? categorie[0] : `${categorie.length} tipologie`}</td>
        <td className="cella-muta">{citta.length === 1 ? citta[0] : `${citta.length} città`}</td>
        <td className="cella-muta">—</td>
        <td className="cella-muta">—</td>
        <td className="cella-muta">—</td>
        <td className="cella-muta col-secondaria">—</td>
        <td className="cella-muta">—</td>
        <td className="cella-muta">—</td>
        <td className="cella-muta col-secondaria">—</td>
        <td></td>
      </>
    );
  };

  // Le anagrafiche con la stessa insegna si raggruppano da sole in una riga
  // espandibile (BOTTEGA VENETA → Milano, Roma, Firenze, Capri). A questo si
  // sommano le sedi collegate a mano con "⧉ Raggruppa" (nomi diversi, es. una
  // flagship). Un solo record per insegna resta una riga normale.
  type Gruppo = { chiave: string; nome: string; membri: RigaPartner[] };
  const gruppi: Gruppo[] = [];
  const indiceGruppo = new Map<string, number>();
  for (const p of partner) {
    const chiave = p.nome.trim().toUpperCase();
    const i = indiceGruppo.get(chiave);
    const conSedi = [p, ...p.sedi];
    if (i === undefined) {
      indiceGruppo.set(chiave, gruppi.length);
      gruppi.push({ chiave, nome: p.nome, membri: conSedi });
    } else {
      gruppi[i].membri.push(...conSedi);
    }
  }

  const Intestazione = ({ campo, classe }: { campo: CampoOrdinamento; classe?: string }) => (
    <th className={classe}>
      <a className="th-ordina" href={linkOrdina(campo)}>
        {COLONNE_ORDINABILI[campo]}
        <span className="th-freccia">{ordina === campo ? (dir === "asc" ? "↑" : "↓") : ""}</span>
      </a>
    </th>
  );

  return (
    <div className="layout">
      <Sidebar
        categoriaAttiva={filtri.categoria ?? null}
        statoAttivo={!inArchivio ? (filtri.stato ?? null) : null}
        interesseAttivo={interesse ?? null}
        archivioAttivo={inArchivio}
      />
      <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {inArchivio
              ? "Archiviati"
              : filtri.categoria
                ? etichetta(filtri.categoria)
                : filtri.stato && STATI.includes(filtri.stato as (typeof STATI)[number])
                  ? ETICHETTE_STATO[filtri.stato as (typeof STATI)[number]]
                  : interesse
                    ? ETICHETTE_INTERESSE[interesse]
                    : "Aziende"}
          </h1>
          <p className="page-sub">
            {inArchivio
              ? `${totale} anagrafiche archiviate · invisibili a elenchi e app`
              : `${totale} anagrafiche · fonte di verità per tutte le app Deluxy`}
          </p>
        </div>
        {!inArchivio && (
          <a
            className="btn"
            href={filtri.categoria ? `/partner/nuovo?categoria=${encodeURIComponent(filtri.categoria)}` : "/partner/nuovo"}
          >
            ＋ Nuovo
          </a>
        )}
      </div>

      <form className="filtri" method="get" action="/">
        {inArchivio && <input type="hidden" name="archiviati" value="1" />}
        {filtri.categoria && <input type="hidden" name="categoria" value={filtri.categoria} />}
        {interesse && <input type="hidden" name="interesse" value={interesse} />}
        <input
          type="search"
          name="q"
          placeholder="Cerca in tutti i campi: nome, città, referenti, telefono, note…"
          defaultValue={filtri.q ?? ""}
        />
        <select name="citta" defaultValue={filtri.citta ?? ""}>
          <option value="">Tutte le città</option>
          {citta.map((c) => (
            <option key={c.citta} value={c.citta ?? ""}>{c.citta}</option>
          ))}
        </select>
        <select name="stato" defaultValue={filtri.stato ?? ""}>
          <option value="">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
          ))}
        </select>
        <button className="btn" type="submit">Filtra</button>
      </form>

      {conNovita && novita.length > 0 && (
        <>
          <h2 className="sezione-titolo">
            Novità <span>top 10 per nuovo inserimento o ultimo contatto</span>
          </h2>
          <div className="tabella-wrap" style={{ marginBottom: 22 }}>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Città</th>
                  <th>Telefono</th>
                  <th>Stato</th>
                  <th>Interessi</th>
                  <th>Ultimo contatto</th>
                  <th>Note</th>
                  <th>Creata</th>
                </tr>
              </thead>
              <tbody>
                {novita.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <a href={`/partner/${p.id}`}>
                        <div className="cella-nome">{p.nome}</div>
                        {p.indirizzo && <div className="cella-sub">{p.indirizzo}</div>}
                      </a>
                    </td>
                    <td className="cella-muta">{p.categoria}</td>
                    <td className="cella-muta">{p.citta ?? "—"}</td>
                    <td className="cella-muta">{telefonoDi(p) ?? "—"}</td>
                    <td><MenuStato partnerId={p.id} stato={p.stato} /></td>
                    <td><MenuInteressi partnerId={p.id} interessi={p.interessi} compatto /></td>
                    <td className="cella-muta">{p.ultimaVisita ? dataIt(p.ultimaVisita) : "—"}</td>
                    <td className="cella-muta">
                      {p.note ? (
                        <span className="cella-note" title={p.note}>{p.note}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cella-muta">
                      {dataIt(p.creatoIl)}
                      <span className="cella-fonte"> · {FONTI[p.fonte] ?? p.fonte}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="sezione-titolo">Tutte le anagrafiche</h2>
        </>
      )}

      {partner.length === 0 ? (
        <div className="vuoto">Nessuna anagrafica trovata con questi filtri.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th className="cella-espandi" aria-label="Sedi"></th>
                <Intestazione campo="nome" />
                <Intestazione campo="categoria" />
                <Intestazione campo="citta" />
                <th>Telefono</th>
                <Intestazione campo="stato" />
                <th>Interessi</th>
                <Intestazione campo="account" classe="col-secondaria" />
                <Intestazione campo="ultimaVisita" />
                <th>Note</th>
                <Intestazione campo="creatoIl" classe="col-secondaria" />
                <th aria-label="Archivia"></th>
              </tr>
            </thead>
            <tbody>
              {gruppi.map((g) =>
                g.membri.length > 1 ? (
                  <GruppoEspandibile
                    key={g.chiave}
                    celle={<CelleGruppo nome={g.nome} membri={g.membri} />}
                    sedi={g.membri.map((m) => ({ id: m.id, celle: <Celle p={m} sede /> }))}
                  />
                ) : (
                  <tr key={g.membri[0].id}>
                    <td className="cella-espandi" />
                    <Celle p={g.membri[0]} />
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="paginazione">
        <span>Pagina {pagina} di {pagineTotali}</span>
        <nav>
          {pagina > 1 && <a className="btn btn-secondario" href={linkPagina(pagina - 1)}>← Precedente</a>}
          {pagina < pagineTotali && <a className="btn btn-secondario" href={linkPagina(pagina + 1)}>Successiva →</a>}
        </nav>
      </div>
      </main>
    </div>
  );
}
