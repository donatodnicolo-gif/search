import type { Prisma } from "@prisma/client";
import { MenuStato } from "@/components/MenuStato";
import { etichetta, Sidebar } from "@/components/Sidebar";
import { impostaArchiviato } from "@/lib/azioni";
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

  const where: Prisma.PartnerWhereInput = { attivo: !inArchivio };
  if (filtri.q) where.AND = whereRicerca(filtri.q);
  if (filtri.categoria) where.categoria = filtri.categoria;
  if (filtri.citta) where.citta = filtri.citta;
  if (filtri.stato) where.stato = filtri.stato;

  // La sezione "Novità" appare solo sulla visione globale pulita
  const conNovita =
    !inArchivio && !filtri.categoria && !filtri.q && !filtri.citta && !filtri.stato && pagina === 1;

  const [totale, partner, citta, novita] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({
      where,
      include: { contatti: true },
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
    conNovita
      ? prisma.partner.findMany({
          where: { attivo: true },
          include: { contatti: true },
          orderBy: { creatoIl: "desc" },
          take: 10,
        })
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
  type ConContatti = (typeof partner)[number];
  const telefonoDi = (p: ConContatti) =>
    p.telefono ?? p.contatti.find((c) => c.telefono)?.telefono ?? null;

  const FONTI: Record<string, string> = {
    excel: "Excel",
    platform: "app.deluxy.it",
    manuale: "API",
    ui: "registro",
  };

  const Intestazione = ({ campo }: { campo: CampoOrdinamento }) => (
    <th>
      <a className="th-ordina" href={linkOrdina(campo)}>
        {COLONNE_ORDINABILI[campo]}
        <span className="th-freccia">{ordina === campo ? (dir === "asc" ? "↑" : "↓") : ""}</span>
      </a>
    </th>
  );

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={filtri.categoria ?? null} archivioAttivo={inArchivio} />
      <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {inArchivio ? "Archiviati" : filtri.categoria ? etichetta(filtri.categoria) : "Visione globale"}
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
            Novità <span>ultimi 10 inserimenti</span>
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
                <Intestazione campo="nome" />
                <Intestazione campo="categoria" />
                <Intestazione campo="citta" />
                <th>Telefono</th>
                <Intestazione campo="stato" />
                <Intestazione campo="account" />
                <th>Contatti</th>
                <Intestazione campo="ultimaVisita" />
                <th>Note</th>
                <Intestazione campo="creatoIl" />
                <th aria-label="Archivia"></th>
              </tr>
            </thead>
            <tbody>
              {partner.map((p) => {
                const riferimento = p.contatti.find((c) => c.nome) ?? p.contatti[0];
                return (
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
                    <td><MenuStato partnerId={p.id} stato={p.stato} archiviato={inArchivio} /></td>
                    <td className="cella-muta">{p.account ?? "—"}</td>
                    <td className="cella-muta">
                      {riferimento
                        ? [riferimento.nome ?? riferimento.ruolo, riferimento.telefono ?? riferimento.email]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"}
                    </td>
                    <td className="cella-muta">{p.ultimaVisita ? dataIt(p.ultimaVisita) : "—"}</td>
                    <td className="cella-muta">
                      {p.note ? (
                        <span className="cella-note" title={p.note}>{p.note}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cella-muta">{dataIt(p.creatoIl)}</td>
                    <td>
                      <form action={impostaArchiviato.bind(null, p.id, !inArchivio)}>
                        <button
                          type="submit"
                          className="btn-archivia"
                          title={inArchivio ? "Ripristina" : "Archivia"}
                        >
                          {inArchivio ? "↩" : "⌫"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
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
