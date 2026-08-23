import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_CANALE, formattaDataOra } from "@/lib/dominio";
import { spiegaErroreGoogle } from "@/lib/errori-google";

export const dynamic = "force-dynamic";

// L'archivio delle operazioni: tutto quello che è già successo, con la ricerca.
//
// ⚠️ PERCHÉ ESISTE. La pagina Operazioni serve a decidere: cosa aspetta, cosa è
// appena partito. Lo storico completo, in fondo alla stessa pagina, la faceva
// crescere all'infinito e nascondeva proprio la parte viva — e comunque non
// rispondeva alla domanda che si fa sul passato, che non è «cosa è successo»
// ma «quando abbiamo toccato QUESTA cosa». Quella domanda vuole una ricerca,
// non uno scorrimento.
//
// Qui non si agisce: si guarda. Le azioni (riprovare, accettare una divergenza,
// rimettere in coda) stanno sulla pagina di lavoro, dove c'è il contesto per
// decidere.

const PER_PAGINA = 100;

const ETICHETTA_STATO: Record<string, string> = {
  eseguita: "Eseguita",
  fallita: "Fallita",
  annullata: "Annullata",
  in_attesa: "Da approvare",
  approvata: "Approvata",
};

const COLORE_STATO: Record<string, string> = {
  eseguita: "var(--green)",
  fallita: "var(--red)",
  annullata: "var(--text-tertiary)",
  in_attesa: "var(--orange)",
  approvata: "var(--blue)",
};

export default async function ArchivioOperazioni({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; canale?: string; stato?: string; tipo?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const canale = sp.canale ?? "";
  const stato = sp.stato ?? "";
  const tipo = sp.tipo ?? "";
  const pagina = Math.max(1, Number(sp.p ?? "1") || 1);

  // ⚠️ La ricerca guarda anche MOTIVO ed ESITO, non solo il bersaglio: quando
  // si torna sul passato spesso ci si ricorda della frase («destination not
  // working», «duplicate asset», «era voluto») e non del nome esatto della
  // campagna. Cercare solo nei nomi vorrebbe dire non trovare mai niente
  // partendo da quello che si ricorda davvero.
  const dove = {
    ...(canale ? { canale } : {}),
    ...(stato ? { stato } : {}),
    ...(tipo ? { tipo } : {}),
    ...(q
      ? {
          OR: [
            { bersaglio: { contains: q, mode: "insensitive" as const } },
            { tipo: { contains: q, mode: "insensitive" as const } },
            { motivo: { contains: q, mode: "insensitive" as const } },
            { esito: { contains: q, mode: "insensitive" as const } },
            { parametri: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [righe, totale, tipiPresenti] = await Promise.all([
    prisma.operazioneAdv.findMany({
      where: dove,
      orderBy: { creataIl: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.operazioneAdv.count({ where: dove }),
    prisma.operazioneAdv.groupBy({ by: ["tipo"], _count: { _all: true } }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const link = (cambi: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const valori: Record<string, string | number | undefined> = { q, canale, stato, tipo, p: pagina, ...cambi };
    for (const [k, v] of Object.entries(valori)) {
      if (v != null && v !== "" && !(k === "p" && Number(v) === 1)) u.set(k, String(v));
    }
    const s = u.toString();
    return `/operazioni/archivio${s ? `?${s}` : ""}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="operazioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Archivio operazioni</h1>
            <p className="page-sub">
              Tutto quello che è stato messo in coda, da sempre: <b>{totale}</b> righe con questi
              filtri. La pagina <a href="/operazioni">Operazioni</a> tiene solo quello su cui si
              lavora adesso — la coda viva e gli ultimi 7 giorni.
            </p>
          </div>
          <a className="btn small btn-secondario" href="/operazioni">
            ← Operazioni
          </a>
        </div>

        <section className="scheda">
          <form className="filtri" method="get" action="/operazioni/archivio">
            {/* ⚠️ La casella cerca anche nel MOTIVO e nell'ESITO: del passato ci
                si ricorda la frase, non il nome esatto della campagna. */}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Cerca: campagna, parola, motivo, errore…"
              style={{ minWidth: 280 }}
            />
            <select name="canale" defaultValue={canale}>
              <option value="">Tutte le piattaforme</option>
              <option value="google_ads">Google Ads</option>
              <option value="meta_ads">Meta Ads</option>
            </select>
            <select name="stato" defaultValue={stato}>
              <option value="">Tutti gli stati</option>
              <option value="eseguita">Eseguite</option>
              <option value="fallita">Fallite</option>
              <option value="annullata">Annullate</option>
              <option value="in_attesa">Da approvare</option>
              <option value="approvata">Approvate</option>
            </select>
            <select name="tipo" defaultValue={tipo}>
              <option value="">Tutti i tipi</option>
              {tipiPresenti
                .sort((a, b) => b._count._all - a._count._all)
                .map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.tipo.split("_").join(" ")} ({t._count._all})
                  </option>
                ))}
            </select>
            <button className="btn small" type="submit">
              Cerca
            </button>
            {(q || canale || stato || tipo) && (
              <a className="btn small btn-secondario" href="/operazioni/archivio">
                Pulisci
              </a>
            )}
          </form>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">
            {totale === 0
              ? "Nessuna operazione con questi filtri"
              : `${totale} operazioni · pagina ${pagina} di ${pagine}`}
          </div>

          {righe.length === 0 ? (
            <div className="vuoto-mini">
              Niente da mostrare. {q && <>La ricerca guarda nome, tipo, motivo, esito e parametri.</>}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Operazione</th>
                    <th>Su cosa</th>
                    <th>Piattaforma</th>
                    <th>Stato</th>
                    <th>Com&apos;è andata</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((o) => {
                    const spiegato = spiegaErroreGoogle(o.esito);
                    return (
                      <tr key={o.id}>
                        <td className="cella-muta" style={{ whiteSpace: "nowrap" }}>
                          {formattaDataOra(o.creataIl)}
                          {/* Quando è stata ESEGUITA è un'altra data, e a volte è
                              giorni dopo: si mostra solo se diversa. */}
                          {o.eseguitaIl && o.eseguitaIl.toDateString() !== o.creataIl.toDateString() && (
                            <div className="cella-sub">eseguita {formattaDataOra(o.eseguitaIl)}</div>
                          )}
                        </td>
                        <td className="cella-nome" style={{ maxWidth: 200 }}>
                          {o.tipo.split("_").join(" ")}
                          {o.livello && <div className="cella-sub">{o.livello}</div>}
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          {o.campagnaId ? (
                            <a href={`/campagne/${o.campagnaId}`}>{o.bersaglio}</a>
                          ) : (
                            o.bersaglio
                          )}
                          {o.motivo && (
                            <div className="cella-sub" style={{ whiteSpace: "normal" }}>{o.motivo}</div>
                          )}
                        </td>
                        <td className="cella-muta">{ETICHETTA_CANALE[o.canale ?? ""] ?? o.canale}</td>
                        <td>
                          <span className="tag-salute" style={{ color: COLORE_STATO[o.stato] }}>
                            <span className="dot" />
                            {ETICHETTA_STATO[o.stato] ?? o.stato}
                          </span>
                        </td>
                        <td className="cella-muta" style={{ maxWidth: 380, whiteSpace: "normal" }}>
                          {/* La traduzione in italiano davanti, il testo di Google
                              sotto: è quello che si cerca quando la traduzione
                              non basta. */}
                          {spiegato && (
                            <div style={{ color: "var(--orange)", fontWeight: 600 }}>{spiegato}</div>
                          )}
                          {o.esito ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagine > 1 && (
            <div className="pill-scelta" style={{ marginTop: 12, flexWrap: "wrap" }}>
              {pagina > 1 && (
                <a className="pill-opt" href={link({ p: pagina - 1 })}>
                  ← Più recenti
                </a>
              )}
              <span className="cella-sub" style={{ alignSelf: "center" }}>
                pagina {pagina} di {pagine}
              </span>
              {pagina < pagine && (
                <a className="pill-opt" href={link({ p: pagina + 1 })}>
                  Più vecchie →
                </a>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
