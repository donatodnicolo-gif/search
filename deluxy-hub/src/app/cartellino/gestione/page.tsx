import Link from "next/link";
import { prisma } from "@/lib/db";
import { richiediAdmin } from "@/lib/sessione-server";
import { richiediDesktop } from "@/lib/solo-desktop";
import { approvaAssenza, mandaPresenze, respingiAssenza } from "@/lib/cartellino-actions";
import { rapportoPresenze, riepilogoMese } from "@/lib/presenze";
import { statoPosta } from "@/lib/posta";
import { RigaPersona } from "./RigaPersona";
import {
  STATO_INFO,
  TIPO_INFO,
  dataBreve,
  formattaDurata,
  intervalloEsteso,
  meseDi,
  meseEsteso,
  oraDi,
  pesoLeggibile,
  type StatoAssenza,
  type TipoAssenza,
} from "@/lib/cartellino";

// Gestione cartellini: solo admin (il middleware lo impone, la pagina lo
// ricontrolla). Si legge sempre fresco: qui si decide su richieste che possono
// essere arrivate un minuto fa.
export const dynamic = "force-dynamic";

const MESSAGGI_ERRORE: Record<string, string> = {
  sparita: "Quella richiesta non esiste più.",
  "non-decidibile": "Una malattia registrata non si approva né si respinge.",
  destinatario: "Indirizzo email non valido.",
  mese: "Mese non valido.",
  invio: "L'email non è partita.",
};

function meseSpostato(mese: string, delta: number): string {
  const [anno, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(anno, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function GestioneCartellinoPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    errore?: string;
    dettaglio?: string;
    a?: string;
    mese?: string;
  }>;
}) {
  await richiediDesktop();
  const sessione = await richiediAdmin();
  const sp = await searchParams;

  const adesso = new Date();
  const mese = sp.mese && /^\d{4}-\d{2}$/.test(sp.mese) ? sp.mese : meseDi(adesso);

  const [riepilogo, richieste, posta] = await Promise.all([
    riepilogoMese(mese, adesso),
    prisma.assenza.findMany({
      where: { stato: "in-attesa" },
      orderBy: { creataIl: "asc" },
      include: {
        utente: { select: { nome: true } },
        certificati: { select: { id: true, nomeFile: true, dimensione: true } },
      },
    }),
    statoPosta(),
  ]);

  // L'anteprima è lo stesso testo che parte: non una descrizione di ciò che
  // partirà, proprio quello. Così non si scopre dopo cosa è stato spedito.
  const anteprima = rapportoPresenze(riepilogo, { daNome: sessione.nome });
  const dentroOra = riepilogo.righe.filter((r) => r.dentroOra);

  const MESSAGGI_OK: Record<string, string> = {
    approvata: "Richiesta approvata.",
    respinta: "Richiesta respinta.",
    inviata: `Presenze inviate${sp.a ? ` a ${sp.a}` : ""}.`,
  };

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Gestione cartellini</h1>
        <p className="page-sub">
          Le timbrature di tutti, le richieste da approvare e il riepilogo da mandare per email. Il
          tuo cartellino è in{" "}
          <Link href="/cartellino" style={{ color: "var(--blue)" }}>
            Cartellino
          </Link>
          .
        </p>
      </div>

      {sp.ok && MESSAGGI_OK[sp.ok] && <div className="avviso ok">{MESSAGGI_OK[sp.ok]}</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">
          {MESSAGGI_ERRORE[sp.errore]}
          {sp.dettaglio && <span className="nota-riga">{sp.dettaglio}</span>}
        </div>
      )}

      <div className="section-label">
        Da decidere {richieste.length > 0 && `· ${richieste.length}`}
      </div>
      {richieste.length === 0 ? (
        <div className="vuoto">Nessuna richiesta in attesa.</div>
      ) : (
        <div className="card" style={{ padding: "20px 12px" }}>
          <div className="tabella-scroll">
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
                    {a.motivo && <span className="nota-riga">{a.motivo}</span>}
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
        </div>
      )}

      <div className="section-label">In sede adesso</div>
      {dentroOra.length === 0 ? (
        <div className="vuoto">Nessuno ha un turno aperto.</div>
      ) : (
        <div className="marcature">
          {dentroOra.map((r) => (
            <span key={r.utenteId} className="marca entrata">
              {r.nome} · dalle {r.dentroOra!.dalle ? oraDi(r.dentroOra!.dalle) : "—"} (
              {formattaDurata(r.dentroOra!.minuti)})
            </span>
          ))}
        </div>
      )}

      <div className="section-label">Le timbrature di tutti</div>
      <div className="mese-nav">
        <Link className="btn ghost" href={`/cartellino/gestione?mese=${meseSpostato(mese, -1)}`}>
          ← Mese precedente
        </Link>
        <strong>{riepilogo.etichettaMese}</strong>
        <span className="mese-totale">
          {riepilogo.righe.length} persone attive · totale {formattaDurata(riepilogo.totaleMinuti)}
        </span>
        <Link className="btn ghost" href={`/cartellino/gestione?mese=${meseSpostato(mese, 1)}`}>
          Mese successivo →
        </Link>
      </div>

      <div className="card" style={{ padding: "20px 12px" }}>
        <div className="tabella-scroll">
          <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Ore del mese</th>
              <th>Giorni timbrati</th>
              <th>Giorni di assenza</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {riepilogo.righe.map((r) => (
              <RigaPersona
                key={r.utenteId}
                nome={r.nome}
                email={r.email}
                ore={formattaDurata(r.minuti)}
                notaOre={r.dentroOra ? "turno aperto ora" : null}
                giorniTimbrati={r.giornate.length}
                giorniAssenza={r.giorniAssenza}
                haDettaglio={r.giornate.length > 0 || r.assenze.length > 0}
              >
                {/* Il dettaglio giorno per giorno è già in memoria: si apre e si
                    chiude senza ricaricare né interrogare di nuovo il database. */}
                <div className="dettaglio-persona">
                  {r.giornate.map((g) => (
                    <div key={g.giorno} className="riga-giorno">
                      <span className="riga-giorno-data">{dataBreve(g.data)}</span>
                      <span>
                        {g.turni.map((t, i) => (
                          <span key={i} className="marca">
                            {oraDi(t.entrata)} → {t.uscita ? oraDi(t.uscita) : "in corso"}
                          </span>
                        ))}
                        {g.conManuali && (
                          <span className="nota-riga">
                            righe inserite a mano
                            {g.motivi.length > 0 && `: ${g.motivi.join("; ")}`}
                          </span>
                        )}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formattaDurata(g.minuti)}
                      </span>
                    </div>
                  ))}
                  {r.assenze.map((a, i) => (
                    <div key={i} className="riga-giorno">
                      <span className="riga-giorno-data">
                        {TIPO_INFO[a.tipo as TipoAssenza]?.etichetta ?? a.tipo}
                      </span>
                      <span>
                        {intervalloEsteso(a.dal, a.al)}
                        {a.motivo && <span className="nota-riga">{a.motivo}</span>}
                      </span>
                      <span className={STATO_INFO[a.stato as StatoAssenza]?.classe ?? "badge"}>
                        <span className="dot" />
                        {STATO_INFO[a.stato as StatoAssenza]?.etichetta ?? a.stato}
                      </span>
                    </div>
                  ))}
                </div>
              </RigaPersona>
            ))}
          </tbody>
        </table>
          </div>
      </div>

      {/* ---------- Invio per email ---------- */}
      <div className="section-label">Manda le presenze per email</div>
      <div className="card">
        {posta.pronta ? (
          <>
            <form action={mandaPresenze} className="griglia-form">
              <input type="hidden" name="mese" value={mese} />
              <label className="campo">
                <span>Destinatario</span>
                <input
                  type="email"
                  name="destinatario"
                  required
                  placeholder="commercialista@studio.it"
                />
              </label>
              <label className="campo campo-largo">
                <span>Nota da mettere in cima (facoltativa)</span>
                <input name="nota" placeholder="Presenze del mese per le buste paga" />
              </label>
              <button type="submit" className="btn primary">
                Manda {riepilogo.etichettaMese}
              </button>
            </form>
            <p className="nota">
              Parte da <strong>{posta.mittente}</strong> (credenziali prese{" "}
              {posta.origine === "ambiente" ? "dalle variabili d'ambiente" : "dalla cassaforte"}) e
              contiene le ore, i turni giorno per giorno e le assenze di tutte le persone attive nel
              mese scelto: sono dati personali, controlla l'indirizzo prima di mandarlo.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong>Posta non configurata.</strong> Per mandare il riepilogo serve un server SMTP:
              scrivi <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> (e se
              serve <code>SMTP_PORT</code>, <code>SMTP_FROM</code>) nella cassaforte{" "}
              <Link href="/chiavi" style={{ color: "var(--blue)" }}>
                /chiavi
              </Link>{" "}
              sotto il progetto <strong>hub</strong>, oppure come variabili d&apos;ambiente su
              Vercel. Le variabili d&apos;ambiente hanno la precedenza.
            </p>
            <p className="nota">
              Nel frattempo il riepilogo qui sotto si può copiare e incollare in un&apos;email.
            </p>
          </>
        )}

        <details className="dettaglio" style={{ marginTop: 18 }}>
          <summary>Anteprima esatta di ciò che viene mandato</summary>
          <pre className="anteprima">{anteprima.testo}</pre>
        </details>
      </div>
    </main>
  );
}
