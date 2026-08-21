import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { categorieDaBudgets, TIPI_PL } from "@/lib/categorie-spesa";
import { impostaCategoriaSpesa } from "@/lib/spese-actions";
import { CategoriaSpesa } from "@/components/CategoriaSpesa";

export const dynamic = "force-dynamic";

// SCHEDA DI UN MOVIMENTO DI SPESA. In elenco la causale è troncata e l'IBAN non
// si vede: qui c'è il record intero, più il contesto che serve davvero quando
// si decide una categoria — gli ALTRI movimenti della stessa controparte. Senza
// quello si classifica un bonifico alla volta senza sapere se è un caso isolato
// o una spesa che torna ogni mese.

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ width: 190, flexShrink: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{etichetta}</div>
      <div style={{ fontSize: 13.5, minWidth: 0, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

export default async function MovimentoSpesa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const t = await prisma.transazioneBancaria.findUnique({
    where: { id },
    include: { partner: { select: { id: true, nome: true } } },
  });
  if (!t) notFound();

  const esitoCat = await categorieDaBudgets();
  const categorie = esitoCat.ok ? esitoCat.categorie : [];
  const schedaCat = t.categoriaNome ? categorie.find((c) => c.nome === t.categoriaNome) : undefined;

  // Gli altri movimenti della stessa controparte: è il contesto con cui si
  // decide se questa spesa è un caso o un'abitudine. Solo se la controparte
  // c'è: raggruppare per causale libera accosterebbe cose che non c'entrano.
  const altri = t.controparte
    ? await prisma.transazioneBancaria.findMany({
        where: { controparte: t.controparte, id: { not: t.id }, stato: { not: "ignorata" } },
        orderBy: { data: "desc" },
        take: 25,
        select: { id: true, data: true, importo: true, descrizione: true, categoriaNome: true },
      })
    : [];
  const altreUscite = altri.filter((x) => x.importo < 0);
  const totaleControparte = altreUscite.reduce((a, x) => a + Math.abs(x.importo), 0) + Math.abs(Math.min(t.importo, 0));

  const uscita = t.importo < 0;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/spese" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna alle spese
          </Link>
          <h1 className="page-title">{t.controparte ?? "Movimento senza controparte"}</h1>
          <p className="page-caption">
            {uscita ? "Uscita" : "Entrata"} di <strong>{euro(Math.abs(t.importo))}</strong> del{" "}
            {dataIt(t.data)}
            {t.categoriaNome ? (
              <>
                {" "}
                — classificata come <strong>{t.categoriaNome}</strong>.
              </>
            ) : uscita ? (
              " — ancora senza categoria."
            ) : (
              " — le categorie di costo riguardano le uscite."
            )}
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Importo</div>
          <div className={`kpi-value ${uscita ? "neg" : "pos"}`}>
            {uscita ? "−" : "+"}
            {euro(Math.abs(t.importo))}
          </div>
          <div className="kpi-sub">
            {dataIt(t.data)} · {t.divisa}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Voce di conto economico</div>
          <div className="kpi-value" style={{ fontSize: 19 }}>
            {t.categoriaTipoPL ? (
              <span className={`badge ${TIPI_PL[t.categoriaTipoPL]?.badge ?? "neutral"}`}>
                <span className="dot" />
                {TIPI_PL[t.categoriaTipoPL]?.label ?? t.categoriaTipoPL}
              </span>
            ) : (
              <span className="muted">non assegnata</span>
            )}
          </div>
          <div className="kpi-sub">
            {schedaCat?.quotaPartner
              ? "partita di giro: non è un costo"
              : t.categoriaNome
                ? `categoria «${t.categoriaNome}»`
                : "il conto economico non la vede finché resta vuota"}
          </div>
        </div>
        {t.controparte && (
          <div className="kpi">
            <div className="kpi-label">Con questa controparte</div>
            <div className="kpi-value neg">{euro(totaleControparte)}</div>
            <div className="kpi-sub">
              {altreUscite.length + (uscita ? 1 : 0)} uscite in archivio
              {altri.length === 25 ? " (mostrate le 25 più recenti)" : ""}
            </div>
          </div>
        )}
      </div>

      <h2 className="section-title">Il movimento come è arrivato dalla banca</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        <Riga etichetta="Data">{dataIt(t.data)}</Riga>
        <Riga etichetta="Importo">
          <span className={uscita ? "neg" : "pos"} style={{ fontWeight: 600 }}>
            {uscita ? "−" : "+"}
            {euro(Math.abs(t.importo))}
          </span>{" "}
          <span className="muted">{t.divisa}</span>
        </Riga>
        <Riga etichetta="Controparte">{t.controparte ?? <span className="muted">non indicata</span>}</Riga>
        <Riga etichetta="IBAN controparte">
          {t.ibanControparte ?? <span className="muted">non presente nell&apos;estratto</span>}
        </Riga>
        <Riga etichetta="Causale (per intero)">{t.descrizione}</Riga>
        <Riga etichetta="Da dove arriva">
          {t.fonte ?? <span className="muted">non indicata</span>}
        </Riga>
        <Riga etichetta="Stato in riconciliazione">
          {t.stato === "registrata" ? (
            <span className="badge green">
              <span className="dot" />
              registrata
            </span>
          ) : t.stato === "ignorata" ? (
            <span className="badge neutral">
              <span className="dot" />
              ignorata
            </span>
          ) : (
            <span className="badge orange">
              <span className="dot" />
              nuova
            </span>
          )}
          {t.esito && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.esito}</div>}
        </Riga>
        {t.partner && (
          <Riga etichetta="Partner collegato">
            <Link href={`/partner/${t.partner.id}`}>{t.partner.nome}</Link>
          </Riga>
        )}
        <div style={{ paddingTop: 10 }}>
          <Link href="/transazioni" className="btn secondary small">
            Apri la riconciliazione →
          </Link>
        </div>
      </div>

      <h2 className="section-title">Categoria di costo</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        {!uscita ? (
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            Questo è un <strong>accredito</strong>: le categorie di costo di Budgets riguardano le uscite, quindi
            qui non se ne assegna nessuna.
          </p>
        ) : (
          <>
            <Riga etichetta="Categoria">
              {categorie.length > 0 ? (
                <CategoriaSpesa
                  valore={t.categoriaId ?? ""}
                  categorie={categorie}
                  azione={impostaCategoriaSpesa.bind(null, t.id)}
                />
              ) : (
                <>
                  {t.categoriaNome ?? <span className="muted">nessuna</span>}
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Le categorie non sono arrivate da Budgets: da qui non si può cambiare.
                  </div>
                </>
              )}
            </Riga>
            <Riga etichetta="In bilancio">
              {schedaCat?.voceCE ?? (
                <span className="muted">dedotta dalla voce di P&amp;L — nessuno l&apos;ha decisa in Budgets</span>
              )}
            </Riga>
            <Riga etichetta="Chi l'ha decisa">
              {t.categoriaDa === "manuale" ? (
                <>
                  <span className="badge green">
                    <span className="dot" />a mano
                  </span>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    «Riclassifica tutto» non la tocca: una persona che decide batte una regola. Se è sbagliata,
                    resta sbagliata finché non la si corregge qui.
                  </div>
                </>
              ) : t.categoriaDa === "regola" ? (
                <>
                  <span className="badge neutral">
                    <span className="dot" />una regola di Budgets
                  </span>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    La regola nomina la controparte: correggerla in Budgets cambia anche i movimenti futuri.
                  </div>
                </>
              ) : t.categoriaDa === "ai" ? (
                <>
                  <span className="badge purple">
                    <span className="dot" />l&apos;AI — è una proposta
                  </span>
                  {t.categoriaNota && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Motivo: {t.categoriaNota}
                    </div>
                  )}
                </>
              ) : (
                <span className="muted">nessuno: la categoria non è stata assegnata</span>
              )}
            </Riga>
            <Riga etichetta="Quando">
              {t.categoriaIl ? dataIt(t.categoriaIl) : <span className="muted">—</span>}
            </Riga>
            {schedaCat?.descrizione && (
              <Riga etichetta="Cosa ci va dentro">
                {schedaCat.quotaPartner && (
                  <div style={{ marginBottom: 4 }}>
                    <span className="badge gold">
                      <span className="dot" />partita di giro
                    </span>
                  </div>
                )}
                {schedaCat.descrizione}
              </Riga>
            )}
          </>
        )}
      </div>

      {t.controparte && (
        <>
          <h2 className="section-title">Altri movimenti con {t.controparte}</h2>
          <div className="card tight">
            {altri.length === 0 ? (
              <p className="muted" style={{ fontSize: 13.5, padding: "16px 20px", margin: 0 }}>
                Nessun altro movimento con questa controparte: è un caso isolato, non una spesa che torna.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Causale</th>
                      <th className="num">Importo</th>
                      <th>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {altri.map((x) => (
                      <tr key={x.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{dataIt(x.data)}</td>
                        <td style={{ maxWidth: 420 }}>
                          <Link href={`/spese/${x.id}`}>{x.descrizione}</Link>
                        </td>
                        <td className={`num ${x.importo < 0 ? "neg" : "pos"}`}>
                          {x.importo < 0 ? "−" : "+"}
                          {euro(Math.abs(x.importo))}
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {x.categoriaNome ?? <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ fontSize: 12, padding: "10px 20px", margin: 0 }}>
              Se questa spesa torna sempre uguale, la cosa da fare non è assegnarla a mano ogni volta ma scrivere
              la <strong>regola in Budgets</strong>. ⚠️ Ma non su un circuito di pagamento — PayPal, SumUp,
              Satispay: quello dice <em>come</em> hai pagato, non <em>cosa</em> hai comprato, e la regola
              metterebbe nella stessa voce acquisti che non c&apos;entrano fra loro.
            </p>
          </div>
        </>
      )}
    </>
  );
}
