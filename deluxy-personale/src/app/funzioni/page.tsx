import { prisma } from "@/lib/db";
import { FREQUENZE_ATTIVITA } from "@/lib/organico";
import {
  aggiornaFunzione,
  assegnaMansione,
  creaAttivita,
  creaFunzione,
  creaMansione,
  eliminaAttivita,
  eliminaFunzione,
  eliminaMansione,
  rimuoviAssegnazione,
  spostaInFunzione,
} from "@/lib/azioni";
import { FormConferma } from "@/components/FormConferma";

// Il disegno dell'organizzazione: funzioni (reparti) → mansioni → attività.
// Le attività qui sono il MANSIONARIO (cosa comporta la mansione), non i task
// operativi: quelli vivono in Deluxy Tasks.

export const dynamic = "force-dynamic";

export default async function PaginaFunzioni({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const [funzioni, persone] = await Promise.all([
    prisma.funzione.findMany({
      where: { attiva: true },
      include: {
        responsabile: true,
        persone: { where: { stato: "attivo" } },
        mansioni: {
          where: { attiva: true },
          include: { attivita: { orderBy: { ordine: "asc" } }, assegnazioni: { include: { persona: true } } },
          orderBy: { nome: "asc" },
        },
      },
      orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    }),
    prisma.persona.findMany({
      where: { stato: "attivo" },
      include: { funzione: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Funzioni e mansioni</h1>
          <p className="page-sub">
            Il disegno dell&apos;organizzazione: ogni funzione ha le sue mansioni, ogni mansione le
            attività che comporta. Le persone si assegnano da qui o dalle loro schede.
          </p>
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}

      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Nuova funzione</h2>
            <p className="card-sub">Es. Commerciale, Operations, Customer Service, Amministrazione…</p>
          </div>
        </div>
        <form action={creaFunzione} className="form-inline">
          <div className="campo">
            <label>Nome *</label>
            <input type="text" name="nome" required placeholder="Es. Operations" />
          </div>
          <div className="campo" style={{ flex: 2 }}>
            <label>Descrizione</label>
            <input type="text" name="descrizione" placeholder="Di cosa risponde questa funzione" />
          </div>
          <button className="btn" type="submit">
            Crea
          </button>
        </form>
      </div>

      {funzioni.length === 0 && (
        <div className="card vuoto">
          <div className="vuoto-icona">🗂️</div>
          <div className="vuoto-titolo">Nessuna funzione ancora</div>
          <div className="vuoto-testo">
            Parti dalle funzioni: sono i reparti dell&apos;azienda. Poi dentro ognuna metti le mansioni.
          </div>
        </div>
      )}

      {funzioni.map((f) => (
        <div key={f.id} className="card">
          <div className="card-testa">
            <div>
              <h2 className="card-titolo">{f.nome}</h2>
              <p className="card-sub">
                {f.descrizione || "Senza descrizione"} ·{" "}
                {f.persone.length === 0
                  ? "nessuna persona"
                  : `${f.persone.length} person${f.persone.length === 1 ? "a" : "e"}`}
              </p>
            </div>
            {f.responsabile ? (
              <a className="badge oro" href={`/persone/${f.responsabile.id}`}>
                <span className="dot" />
                responsabile: {f.responsabile.nome}
              </a>
            ) : (
              <span className="badge">
                <span className="dot" />
                senza responsabile
              </span>
            )}
          </div>

          {/* Modifica funzione */}
          <details style={{ marginBottom: 14 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
              Modifica la funzione
            </summary>
            <form action={aggiornaFunzione} className="form-inline" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={f.id} />
              <div className="campo">
                <label>Nome *</label>
                <input type="text" name="nome" required defaultValue={f.nome} />
              </div>
              <div className="campo" style={{ flex: 2 }}>
                <label>Descrizione</label>
                <input type="text" name="descrizione" defaultValue={f.descrizione} />
              </div>
              <div className="campo">
                <label>Responsabile</label>
                <select name="responsabileId" defaultValue={f.responsabileId ?? ""}>
                  <option value="">— nessuno —</option>
                  {persone.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn ghost" type="submit">
                Salva
              </button>
              <FormConferma
                azione={eliminaFunzione}
                conferma={`Eliminare la funzione «${f.nome}»? Si può solo se è vuota.`}
                campi={{ id: f.id }}
                etichetta="Elimina"
                classe="btn pericolo"
              />
            </form>
          </details>

          {/* Persone della funzione: si assegnano (e si tolgono) da qui */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {f.persone.map((p) => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <a className="badge" href={`/persone/${p.id}`}>
                  <span className="dot" />
                  {p.nome}
                </a>
                <FormConferma
                  azione={spostaInFunzione}
                  conferma={`Togliere ${p.nome} dalla funzione «${f.nome}»? (Resta in organico, senza funzione.)`}
                  campi={{ personaId: p.id, funzioneId: "", torna: "/funzioni" }}
                  etichetta="×"
                  classe="btn ghost mini"
                />
              </span>
            ))}
            {(() => {
              const candidate = persone.filter((p) => p.funzioneId !== f.id);
              if (candidate.length === 0) return null;
              return (
                <form action={spostaInFunzione} className="form-inline" style={{ gap: 6 }}>
                  <input type="hidden" name="funzioneId" value={f.id} />
                  <input type="hidden" name="torna" value="/funzioni" />
                  <select name="personaId" required defaultValue="" style={{ width: "auto", fontSize: 13 }}>
                    <option value="" disabled>
                      Aggiungi una persona…
                    </option>
                    {candidate.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.funzione ? ` (da ${p.funzione.nome})` : ""}
                      </option>
                    ))}
                  </select>
                  <button className="btn ghost mini" type="submit">
                    Aggiungi
                  </button>
                </form>
              );
            })()}
          </div>

          {/* Mansioni della funzione */}
          {f.mansioni.map((m) => (
            <div key={m.id} className="mansione-blocco">
              <div className="mansione-testa">
                <div>
                  <span className="mansione-nome">{m.nome}</span>
                  {m.descrizione && (
                    <span style={{ fontSize: 13, color: "var(--text-secondary)", marginLeft: 8 }}>
                      {m.descrizione}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {m.assegnazioni.length > 0 ? (
                    m.assegnazioni.map((a) => (
                      <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        <a className="badge" href={`/persone/${a.persona.id}`}>
                          <span className="dot" />
                          {a.persona.nome}
                        </a>
                        <FormConferma
                          azione={rimuoviAssegnazione}
                          conferma={`Togliere la mansione «${m.nome}» a ${a.persona.nome}?`}
                          campi={{ id: a.id, personaId: a.persona.id, torna: "/funzioni" }}
                          etichetta="×"
                          classe="btn ghost mini"
                        />
                      </span>
                    ))
                  ) : (
                    <span className="badge arancio">
                      <span className="dot" />
                      scoperta
                    </span>
                  )}
                  {(() => {
                    const assegnati = new Set(m.assegnazioni.map((a) => a.personaId));
                    const candidate = persone.filter((p) => !assegnati.has(p.id));
                    if (candidate.length === 0) return null;
                    return (
                      <form action={assegnaMansione} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="hidden" name="mansioneId" value={m.id} />
                        <input type="hidden" name="torna" value="/funzioni" />
                        <select name="personaId" required defaultValue="" style={{ width: "auto", fontSize: 12.5, padding: "4px 10px", borderRadius: "var(--radius-pill)" }}>
                          <option value="" disabled>
                            Assegna a…
                          </option>
                          {candidate.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                        <button className="btn ghost mini" type="submit">
                          Assegna
                        </button>
                      </form>
                    );
                  })()}
                  <FormConferma
                    azione={eliminaMansione}
                    conferma={`Eliminare la mansione «${m.nome}» e le sue attività?`}
                    campi={{ id: m.id }}
                    etichetta="Elimina"
                    classe="btn pericolo mini"
                  />
                </div>
              </div>

              {m.attivita.length > 0 && (
                <div className="attivita-lista">
                  {m.attivita.map((a) => (
                    <div key={a.id} className="attivita-riga">
                      <span className="attivita-punto">•</span>
                      <span>{a.nome}</span>
                      {a.dettaglio && <span style={{ color: "var(--text-secondary)" }}>— {a.dettaglio}</span>}
                      {a.frequenza && <span className="attivita-freq">({a.frequenza})</span>}
                      <FormConferma
                        azione={eliminaAttivita}
                        conferma={`Eliminare l'attività «${a.nome}»?`}
                        campi={{ id: a.id }}
                        etichetta="×"
                        classe="btn ghost mini"
                      />
                    </div>
                  ))}
                </div>
              )}

              <form action={creaAttivita} className="form-inline" style={{ marginTop: 10 }}>
                <input type="hidden" name="mansioneId" value={m.id} />
                <div className="campo">
                  <label>Nuova attività</label>
                  <input type="text" name="nome" required placeholder="Es. preparare le distinte di consegna" />
                </div>
                <div className="campo" style={{ maxWidth: 170 }}>
                  <label>Frequenza</label>
                  <select name="frequenza" defaultValue="">
                    <option value="">— non indicata —</option>
                    {FREQUENZE_ATTIVITA.map((fr) => (
                      <option key={fr} value={fr}>
                        {fr}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn ghost mini" style={{ marginBottom: 2 }} type="submit">
                  Aggiungi
                </button>
              </form>
            </div>
          ))}

          <form action={creaMansione} className="form-inline" style={{ marginTop: 14 }}>
            <input type="hidden" name="funzioneId" value={f.id} />
            <div className="campo">
              <label>Nuova mansione in {f.nome}</label>
              <input type="text" name="nome" required placeholder="Es. Coordinatore consegne" />
            </div>
            <div className="campo" style={{ flex: 2 }}>
              <label>Descrizione</label>
              <input type="text" name="descrizione" placeholder="In una frase, di cosa si occupa" />
            </div>
            <button className="btn" type="submit">
              Aggiungi mansione
            </button>
          </form>
        </div>
      ))}
    </>
  );
}
