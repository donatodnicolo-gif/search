import Link from "next/link";
import { ConfermaElimina } from "@/components/ConfermaElimina";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { nomeMese, MESI, ivato } from "@/lib/calc";
import { segnaFatturaPagata, deleteFattura } from "@/lib/actions";
import { ThSort, ordina } from "@/components/ThSort";
import { RigaLink } from "@/components/RigaLink";

export const dynamic = "force-dynamic";

export default async function FatturePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string; stato?: string; tipologia?: string; sort?: string; dir?: string; q?: string; periodo?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;
  const mese = sp.mese ? parseInt(sp.mese) : undefined;
  const q = sp.q?.trim();

  // Le SCORCIATOIE DI PERIODO (Libro v1.9 §8-bis): un parametro solo, non
  // quattro date. Le fatture hanno (anno, mese): il periodo si traduce in un
  // elenco di coppie — il trimestre può scavallare l'anno.
  const oggi = new Date();
  const coppiaMesiFa = (n: number) => {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - n, 1);
    return { anno: d.getFullYear(), mese: d.getMonth() + 1 };
  };
  const coppiePeriodo: { anno: number; mese: number }[] | null =
    sp.periodo === "mese" ? [coppiaMesiFa(0)]
    : sp.periodo === "scorso" ? [coppiaMesiFa(1)]
    : sp.periodo === "trimestre" ? [coppiaMesiFa(0), coppiaMesiFa(1), coppiaMesiFa(2)]
    : sp.periodo === "anno" ? Array.from({ length: 12 }, (_, i) => ({ anno: oggi.getFullYear(), mese: i + 1 }))
    : null;

  const tipologie = await prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" } });
  let fatture = await prisma.fatturaServizio.findMany({
    where: {
      ...(coppiePeriodo
        ? { OR: coppiePeriodo.map((c) => ({ anno: c.anno, mese: c.mese })) }
        : { anno, ...(mese ? { mese } : {}) }),
      ...(sp.stato === "aperte" ? { pagata: false } : {}),
      ...(sp.stato === "pagate" ? { pagata: true } : {}),
      ...(sp.tipologia ? { tipologiaId: sp.tipologia } : {}),
      // La ricerca (Libro v1.9): come l'operatore riconosce la fattura —
      // il partner o il numero.
      ...(q
        ? {
            AND: [{ OR: [
              { numero: { contains: q, mode: "insensitive" as const } },
              { partner: { nome: { contains: q, mode: "insensitive" as const } } },
            ] }],
          }
        : {}),
    },
    include: { partner: true, tipologia: true },
    orderBy: [{ mese: "desc" }, { partner: { nome: "asc" } }],
  });

  type F = (typeof fatture)[number];
  const campi: Record<string, (f: F) => string | number | Date | null> = {
    partner: (f) => f.partner.nome,
    mese: (f) => f.mese,
    tipologia: (f) => f.tipologia.nome,
    numero: (f) => f.numero,
    scadenza: (f) => f.scadenza,
    imponibile: (f) => f.imponibile,
    ivato: (f) => ivato(f),
    stato: (f) => (f.pagata ? 1 : 0),
  };
  if (sp.sort && campi[sp.sort]) fatture = ordina(fatture, campi[sp.sort], sp.dir);

  const totale = fatture.reduce((a, f) => a + f.imponibile, 0);
  const totaleIvato = fatture.reduce((a, f) => a + ivato(f), 0);
  const aperto = fatture.filter((f) => !f.pagata).reduce((a, f) => a + ivato(f), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Fatturazione servizi</h1>
          <p className="page-caption">
            Fatture emesse ai partner per i servizi Deluxy (consegne, eventi, magazzino…).
          </p>
        </div>
        <div className="page-actions">
          {/* ⚠️ Le note di credito NON sono in questo elenco e non sono detratte
              dal fatturato (28/08/2026): vivono solo su Fatture in Cloud, e
              finché il collegamento non viene rinnovato l'app non ha nemmeno il
              permesso di leggerle. Il collegamento sta qui perché una pagina che
              nessuno può raggiungere non corregge niente. */}
          {/* Il varco verso FIC (31/08/2026): le fatture emesse su Fatture in
              Cloud fuori dal giro dei servizi entravano qui solo a mano — 36
              per 15.216 € sono rimaste invisibili ad agosto. Niente conteggio
              nel bottone: servirebbe una chiamata a FIC (1–3 s) a ogni apertura
              di questa lista, e il numero vive nella pagina stessa. */}
          <Link href="/fatture/da-fic" className="btn">Da Fatture in Cloud</Link>
          <Link href="/fatture/note-credito" className="btn">Note di credito</Link>
          <Link href="/fatture/nuova" className="btn primary">+ Nuova fattura</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Fatturato periodo (netto IVA)</div>
          <div className="kpi-value">{euro(totale)}</div>
          <div className="kpi-sub">{fatture.length} fatture · {euro(totaleIvato)} IVA inclusa</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da incassare</div>
          <div className={`kpi-value ${aperto > 0 ? "neg" : ""}`}>{euro(aperto)}</div>
          <div className="kpi-sub">{fatture.filter((f) => !f.pagata).length} fatture aperte</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): link GET, un solo
            parametro. Sono FUORI dal form: il submit del form le azzera da
            solo (il periodo scelto a mano con anno/mese vince). */}
        <div className="filters riga-chips-scorri" style={{ marginBottom: 10 }}>
          {([
            { v: "mese", l: "Mese in corso" },
            { v: "scorso", l: "Mese scorso" },
            { v: "trimestre", l: "Trimestre" },
            { v: "anno", l: "Anno" },
          ] as const).map((p) => (
            <Link
              key={p.v}
              href={`/fatture?periodo=${p.v}${sp.stato ? `&stato=${sp.stato}` : ""}${sp.tipologia ? `&tipologia=${sp.tipologia}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`chip-link${sp.periodo === p.v ? " attiva" : ""}`}
            >
              {p.l}
            </Link>
          ))}
          {sp.periodo ? (
            <Link href="/fatture" className="chip-link azzera">Tutto l&apos;anno</Link>
          ) : null}
        </div>
        <form className="filters" method="get">
          {/* La ricerca (Libro v1.9): il partner o il numero della fattura. */}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cerca per partner o numero fattura…"
          />
          {/* I select vivono dietro «Filtri (N)» sotto la soglia mobile (Libro v1.2 §8). */}
          <ZonaFiltri attivi={[sp.mese, sp.stato, sp.tipologia].filter(Boolean).length}>
          <select name="mese" defaultValue={sp.mese ?? ""}>
            <option value="">Tutto l&apos;anno</option>
            {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutte</option>
            <option value="aperte">Da incassare</option>
            <option value="pagate">Saldate</option>
          </select>
          <select name="tipologia" defaultValue={sp.tipologia ?? ""}>
            <option value="">Tutte le tipologie</option>
            {tipologie.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          </ZonaFiltri>
          <input type="hidden" name="anno" value={anno} />
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {fatture.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna fattura</div>
            <div className="empty-text">Nessuna fattura trovata per i filtri selezionati.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="Partner" campo="partner" sp={sp} path="/fatture" />
                  <ThSort label="Mese" campo="mese" sp={sp} path="/fatture" />
                  <ThSort label="Tipologia" campo="tipologia" sp={sp} path="/fatture" />
                  <ThSort label="N° fattura" campo="numero" sp={sp} path="/fatture" />
                  <ThSort label="Scadenza" campo="scadenza" sp={sp} path="/fatture" />
                  <ThSort label="Imponibile" campo="imponibile" sp={sp} path="/fatture" num />
                  <ThSort label="IVA incl." campo="ivato" sp={sp} path="/fatture" num />
                  <ThSort label="Stato" campo="stato" sp={sp} path="/fatture" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fatture.map((f) => (
                  // «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la
                  // riga apre il record; i link e i bottoni dentro restano loro.
                  <RigaLink key={f.id} href={`/fatture/${f.id}`} className="riga-link">
                    <td><Link href={`/partner/${f.partnerId}`} style={{ fontWeight: 500 }}>{f.partner.nome}</Link></td>
                    <td>{nomeMese(f.mese)}</td>
                    <td>{f.tipologia.nome}</td>
                    <td>
                      <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }} title="Apri il record della fattura">
                        {f.numero ?? "s.n."}
                      </Link>
                    </td>
                    <td>{dataIt(f.scadenza)}</td>
                    <td className="num">{euro(f.imponibile)}</td>
                    <td className="num">{euro(ivato(f))}</td>
                    <td>
                      {f.pagata ? (
                        <span className="badge green"><span className="dot" />Saldata {dataIt(f.dataPagamento)}</span>
                      ) : f.scadenza && f.scadenza < new Date() ? (
                        <span className="badge red"><span className="dot" />Scaduta</span>
                      ) : (
                        <span className="badge orange"><span className="dot" />Da incassare</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {!f.pagata ? (
                        <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)} style={{ display: "inline" }}>
                          <button className="btn small secondary" type="submit">Segna saldata</button>
                        </form>
                      ) : (
                        <form action={segnaFatturaPagata.bind(null, f.id, false, undefined)} style={{ display: "inline" }}>
                          <button className="btn small secondary" type="submit">Riapri</button>
                        </form>
                      )}{" "}
                      <form action={deleteFattura.bind(null, f.id)} style={{ display: "inline" }}>
                        <ConfermaElimina
                          oggetto="questa fattura"
                          conseguenza="Sparisce dal registro; eventuali abbinamenti a pagamenti vanno rifatti."
                        />
                      </form>
                    </td>
                  </RigaLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
