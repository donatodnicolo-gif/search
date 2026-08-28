import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { TIPI_PL } from "@/lib/categorie-spesa";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

// SCHEDA DI UN MOVIMENTO BANCARIO. In elenco la causale è troncata e l'IBAN non
// si vede: qui c'è il record intero, così com'è arrivato dalla banca (Qonto o
// file), più lo stato in riconciliazione e il contesto della controparte.
//
// ⚠️ Non è la pagina dove si CLASSIFICA un costo: quella è /spese/[id], che ha
// l'elenco delle categorie di Budgets e la loro modifica. Qui la categoria si
// LEGGE e, se è un'uscita, un link porta là a cambiarla. Due schede vicine ma
// con un compito diverso — questa «cos'è il movimento», l'altra «che costo è».

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ width: 190, flexShrink: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{etichetta}</div>
      <div style={{ fontSize: 13.5, minWidth: 0, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

function daQonto(fonte: string | null): boolean {
  return (fonte ?? "").startsWith("Qonto");
}

export default async function MovimentoDettaglio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const t = await prisma.transazioneBancaria.findUnique({
    where: { id },
    include: { partner: { select: { id: true, nome: true } } },
  });
  if (!t) notFound();

  const uscita = t.importo < 0;

  // Gli altri movimenti della stessa controparte: il contesto per capire se è
  // un rapporto ricorrente o un caso isolato. Solo se la controparte c'è —
  // raggruppare per causale libera accosterebbe cose che non c'entrano.
  const altri = t.controparte
    ? await prisma.transazioneBancaria.findMany({
        where: { controparte: t.controparte, id: { not: t.id } },
        orderBy: { data: "desc" },
        take: 25,
        select: { id: true, data: true, importo: true, descrizione: true, stato: true },
      })
    : [];

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <TornaIndietro fallback="/movimenti" label="Tutti i movimenti" />
      </div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.controparte ?? "Movimento senza controparte"}</h1>
          <p className="page-caption">
            {uscita ? "Uscita" : "Entrata"} di <strong>{euro(Math.abs(t.importo))}</strong> del {dataIt(t.data)} ·{" "}
            {daQonto(t.fonte) ? "arrivata da Qonto" : "caricata da file"}
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
          <div className="kpi-sub">{dataIt(t.data)} · {t.divisa}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Fonte</div>
          <div className="kpi-value" style={{ fontSize: 19 }}>
            {daQonto(t.fonte) ? (
              <span className="badge blue"><span className="dot" />Qonto</span>
            ) : (
              <span className="badge neutral"><span className="dot" />File</span>
            )}
          </div>
          <div className="kpi-sub" style={{ wordBreak: "break-word" }}>{t.fonte ?? "non indicata"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Stato in riconciliazione</div>
          <div className="kpi-value" style={{ fontSize: 19 }}>
            {t.stato === "registrata" ? (
              <span className="badge green"><span className="dot" />Registrata</span>
            ) : t.stato === "ignorata" ? (
              <span className="badge neutral"><span className="dot" />Ignorata</span>
            ) : (
              <span className="badge orange"><span className="dot" />Da lavorare</span>
            )}
          </div>
          <div className="kpi-sub">{t.esito ? t.esito : "nessuna annotazione"}</div>
        </div>
      </div>

      <h2 className="section-title">Come è arrivato dalla banca</h2>
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
        <Riga etichetta="Da dove arriva">{t.fonte ?? <span className="muted">non indicata</span>}</Riga>
        <Riga etichetta="Registrato in archivio il">{dataIt(t.createdAt)}</Riga>
        <Riga etichetta="Stato">
          {t.stato === "registrata" ? (
            <span className="badge green"><span className="dot" />registrata</span>
          ) : t.stato === "ignorata" ? (
            <span className="badge neutral"><span className="dot" />ignorata</span>
          ) : (
            <span className="badge orange"><span className="dot" />nuova</span>
          )}
          {t.esito && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.esito}</div>}
        </Riga>
        {t.partner && (
          <Riga etichetta="Partner collegato">
            <Link href={`/partner/${t.partner.id}`}>{t.partner.nome}</Link>
          </Riga>
        )}
        <div style={{ paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/transazioni" className="btn secondary small">Apri la riconciliazione →</Link>
        </div>
      </div>

      <h2 className="section-title">Categoria di costo</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        {!uscita ? (
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            È un <strong>accredito</strong>: le categorie di costo riguardano le uscite, qui non se ne assegna nessuna.
          </p>
        ) : (
          <>
            <Riga etichetta="Categoria">
              {t.categoriaNome ? (
                <>
                  {t.categoriaTipoPL && (
                    <span className={`badge ${TIPI_PL[t.categoriaTipoPL]?.badge ?? "neutral"}`} style={{ marginRight: 8 }}>
                      <span className="dot" />
                      {TIPI_PL[t.categoriaTipoPL]?.label ?? t.categoriaTipoPL}
                    </span>
                  )}
                  {t.categoriaNome}
                </>
              ) : (
                <span className="muted">ancora senza categoria</span>
              )}
            </Riga>
            <Riga etichetta="Chi l'ha decisa">
              {t.categoriaDa === "manuale" ? (
                <span className="badge green"><span className="dot" />a mano</span>
              ) : t.categoriaDa === "regola" ? (
                <span className="badge neutral"><span className="dot" />una regola di Budgets</span>
              ) : t.categoriaDa === "ai" ? (
                <span className="badge purple"><span className="dot" />l&apos;AI — è una proposta</span>
              ) : (
                <span className="muted">nessuno</span>
              )}
              {t.categoriaNota && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.categoriaNota}</div>}
            </Riga>
            <div style={{ paddingTop: 12 }}>
              <Link href={`/spese/${t.id}`} className="btn secondary small">
                {t.categoriaNome ? "Cambia la categoria in Spese →" : "Assegna una categoria in Spese →"}
              </Link>
            </div>
          </>
        )}
      </div>

      {t.controparte && (
        <>
          <h2 className="section-title">Altri movimenti con {t.controparte}</h2>
          <div className="card tight">
            {altri.length === 0 ? (
              <p className="muted" style={{ fontSize: 13.5, padding: "16px 20px", margin: 0 }}>
                Nessun altro movimento con questa controparte: è un caso isolato.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Causale</th>
                      <th className="num">Importo</th>
                      <th>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {altri.map((x) => (
                      <tr key={x.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{dataIt(x.data)}</td>
                        <td style={{ maxWidth: 420 }}>
                          <Link href={`/movimenti/${x.id}`}>{x.descrizione}</Link>
                        </td>
                        <td className={`num ${x.importo < 0 ? "neg" : "pos"}`}>
                          {x.importo < 0 ? "−" : "+"}
                          {euro(Math.abs(x.importo))}
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {x.stato === "registrata" ? "registrata" : x.stato === "ignorata" ? "ignorata" : "da lavorare"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
