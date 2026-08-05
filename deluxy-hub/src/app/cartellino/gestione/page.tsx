import Link from "next/link";
import { prisma } from "@/lib/db";
import { richiediAdmin } from "@/lib/sessione-server";
import { richiediDesktop } from "@/lib/solo-desktop";
import { approvaAssenza, respingiAssenza } from "@/lib/cartellino-actions";
import {
  STATO_INFO,
  TIPO_INFO,
  confiniMese,
  formattaDurata,
  giorniCoperti,
  giornoAData,
  giornoDi,
  intervalloEsteso,
  meseDi,
  meseEsteso,
  minutiLavorati,
  oraDi,
  pesoLeggibile,
  type StatoAssenza,
  type TipoAssenza,
} from "@/lib/cartellino";

// Gestione cartellini: solo admin (il middleware lo impone, la pagina lo
// ricontrolla). Si legge sempre fresco: qui si decide su richieste che possono
// essere arrivate un minuto fa.
export const dynamic = "force-dynamic";

const MESSAGGI_OK: Record<string, string> = {
  approvata: "Richiesta approvata.",
  respinta: "Richiesta respinta.",
};

const MESSAGGI_ERRORE: Record<string, string> = {
  sparita: "Quella richiesta non esiste più.",
  "non-decidibile": "Una malattia registrata non si approva né si respinge.",
};

function meseSpostato(mese: string, delta: number): string {
  const [anno, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(anno, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function GestioneCartellinoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string; mese?: string }>;
}) {
  await richiediDesktop();
  await richiediAdmin();
  const sp = await searchParams;

  const adesso = new Date();
  const oggi = giornoDi(adesso);
  const mese = sp.mese && /^\d{4}-\d{2}$/.test(sp.mese) ? sp.mese : meseDi(adesso);
  const confini = confiniMese(mese)!;
  const inizioMese = giornoAData(confini.primo)!;
  const fineMese = giornoAData(confini.ultimo)!;

  const [utenti, richieste, timbrature, assenzeMese] = await Promise.all([
    prisma.utente.findMany({
      where: { attivo: true },
      select: { id: true, nome: true, email: true },
      orderBy: { nome: "asc" },
    }),
    prisma.assenza.findMany({
      where: { stato: "in-attesa" },
      orderBy: { creataIl: "asc" },
      include: {
        utente: { select: { nome: true } },
        certificati: { select: { id: true, nomeFile: true, dimensione: true, protocollo: true } },
      },
    }),
    prisma.timbratura.findMany({
      where: { giorno: { gte: confini.primo, lte: confini.ultimo } },
      orderBy: { istante: "asc" },
    }),
    // Le assenze che toccano il mese: iniziate prima e finite dopo comprese.
    prisma.assenza.findMany({
      where: { dal: { lte: fineMese }, al: { gte: inizioMese }, stato: { not: "respinta" } },
      include: { utente: { select: { nome: true } } },
      orderBy: { dal: "asc" },
    }),
  ]);

  // Ore del mese e turni aperti, persona per persona.
  const perUtente = new Map<string, Map<string, typeof timbrature>>();
  for (const t of timbrature) {
    const giorni = perUtente.get(t.utenteId) ?? new Map<string, typeof timbrature>();
    const righe = giorni.get(t.giorno) ?? [];
    righe.push(t);
    giorni.set(t.giorno, righe);
    perUtente.set(t.utenteId, giorni);
  }

  const riepilogo = utenti.map((u) => {
    const giorni = perUtente.get(u.id) ?? new Map<string, typeof timbrature>();
    let minuti = 0;
    for (const [g, righe] of giorni) {
      minuti += minutiLavorati(righe, g === oggi ? adesso : null).minuti;
    }
    const diOggi = giorni.get(oggi) ?? [];
    const statoOggi = minutiLavorati(diOggi, adesso);

    // Giorni di assenza che cadono dentro il mese guardato.
    const giorniAssenza = assenzeMese
      .filter((a) => a.utenteId === u.id)
      .reduce((acc, a) => {
        const dal = a.dal < inizioMese ? inizioMese : a.dal;
        const al = a.al > fineMese ? fineMese : a.al;
        return acc + giorniCoperti(dal, al);
      }, 0);

    return { utente: u, minuti, giorniLavorati: giorni.size, statoOggi, giorniAssenza };
  });

  const dentroOra = riepilogo.filter((r) => r.statoOggi.aperto);

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Gestione cartellini</h1>
        <p className="page-sub">
          Le richieste da approvare e le ore di tutti. Il tuo cartellino è in{" "}
          <Link href="/cartellino" style={{ color: "var(--blue)" }}>
            Cartellino
          </Link>
          .
        </p>
      </div>

      {sp.ok && MESSAGGI_OK[sp.ok] && <div className="avviso ok">{MESSAGGI_OK[sp.ok]}</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">{MESSAGGI_ERRORE[sp.errore]}</div>
      )}

      <div className="section-label">
        Da decidere {richieste.length > 0 && `· ${richieste.length}`}
      </div>
      {richieste.length === 0 ? (
        <div className="vuoto">Nessuna richiesta in attesa.</div>
      ) : (
        <div className="card" style={{ padding: "20px 12px" }}>
          <table>
            <thead>
              <tr>
                <th>Chi</th>
                <th>Periodo</th>
                <th>Tipo</th>
                <th>Allegati</th>
                <th>Decisione</th>
              </tr>
            </thead>
            <tbody>
              {richieste.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.utente.nome}</td>
                  <td>
                    {intervalloEsteso(a.dal, a.al)}
                    {a.motivo && <div className="nota-riga">{a.motivo}</div>}
                  </td>
                  <td>{TIPO_INFO[a.tipo as TipoAssenza]?.etichetta ?? a.tipo}</td>
                  <td>
                    {a.certificati.length === 0 ? (
                      <span className="nota-riga">nessuno</span>
                    ) : (
                      a.certificati.map((c) => (
                        <a
                          key={c.id}
                          className="marca"
                          href={`/cartellino/certificato/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📎 {c.nomeFile} ({pesoLeggibile(c.dimensione)})
                        </a>
                      ))
                    )}
                  </td>
                  <td>
                    {/* Un form solo, due azioni: la nota vale per entrambe. Il
                        `value` di un bottone non arriverebbe alla server action,
                        quindi la decisione la porta la formAction. */}
                    <form action={approvaAssenza} style={{ display: "grid", gap: 8, minWidth: 220 }}>
                      <input type="hidden" name="id" value={a.id} />
                      <input name="nota" placeholder="Nota per chi ha chiesto (facoltativa)" />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" formAction={approvaAssenza} className="btn primary">
                          Approva
                        </button>
                        <button type="submit" formAction={respingiAssenza} className="btn danger">
                          Respingi
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-label">In sede adesso</div>
      {dentroOra.length === 0 ? (
        <div className="vuoto">Nessuno ha un turno aperto.</div>
      ) : (
        <div className="marcature">
          {dentroOra.map((r) => (
            <span key={r.utente.id} className="marca entrata">
              {r.utente.nome} · dalle {r.statoOggi.dalle ? oraDi(r.statoOggi.dalle) : "—"} (
              {formattaDurata(r.statoOggi.minuti)})
            </span>
          ))}
        </div>
      )}

      <div className="section-label">Riepilogo del mese</div>
      <div className="mese-nav">
        <Link className="btn ghost" href={`/cartellino/gestione?mese=${meseSpostato(mese, -1)}`}>
          ← Mese precedente
        </Link>
        <strong>{meseEsteso(mese)}</strong>
        <span className="mese-totale">{utenti.length} persone attive</span>
        <Link className="btn ghost" href={`/cartellino/gestione?mese=${meseSpostato(mese, 1)}`}>
          Mese successivo →
        </Link>
      </div>

      <div className="card" style={{ padding: "20px 12px" }}>
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Ore del mese</th>
              <th>Giorni timbrati</th>
              <th>Giorni di assenza</th>
            </tr>
          </thead>
          <tbody>
            {riepilogo.map((r) => (
              <tr key={r.utente.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.utente.nome}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                    {r.utente.email}
                  </div>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formattaDurata(r.minuti)}
                  {r.statoOggi.aperto && <span className="nota-riga">turno aperto ora</span>}
                </td>
                <td>{r.giorniLavorati || "—"}</td>
                <td>{r.giorniAssenza || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-label">Assenze che toccano il mese</div>
      {assenzeMese.length === 0 ? (
        <div className="vuoto">Nessuna assenza in questo mese.</div>
      ) : (
        <div className="card" style={{ padding: "20px 12px" }}>
          <table>
            <thead>
              <tr>
                <th>Chi</th>
                <th>Periodo</th>
                <th>Tipo</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {assenzeMese.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.utente.nome}</td>
                  <td>{intervalloEsteso(a.dal, a.al)}</td>
                  <td>{TIPO_INFO[a.tipo as TipoAssenza]?.etichetta ?? a.tipo}</td>
                  <td>
                    <span className={STATO_INFO[a.stato as StatoAssenza]?.classe ?? "badge"}>
                      <span className="dot" />
                      {STATO_INFO[a.stato as StatoAssenza]?.etichetta ?? a.stato}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
