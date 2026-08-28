import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { totaliProForma, rifProForma, statiDi, statoDocumento } from "@/lib/proforma";
import { ThSort, ordina } from "@/components/ThSort";
import { RigaLink } from "@/components/RigaLink";
import { ConfermaElimina } from "@/components/ConfermaElimina";
import { deleteProForma } from "@/lib/proforma-actions";

// Cestino a filo (design system: niente emoji come icone strutturali).
const IconaCestino = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const dynamic = "force-dynamic";

export default async function ProFormaListPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; tipo?: string; stato?: string; partnerId?: string; q?: string; periodo?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;
  const q = sp.q?.trim();
  // Se si cerca un numero puro si cerca il progressivo del documento
  // («3» → PF 3/2026), non un pezzo di testo.
  const numeroCercato = q && /^\d+$/.test(q) ? parseInt(q) : null;

  // Le scorciatoie di periodo (Libro v1.9 §8-bis): un parametro solo,
  // tradotto in un intervallo sulla DATA di emissione del documento. Con una
  // chip attiva il perimetro annuale cede il passo (il trimestre può
  // scavallare l'anno).
  const oggi = new Date();
  const inizioMese = (n: number) => new Date(oggi.getFullYear(), oggi.getMonth() - n, 1);
  const intervalloPeriodo =
    sp.periodo === "mese" ? { gte: inizioMese(0) }
    : sp.periodo === "scorso" ? { gte: inizioMese(1), lt: inizioMese(0) }
    : sp.periodo === "trimestre" ? { gte: inizioMese(2) }
    : sp.periodo === "anno" ? { gte: new Date(oggi.getFullYear(), 0, 1), lt: new Date(oggi.getFullYear() + 1, 0, 1) }
    : null;
  // Due documenti, una schermata sola: `tipo` sceglie quale serie si guarda.
  // Il default resta la pro-forma, che è ciò che questa pagina ha sempre
  // mostrato. ⚠️ Mescolarle avrebbe fatto leggere stati sbagliati: «accettato»
  // e «rifiutato» sono del preventivo, la pro-forma non li conosce e sarebbero
  // stati mostrati tutti come «Bozza».
  const tipo = sp.tipo === "preventivo" ? "preventivo" : "proforma";
  const preventivi = tipo === "preventivo";
  const STATI = statiDi(tipo);

  const [partners, proformeRaw] = await Promise.all([
    prisma.partner.findMany({ orderBy: { nome: "asc" } }),
    prisma.proForma.findMany({
      where: {
        ...(intervalloPeriodo ? { data: intervalloPeriodo } : { anno }),
        tipo,
        ...(sp.stato ? { stato: sp.stato } : {}),
        ...(sp.partnerId ? { partnerId: sp.partnerId } : {}),
        // La ricerca (Libro v1.9 §8-bis): come si riconosce il documento —
        // il partner, l'oggetto o il progressivo.
        ...(q
          ? {
              OR: [
                { partner: { nome: { contains: q, mode: "insensitive" as const } } },
                { oggetto: { contains: q, mode: "insensitive" as const } },
                ...(numeroCercato != null ? [{ numero: numeroCercato }] : []),
              ],
            }
          : {}),
      },
      include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
      orderBy: [{ numero: "desc" }],
    }),
  ]);

  let proforme = proformeRaw.map((p) => ({ ...p, totali: totaliProForma(p.righe) }));

  type P = (typeof proforme)[number];
  const campi: Record<string, (p: P) => string | number | Date | null> = {
    numero: (p) => p.numero,
    partner: (p) => p.partner.nome,
    data: (p) => p.data,
    scadenza: (p) => p.scadenza,
    totale: (p) => p.totali.totale,
    stato: (p) => p.stato,
  };
  if (sp.sort && campi[sp.sort]) proforme = ordina(proforme, campi[sp.sort], sp.dir);

  const attive = proforme.filter((p) => p.stato !== "annullata");
  // «Fatturata» vale solo con un numero vero: quelle senza aspettano un gesto
  // (emetterle o annullarle), quindi stanno con le «da confermare», non fra le fatte.
  const fatturate = proforme.filter((p) => p.stato === "fatturata" && p.fatturaNumero);
  const inAttesa = proforme.filter(
    (p) => p.stato === "inviata" || (p.stato === "fatturata" && !p.fatturaNumero)
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{preventivi ? "Preventivi" : "Pro-forma"}</h1>
          <p className="page-caption">
            {preventivi
              ? "Le offerte mandate ai clienti: le accettano o le rifiutano loro, e quelle accettate diventano fattura."
              : "Fatture pro-forma da inviare ai partner: alla conferma diventano fattura, altrimenti si annullano."}
          </p>
          {/* Le due serie sono documenti diversi con numerazioni diverse (PV/PF):
              si passa dall'una all'altra da qui, invece di conoscere l'indirizzo. */}
          <div className="filters" style={{ marginTop: 8, gap: 8 }}>
            <Link href="/proforma" className={`btn small ${preventivi ? "secondary" : "primary"}`}>Pro-forma</Link>
            <Link href="/proforma?tipo=preventivo" className={`btn small ${preventivi ? "primary" : "secondary"}`}>Preventivi</Link>
          </div>
        </div>
        <div className="page-actions">
          {/* Il preventivo lo apre chi vende, di norma da Scout (Richieste
              Clienti): qui si guarda e si chiude. Un «+ Nuovo preventivo»
              scollegato dalla richiesta creerebbe documenti che nessuna
              richiesta conosce. */}
          {!preventivi ? <Link href="/proforma/nuova" className="btn primary">+ Nuova pro-forma</Link> : null}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Emesse {intervalloPeriodo ? "nel periodo" : `nel ${anno}`}</div>
          <div className="kpi-value">{euro(attive.reduce((a, p) => a + p.totali.totale, 0))}</div>
          <div className="kpi-sub">{attive.length} {preventivi ? "preventivi" : "pro-forma"} (esclusi gli annullati)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Inviate, in attesa di esito</div>
          <div className={`kpi-value ${inAttesa.length > 0 ? "neg" : ""}`}>
            {euro(inAttesa.reduce((a, p) => a + p.totali.totale, 0))}
          </div>
          <div className="kpi-sub">{inAttesa.length} da confermare o annullare</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Andate a fattura</div>
          <div className="kpi-value pos">{euro(fatturate.reduce((a, p) => a + p.totali.totale, 0))}</div>
          <div className="kpi-sub">{fatturate.length} confermate</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): link GET, un solo
            parametro, sulla data di EMISSIONE. Sono FUORI dal form: il submit
            (che rimanda l'anno) le azzera da solo. */}
        <div className="filters riga-chips-scorri" style={{ marginBottom: 10 }}>
          {([
            { v: "mese", l: "Mese in corso" },
            { v: "scorso", l: "Mese scorso" },
            { v: "trimestre", l: "Trimestre" },
            { v: "anno", l: "Anno" },
          ] as const).map((p) => (
            <Link
              key={p.v}
              href={`/proforma?periodo=${p.v}${preventivi ? "&tipo=preventivo" : ""}${sp.stato ? `&stato=${sp.stato}` : ""}${sp.partnerId ? `&partnerId=${sp.partnerId}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`chip-link${sp.periodo === p.v ? " attiva" : ""}`}
            >
              {p.l}
            </Link>
          ))}
          {intervalloPeriodo ? (
            <Link href={`/proforma${preventivi ? "?tipo=preventivo" : ""}`} className="chip-link azzera">
              Tutto l&apos;anno
            </Link>
          ) : null}
        </div>
        <form className="filters" method="get">
          {/* La ricerca (Libro v1.9 §8-bis): partner, oggetto o progressivo. */}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cerca per partner, oggetto o numero…"
          />
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select name="partnerId" defaultValue={sp.partnerId ?? ""}>
            <option value="">Tutti i partner</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input type="hidden" name="anno" value={anno} />
          {/* Senza questo, filtrare i preventivi riportava alle pro-forma: il
              form GET manda solo i campi che ha. */}
          {preventivi ? <input type="hidden" name="tipo" value="preventivo" /> : null}
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {proforme.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">{preventivi ? "Nessun preventivo" : "Nessuna pro-forma"}</div>
            <div className="empty-text">
              {preventivi
                ? "I preventivi nascono dalle richieste dei clienti in Scout («Richieste Clienti»): da lì si chiede il preventivo, e qui se ne segue l’esito."
                : "Crea la prima con «+ Nuova pro-forma»: la prepari, la invii al partner e ne segui l’esito da qui."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="N°" campo="numero" sp={sp} path="/proforma" />
                  <ThSort label="Partner" campo="partner" sp={sp} path="/proforma" />
                  <ThSort label="Data" campo="data" sp={sp} path="/proforma" />
                  <th>Oggetto</th>
                  <ThSort label="Scadenza" campo="scadenza" sp={sp} path="/proforma" />
                  <ThSort label="Totale doc." campo="totale" sp={sp} path="/proforma" num />
                  <ThSort label="Stato" campo="stato" sp={sp} path="/proforma" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proforme.map((p) => {
                  const st = statoDocumento(tipo, p.stato, p.fatturaNumero);
                  return (
                    // «La riga si apre col click» (Libro UX&UI v1.6 §8).
                    <RigaLink key={p.id} href={`/proforma/${p.id}`} className="riga-link">
                      <td>
                        <Link href={`/proforma/${p.id}`} style={{ color: "var(--blue)", fontWeight: 500 }}>
                          {rifProForma(p)}
                        </Link>
                      </td>
                      <td><Link href={`/partner/${p.partnerId}`} style={{ fontWeight: 500 }}>{p.partner.nome}</Link></td>
                      <td>{dataIt(p.data)}</td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.oggetto ?? "—"}
                      </td>
                      <td>{dataIt(p.scadenza)}</td>
                      <td className="num">{euro(p.totali.totale)}</td>
                      <td>
                        <span className={`badge ${st.badge}`}>
                          <span className="dot" />
                          {st.label}
                          {p.stato === "fatturata" && p.fatturaNumero ? ` n. ${p.fatturaNumero}` : ""}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <Link href={`/proforma/${p.id}`} className="btn small secondary">Apri</Link>
                          {!(p.stato === "fatturata" && p.fatturaNumero) && (
                            <form action={deleteProForma.bind(null, p.id)} style={{ display: "inline" }}>
                              <ConfermaElimina
                                className="btn small icon danger"
                                trigger={IconaCestino}
                                inCorso="Elimino…"
                                verbo="Elimina"
                                oggetto={p.stato === "bozza" ? `la bozza ${rifProForma(p)}` : `la pro-forma ${rifProForma(p)}`}
                                conseguenza="Non è stata emessa su Fatture in Cloud: sparisce solo questo documento, non c'è nessuna fattura da toccare."
                              />
                            </form>
                          )}
                        </span>
                      </td>
                    </RigaLink>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
