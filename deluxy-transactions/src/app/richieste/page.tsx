import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { ETICHETTE, STATI } from "@/lib/richieste";
import { BadgeStato, quando } from "@/components/Etichette";
import { RigaCliccabile } from "@/components/RigaCliccabile";

// Elenco completo con filtri. È l'archivio: qui non si decide niente, si cerca.

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

export default async function Elenco({
  searchParams,
}: {
  searchParams: Promise<{
    stato?: string;
    q?: string;
    periodo?: string;
    pagina?: string;
    origine?: string;
    ord?: string;
    dir?: string;
  }>;
}) {
  if (!(await operatoreCorrente())) redirect("/login");
  const sp = await searchParams;
  const stato = sp.stato && STATI.includes(sp.stato as (typeof STATI)[number]) ? sp.stato : "";
  const q = (sp.q ?? "").trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);

  // Filtro per app di origine: col collettore unico (CS, Scout, Finance,
  // Piattaforma) «di chi è questa coda» diventa la prima domanda dell'archivio.
  const origini = (
    await prisma.richiesta.findMany({ distinct: ["origine"], select: { origine: true }, orderBy: { origine: "asc" } })
  ).map((r) => r.origine);
  const origine = origini.includes(sp.origine ?? "") ? sp.origine! : "";

  // Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): un parametro solo.
  // Il periodo si applica alla data di CREAZIONE della richiesta (`creataIl`):
  // è la data che ogni riga ha di sicuro — quella di pagamento ce l'hanno solo
  // le richieste arrivate in fondo.
  const PERIODI = ["mese", "scorso", "trimestre", "anno"] as const;
  const periodo = PERIODI.includes(sp.periodo as (typeof PERIODI)[number]) ? sp.periodo! : "";
  const oggi = new Date();
  const inizioMese = (n: number) => new Date(oggi.getFullYear(), oggi.getMonth() - n, 1);
  const intervallo =
    periodo === "mese" ? { gte: inizioMese(0) }
    : periodo === "scorso" ? { gte: inizioMese(1), lt: inizioMese(0) }
    : periodo === "trimestre" ? { gte: inizioMese(2) } // ultimi 3 mesi incluso il corrente
    : periodo === "anno" ? { gte: new Date(oggi.getFullYear(), 0, 1) }
    : null;

  const dove = {
    ...(stato ? { stato } : {}),
    ...(origine ? { origine } : {}),
    ...(q
      ? {
          OR: [
            { riferimento: { contains: q, mode: "insensitive" as const } },
            { beneficiario: { contains: q, mode: "insensitive" as const } },
            { causale: { contains: q, mode: "insensitive" as const } },
            { iban: { contains: q.replace(/\s/g, "").toUpperCase() } },
          ],
        }
      : {}),
    ...(intervallo ? { creataIl: intervallo } : {}),
  };

  // ORDINAMENTO (11/09/2026). Qui conta più che nella coda, perché l'elenco è
  // PAGINATO: ordinare le sole 50 righe della pagina darebbe un ordine giusto a
  // vedersi e falso: si ordina nel database, prima di tagliare la pagina.
  const COLONNE = {
    riferimento: "riferimento",
    beneficiario: "beneficiario",
    importo: "importoCent",
    origine: "origine",
    stato: "stato",
    creata: "creataIl",
    pagata: "pagataIl",
  } as const;
  type Colonna = keyof typeof COLONNE;
  const ord = (Object.keys(COLONNE) as string[]).includes(sp.ord ?? "") ? (sp.ord as Colonna) : "";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "asc";
  // `pagataIl` è vuota su tutto ciò che non è arrivato in fondo: i vuoti vanno
  // in coda in entrambi i versi, altrimenti ordinare per «Pagata» riempie la
  // prima pagina di righe senza data e nasconde proprio quelle che si cercano.
  const ordinamento =
    ord === "pagata"
      ? { pagataIl: { sort: dir, nulls: "last" } as const }
      : ord
        ? { [COLONNE[ord]]: dir }
        : { creataIl: "desc" as const };

  const [totale, righe] = await Promise.all([
    prisma.richiesta.count({ where: dove }),
    prisma.richiesta.findMany({
      where: dove,
      orderBy: ordinamento,
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  /** Un indirizzo per questa pagina che CONSERVA i filtri in corso e cambia
   *  solo quello che gli si passa. */
  const indirizzo = (cambi: Record<string, string>) => {
    const p = new URLSearchParams();
    if (stato) p.set("stato", stato);
    if (origine) p.set("origine", origine);
    if (q) p.set("q", q);
    if (periodo) p.set("periodo", periodo);
    if (ord) p.set("ord", ord);
    if (ord) p.set("dir", dir);
    if (pagina > 1) p.set("pagina", String(pagina));
    for (const [chiave, valore] of Object.entries(cambi)) {
      if (valore) p.set(chiave, valore);
      else p.delete(chiave);
    }
    const stringa = p.toString();
    return stringa ? `/richieste?${stringa}` : "/richieste";
  };

  /** Intestazione che ordina. Cambiare ordine RIPORTA A PAGINA 1: restare alla
   *  terza pagina di un ordinamento diverso vuol dire guardare righe a caso. */
  const intestazione = (colonna: Colonna, etichetta: string, classe?: string) => {
    const attiva = ord === colonna;
    const prossimo = attiva
      ? dir === "asc"
        ? "desc"
        : "asc"
      : colonna === "importo" || colonna === "creata" || colonna === "pagata"
        ? "desc"
        : "asc";
    return (
      <th className={classe} aria-sort={attiva ? (dir === "desc" ? "descending" : "ascending") : "none"}>
        <a className={`ordina${attiva ? " attiva" : ""}`} href={indirizzo({ ord: colonna, dir: prossimo, pagina: "" })}>
          {etichetta}
          <span className="ordina-freccia" aria-hidden="true">
            {attiva ? (dir === "desc" ? "↓" : "↑") : "↕"}
          </span>
        </a>
      </th>
    );
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Richieste</h1>
          <p className="page-sub">{totale} richieste registrate</p>
        </div>
        <a className="btn btn-secondario" href="/richieste/nuova">
          Nuova richiesta
        </a>
      </div>

      {/* Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): link GET fuori
          dal form — il submit del form non porta `periodo` e le azzera da solo. */}
      <div className="filtri riga-chips-scorri" style={{ marginBottom: 10 }}>
        {([
          { v: "mese", l: "Mese in corso" },
          { v: "scorso", l: "Mese scorso" },
          { v: "trimestre", l: "Trimestre" },
          { v: "anno", l: "Anno" },
        ] as const).map((p) => (
          <a
            key={p.v}
            href={indirizzo({ periodo: p.v, pagina: "" })}
            className={`chip-link${periodo === p.v ? " attiva" : ""}`}
          >
            {p.l}
          </a>
        ))}
        {periodo && (
          <a href={indirizzo({ periodo: "", pagina: "" })} className="chip-link azzera">
            Tutte le date
          </a>
        )}
      </div>

      <form className="filtri" method="get">
        {/* Periodo e ordinamento sopravvivono al submit dei filtri; la pagina
            no, di proposito: cambiando filtro si riparte dalla prima. */}
        {periodo && <input type="hidden" name="periodo" value={periodo} />}
        {ord && <input type="hidden" name="ord" value={ord} />}
        {ord && <input type="hidden" name="dir" value={dir} />}
        <input type="search" name="q" defaultValue={q} placeholder="Riferimento, beneficiario, causale, IBAN…" />
        <select name="stato" defaultValue={stato}>
          <option value="">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s} value={s}>
              {ETICHETTE[s]}
            </option>
          ))}
        </select>
        <select name="origine" defaultValue={origine}>
          <option value="">Tutte le app</option>
          {origini.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Filtra
        </button>
      </form>

      {righe.length === 0 ? (
        <div className="vuoto">Nessuna richiesta con questi filtri.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                {intestazione("riferimento", "Riferimento")}
                {intestazione("beneficiario", "Beneficiario")}
                {intestazione("importo", "Importo", "num")}
                {intestazione("origine", "Origine")}
                {intestazione("stato", "Stato")}
                {intestazione("creata", "Creata")}
                {intestazione("pagata", "Pagata")}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <RigaCliccabile key={r.id} href={`/richieste/${r.id}`}>
                  <td>
                    <a href={`/richieste/${r.id}`} className="cella-nome">
                      {r.riferimento}
                    </a>
                    <div className="cella-sub">{r.causale}</div>
                  </td>
                  <td>
                    <div>{r.beneficiario}</div>
                    <div className="cella-sub iban">{r.metodo === "iban" ? formattaIban(r.iban) : r.metodo}</div>
                  </td>
                  <td className="cella-num importo">{euro(r.importoCent)}</td>
                  <td className="cella-muta">{r.origine}</td>
                  <td>
                    <BadgeStato stato={r.stato} pagatoCon={r.pagatoCon} />
                  </td>
                  <td className="cella-muta">{quando(r.creataIl)}</td>
                  <td className="cella-muta">{quando(r.pagataIl)}</td>
                </RigaCliccabile>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagine > 1 && (
        <div className="paginazione">
          <span>
            pagina {pagina} di {pagine}
          </span>
          <nav>
            {pagina > 1 && (
              <a className="btn btn-secondario small" href={indirizzo({ pagina: String(pagina - 1) })}>
                Precedente
              </a>
            )}
            {pagina < pagine && (
              <a className="btn btn-secondario small" href={indirizzo({ pagina: String(pagina + 1) })}>
                Successiva
              </a>
            )}
          </nav>
        </div>
      )}
    </main>
  );
}
