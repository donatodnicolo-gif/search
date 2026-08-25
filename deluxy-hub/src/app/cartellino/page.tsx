import Link from "next/link";
import { Orologio } from "./Orologio";
import { prisma } from "@/lib/db";
import { richiediSessione } from "@/lib/sessione-server";
import { richiediDesktop } from "@/lib/solo-desktop";
import {
  annullaRichiesta,
  caricaCertificato,
  registraGiornata,
  richiediAssenza,
  timbra,
} from "@/lib/cartellino-actions";
import {
  MAX_CERTIFICATO_BYTE,
  STATO_INFO,
  TIPI_ASSENZA,
  TIPO_INFO,
  confiniMese,
  dataEstesa,
  formattaDurata,
  giornoDi,
  intervalloEsteso,
  meseDi,
  meseEsteso,
  minutiLavorati,
  oraDi,
  pesoLeggibile,
  prossimoVerso,
  turniDelGiorno,
  type StatoAssenza,
  type TipoAssenza,
} from "@/lib/cartellino";

// Il cartellino è il registro delle proprie ore: si rilegge sempre dal database,
// mai da una cache (una timbratura vecchia di 30 secondi è già una bugia).
export const dynamic = "force-dynamic";

const MESSAGGI_OK: Record<string, string> = {
  entrata: "Entrata timbrata.",
  uscita: "Uscita timbrata.",
  giornata: "Giornata registrata a mano.",
  richiesta: "Richiesta inviata: la vedrà un amministratore.",
  malattia: "Malattia registrata.",
  certificato: "Certificato caricato.",
  annullata: "Richiesta annullata.",
};

const MESSAGGI_ERRORE: Record<string, string> = {
  orari: "Orari non validi: usa il formato 09:00.",
  "ordine-orari": "L'uscita deve venire dopo l'entrata.",
  futuro: "Non si registra una giornata che non è ancora arrivata.",
  tipo: "Tipo di assenza non valido.",
  date: "Date non valide.",
  "ordine-date": "Il giorno finale viene prima di quello iniziale.",
  "troppo-lunga": "Periodo troppo lungo: chiedilo a un amministratore.",
  "file-grande": `Il file supera ${pesoLeggibile(MAX_CERTIFICATO_BYTE)}.`,
  "file-tipo": "Formato non ammesso: solo PDF, JPEG o PNG.",
  "file-mancante": "Nessun file selezionato.",
  "non-tua": "Quella riga non è tua.",
  "gia-decisa": "La richiesta è già stata decisa: non si può più annullare.",
};

function meseSpostato(mese: string, delta: number): string {
  const [anno, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(anno, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CartellinoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string; mese?: string }>;
}) {
  await richiediDesktop();
  const sessione = await richiediSessione();
  const sp = await searchParams;

  const adesso = new Date();
  const oggi = giornoDi(adesso);
  const mese = sp.mese && /^\d{4}-\d{2}$/.test(sp.mese) ? sp.mese : meseDi(adesso);
  const confini = confiniMese(mese)!;

  const [timbrature, assenze] = await Promise.all([
    prisma.timbratura.findMany({
      where: { utenteId: sessione.uid, giorno: { gte: confini.primo, lte: confini.ultimo } },
      orderBy: { istante: "asc" },
    }),
    prisma.assenza.findMany({
      where: { utenteId: sessione.uid },
      orderBy: [{ dal: "desc" }],
      take: 40,
      // `dati` dei certificati non si legge qui: sarebbero megabyte di allegati
      // caricati solo per stampare un nome di file.
      include: {
        certificati: {
          select: { id: true, nomeFile: true, dimensione: true, protocollo: true },
          orderBy: { caricatoIl: "asc" },
        },
      },
    }),
  ]);

  // Le timbrature di oggi possono stare fuori dal mese che si sta guardando:
  // il riquadro in alto è sempre quello di oggi, si rilegge a parte.
  const diOggi =
    mese === meseDi(adesso)
      ? timbrature.filter((t) => t.giorno === oggi)
      : await prisma.timbratura.findMany({
          where: { utenteId: sessione.uid, giorno: oggi },
          orderBy: { istante: "asc" },
        });

  const stato = minutiLavorati(diOggi, adesso);
  const verso = prossimoVerso(diOggi[diOggi.length - 1]?.verso);

  // Giorni del mese con almeno una timbratura, dal più recente.
  const perGiorno = new Map<string, typeof timbrature>();
  for (const t of timbrature) {
    const lista = perGiorno.get(t.giorno) ?? [];
    lista.push(t);
    perGiorno.set(t.giorno, lista);
  }
  const giorni = [...perGiorno.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const totaleMese = giorni.reduce(
    (acc, [g, righe]) => acc + minutiLavorati(righe, g === oggi ? adesso : null).minuti,
    0,
  );

  const inAttesa = assenze.filter((a) => a.stato === "in-attesa");

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Cartellino</h1>
        <p className="page-sub">
          Le tue presenze, le assenze e i certificati. Si usa solo da computer.
        </p>
      </div>

      {sp.ok && MESSAGGI_OK[sp.ok] && <div className="avviso ok">{MESSAGGI_OK[sp.ok]}</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">{MESSAGGI_ERRORE[sp.errore]}</div>
      )}

      {/* ---------- Timbratura di oggi ---------- */}
      <div className="section-label">Oggi</div>
      <div className="card timbra-box">
        <div>
          <Orologio oraServer={adesso.getTime()} />
          <div className="timbra-giorno">{dataEstesa(adesso)}</div>
          <div className="timbra-stato">
            {stato.aperto ? (
              <>
                <span className="badge green">
                  <span className="dot" />
                  Dentro
                </span>{" "}
                dalle {stato.dalle ? oraDi(stato.dalle) : "—"} ·{" "}
                {stato.minuti < 1 ? "da poco" : `${formattaDurata(stato.minuti)} finora`}
              </>
            ) : (
              <>
                <span className="badge neutro">
                  <span className="dot" />
                  Fuori
                </span>{" "}
                {stato.minuti > 0
                  ? `${formattaDurata(stato.minuti)} lavorate oggi`
                  : "nessuna timbratura oggi"}
              </>
            )}
          </div>

          {diOggi.length > 0 && (
            <div className="marcature">
              {diOggi.map((t) => (
                <span key={t.id} className={`marca ${t.verso}`} title={t.note || undefined}>
                  {t.verso === "entrata" ? "↓" : "↑"} {oraDi(t.istante)}
                  {t.origine === "manuale" && <em> a mano</em>}
                </span>
              ))}
            </div>
          )}
        </div>

        <form action={timbra}>
          <button type="submit" className={`btn primary timbra-btn ${verso}`}>
            Timbra {verso}
          </button>
        </form>
      </div>

      {/* ---------- Registrazione manuale ---------- */}
      <details className="card dettaglio">
        <summary>Registra una giornata a mano (dimenticanza, fuori sede)</summary>
        <p className="nota">
          Resta segnata come inserita a mano: chi controlla il cartellino vede la differenza
          fra una timbratura e una dichiarazione.
        </p>
        <form action={registraGiornata} className="griglia-form">
          <label className="campo">
            <span>Giorno</span>
            <input type="date" name="giorno" defaultValue={oggi} max={oggi} required />
          </label>
          <label className="campo">
            <span>Entrata</span>
            <input type="time" name="entrata" required />
          </label>
          <label className="campo">
            <span>Uscita (vuoto = turno aperto)</span>
            <input type="time" name="uscita" />
          </label>
          <label className="campo campo-largo">
            <span>Motivo</span>
            <input name="note" placeholder="Dimenticato di timbrare, cliente in sede…" />
          </label>
          <button type="submit" className="btn">
            Registra giornata
          </button>
        </form>
      </details>

      {/* ---------- Mese ---------- */}
      <div className="section-label">Il mese</div>
      <div className="mese-nav">
        <Link className="btn ghost" href={`/cartellino?mese=${meseSpostato(mese, -1)}`}>
          ← Mese precedente
        </Link>
        <strong>{meseEsteso(mese)}</strong>
        <span className="mese-totale">Totale {formattaDurata(totaleMese)}</span>
        <Link className="btn ghost" href={`/cartellino?mese=${meseSpostato(mese, 1)}`}>
          Mese successivo →
        </Link>
      </div>

      {giorni.length === 0 ? (
        <div className="vuoto">Nessuna timbratura in questo mese.</div>
      ) : (
        <div className="card" style={{ padding: "20px 12px" }}>
          <table>
            <thead>
              <tr>
                <th>Giorno</th>
                <th>Turni</th>
                <th>Ore</th>
              </tr>
            </thead>
            <tbody>
              {giorni.map(([g, righe]) => {
                const calcolo = minutiLavorati(righe, g === oggi ? adesso : null);
                return (
                  <tr key={g}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {dataEstesa(righe[0].istante)}
                      {righe.some((r) => r.origine === "manuale") && (
                        <div className="nota-riga">contiene righe inserite a mano</div>
                      )}
                    </td>
                    <td>
                      {turniDelGiorno(righe).map((t, i) => (
                        <span key={i} className="marca">
                          {oraDi(t.entrata)} → {t.uscita ? oraDi(t.uscita) : "in corso"}
                        </span>
                      ))}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {formattaDurata(calcolo.minuti)}
                      {calcolo.aperto && <span className="nota-riga">turno aperto</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Assenze ---------- */}
      <div className="section-label">Ferie, permessi, malattia</div>
      <div className="card">
        <form action={richiediAssenza} className="griglia-form" encType="multipart/form-data">
          <label className="campo">
            <span>Tipo</span>
            <select name="tipo" defaultValue="ferie">
              {TIPI_ASSENZA.map((t) => (
                <option key={t} value={t}>
                  {TIPO_INFO[t].etichetta}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Dal</span>
            <input type="date" name="dal" required defaultValue={oggi} />
          </label>
          <label className="campo">
            <span>Al (vuoto = un giorno solo)</span>
            <input type="date" name="al" />
          </label>
          <label className="campo campo-largo">
            <span>Motivo o nota</span>
            <input name="motivo" placeholder="Facoltativo" />
          </label>
          <label className="campo">
            <span>Certificato (PDF, JPEG o PNG, max {pesoLeggibile(MAX_CERTIFICATO_BYTE)})</span>
            <input type="file" name="certificato" accept="application/pdf,image/jpeg,image/png" />
          </label>
          <label className="campo">
            <span>Numero di protocollo</span>
            <input name="protocollo" placeholder="Solo se il certificato ce l'ha" />
          </label>
          <button type="submit" className="btn primary">
            Invia
          </button>
        </form>
        <p className="nota">
          Ferie, permessi e trasferte le approva un amministratore. La <strong>malattia</strong> non
          si chiede: si registra subito e si allega il certificato, anche più tardi.
        </p>
      </div>

      <div className="section-label">
        Le tue assenze
        {inAttesa.length > 0 && ` · ${inAttesa.length} in attesa di risposta`}
      </div>

      {assenze.length === 0 ? (
        <div className="vuoto">Nessuna assenza registrata.</div>
      ) : (
        <div className="card" style={{ padding: "20px 12px" }}>
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Tipo</th>
                <th>Stato</th>
                <th>Certificati</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assenze.map((a) => (
                <tr key={a.id}>
                  <td>
                    {intervalloEsteso(a.dal, a.al)}
                    {a.motivo && <div className="nota-riga">{a.motivo}</div>}
                  </td>
                  <td>{TIPO_INFO[a.tipo as TipoAssenza]?.etichetta ?? a.tipo}</td>
                  <td>
                    <span className={STATO_INFO[a.stato as StatoAssenza]?.classe ?? "badge"}>
                      <span className="dot" />
                      {STATO_INFO[a.stato as StatoAssenza]?.etichetta ?? a.stato}
                    </span>
                    {a.decisaIl && (
                      <div className="nota-riga">
                        {a.decisaDaNome || "amministratore"}
                        {a.notaDecisione && ` — ${a.notaDecisione}`}
                      </div>
                    )}
                  </td>
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
                          {c.protocollo && <em> prot. {c.protocollo}</em>}
                        </a>
                      ))
                    )}
                  </td>
                  <td>
                    <details>
                      <summary className="btn ghost" style={{ listStyle: "none", display: "inline-flex" }}>
                        Allega
                      </summary>
                      <form
                        action={caricaCertificato}
                        encType="multipart/form-data"
                        style={{ marginTop: 10, display: "grid", gap: 8, minWidth: 230 }}
                      >
                        <input type="hidden" name="assenzaId" value={a.id} />
                        <input
                          type="file"
                          name="certificato"
                          accept="application/pdf,image/jpeg,image/png"
                          required
                        />
                        <input name="protocollo" placeholder="Numero di protocollo" />
                        <button type="submit" className="btn">
                          Carica certificato
                        </button>
                      </form>
                      {a.stato === "in-attesa" && (
                        <form action={annullaRichiesta} style={{ marginTop: 8 }}>
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="btn danger"
                            style={{ width: "100%", justifyContent: "center" }}
                          >
                            Annulla richiesta
                          </button>
                        </form>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sessione.ruolo === "admin" && (
        <p className="nota" style={{ marginTop: 24 }}>
          Sei amministratore: le richieste di tutti si approvano in{" "}
          <Link href="/cartellino/gestione" style={{ color: "var(--blue)" }}>
            gestione cartellini
          </Link>
          .
        </p>
      )}
    </main>
  );
}
