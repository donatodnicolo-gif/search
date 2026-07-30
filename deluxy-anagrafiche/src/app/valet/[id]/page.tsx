import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoValet, impostaArchiviatoValet } from "@/lib/azioni-valet";
import { prisma } from "@/lib/db";
import { eAzione, etichettaCampo, etichettaOrigine } from "@/lib/log-modifiche";
import {
  COLORE_STATO_VALET,
  ETICHETTE_STATO_VALET,
  STATI_VALET,
  isStatoValet,
  nomeCompleto,
} from "@/lib/valet";

export const dynamic = "force-dynamic";

function Campo({ etichetta, valore, largo }: { etichetta: string; valore?: string | null; largo?: boolean }) {
  if (!valore) return null;
  return (
    <div className={largo ? "campo campo-largo" : "campo"}>
      <dt>{etichetta}</dt>
      <dd>{valore}</dd>
    </div>
  );
}

// Scheda del valet: gli stessi mattoni della scheda azienda — dati, pillole di
// stato, storia dei cambiamenti — perché è lo stesso gesto su un soggetto
// diverso, e chi usa il registro non deve reimparare nulla.
export default async function SchedaValet({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ esistente?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await prisma.valet.findUnique({ where: { id } });
  if (!v) notFound();

  const modifiche = await prisma.modifica.findMany({
    where: { valetId: v.id },
    orderBy: { creatoIl: "desc" },
    take: 120,
  });

  const dataOra = (d: Date) =>
    d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="layout">
      <Sidebar valetAttivo />
      <main className="main">
        <a className="ritorno" href="/valet">← Tutti i valet</a>

        {sp.esistente === "1" && (
          <div className="avviso-ok">
            Questo valet era già in elenco con lo stesso numero di telefono: ecco la sua scheda.
          </div>
        )}

        <div className="page-head">
          <div>
            <h1 className="page-title">{nomeCompleto(v)}</h1>
            <p className="page-sub">
              {[v.citta, v.provincia, v.mezzo].filter(Boolean).join(" · ") || "Valet"}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            {v.attivo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="etichetta-interessi">Servizio</span>
                <div className="selettore-stato">
                  {STATI_VALET.map((s) => (
                    <form key={s} action={cambiaStatoValet.bind(null, v.id)}>
                      <input type="hidden" name="stato" value={s} />
                      <button
                        type="submit"
                        className={`stato-pill${v.stato === s ? " attuale" : ""}`}
                        style={{ color: COLORE_STATO_VALET[s] }}
                        disabled={v.stato === s}
                        title={ETICHETTE_STATO_VALET[s]}
                      >
                        <span className="dot" />
                        <span className="stato-label">{ETICHETTE_STATO_VALET[s]}</span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ) : (
              <span className="badge" style={{ color: "var(--text-tertiary)" }}>
                <span className="dot" />
                <span style={{ color: "var(--text)" }}>Archiviato</span>
              </span>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <a
                className="btn btn-secondario"
                href={`/valet/${v.id}/modifica`}
                style={{ fontSize: 12.5, padding: "6px 14px" }}
              >
                ✎ Modifica
              </a>
              <form action={impostaArchiviatoValet.bind(null, v.id, v.attivo)}>
                <button type="submit" className="btn btn-secondario" style={{ fontSize: 12.5, padding: "6px 14px" }}>
                  {v.attivo ? "⌫ Archivia" : "↩ Ripristina"}
                </button>
              </form>
            </div>
          </div>
        </div>

        <section className="scheda">
          <h2 className="scheda-titolo">Anagrafica</h2>
          <dl className="griglia-campi">
            <Campo etichetta="Nome" valore={v.nome} />
            <Campo etichetta="Cognome" valore={v.cognome} />
            <Campo
              etichetta="Telefono"
              valore={v.telefono}
            />
            <Campo etichetta="Email" valore={v.email} />
            <Campo etichetta="Indirizzo" valore={v.indirizzo} largo />
            <Campo etichetta="Città" valore={v.citta} />
            <Campo etichetta="Provincia" valore={v.provincia} />
            <Campo etichetta="Province servite" valore={v.provinceServite} />
            <Campo etichetta="Mezzo" valore={v.mezzo} />
            <Campo etichetta="Codice fiscale" valore={v.codiceFiscale} />
            <Campo etichetta="P. IVA" valore={v.pIva} />
            <Campo
              etichetta="Collegamento piattaforma"
              valore={v.platformId ? `app.deluxy.it · ${v.platformId}` : null}
            />
            <Campo etichetta="Note" valore={v.note} largo />
          </dl>
          <p className="testo-guida" style={{ marginTop: 14 }}>
            Paghe per servizio, province assegnate, disponibilità, stipendi e ricevute vivono nella{" "}
            <strong>piattaforma consegne</strong>: qui c&apos;è chi è la persona e come si raggiunge.
          </p>
        </section>

        <section className="scheda">
          <h2 className="scheda-titolo">
            Storia <span className="scheda-sub">ogni cambiamento registrato su questa persona</span>
          </h2>
            <ol className="storia">
              {/* La creazione sta già in fondo alla lista: la riga di log resta
                  nel database per l'audit ma qui sarebbe un doppione. */}
              {modifiche.filter((m) => m.campo !== "creata").map((m) => (
                <li key={m.id}>
                  <span className="storia-data">{dataOra(m.creatoIl)}</span>
                  <span>
                    <span className="storia-campo">
                      {m.campo === "stato" ? "Stato di servizio" : etichettaCampo(m.campo)}
                    </span>
                    {eAzione(m.campo) ? (
                      (m.a ?? m.da) ? (
                        <>
                          {" "}
                          <strong>{m.a ?? m.da}</strong>
                        </>
                      ) : null
                    ) : (
                      <>
                        {" "}
                        <span className="storia-da">
                          {m.campo === "stato" && m.da && isStatoValet(m.da)
                            ? ETICHETTE_STATO_VALET[m.da]
                            : (m.da ?? "(vuoto)")}
                        </span>{" "}
                        <span className="storia-freccia">→</span>{" "}
                        <strong>
                          {m.campo === "stato" && m.a && isStatoValet(m.a)
                            ? ETICHETTE_STATO_VALET[m.a]
                            : (m.a ?? "(vuoto)")}
                        </strong>
                      </>
                    )}
                  </span>
                  <span className="storia-origine">
                    {etichettaOrigine(m.origine)}
                    {m.autore ? ` · ${m.autore}` : ""}
                  </span>
                </li>
              ))}
              <li>
                <span className="storia-data">{dataOra(v.creatoIl)}</span>
                <span><strong>Creato</strong></span>
                <span className="storia-origine">{etichettaOrigine(v.fonte)}</span>
              </li>
            </ol>
        </section>
      </main>
    </div>
  );
}
