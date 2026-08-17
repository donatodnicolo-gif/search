"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { COLORE_PRIORITA, ETICHETTA_PRIORITA, PRIORITA, PRIORITA_DEFAULT, type Priorita } from "@/lib/priorita";
import { creaTaskAction } from "@/lib/task-actions";

// «Nuova attività»: il bottone nella testa della pagina apre una card con il
// form (titolo, descrizione, per chi, priorità, scadenza, link). Il salvataggio
// passa dalla server action `creaTaskAction`, che applica le regole di
// visibilità (un non-admin assegna solo a sé o alla squadra).

export type PersonaUI = { email: string; nome: string | null };

const ALTRA = "__altra__";

export function NuovaTask({
  persone,
  me,
  admin,
  children,
}: {
  persone: PersonaUI[];
  me: string | null; // email di chi è dentro (null in sviluppo senza sessione)
  admin: boolean;
  children?: ReactNode; // titolo/caption della pagina: stanno sulla stessa riga del bottone
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [inCorso, start] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [fatta, setFatta] = useState<string | null>(null);

  const perDefault = me && persone.some((p) => p.email === me) ? me : (persone[0]?.email ?? (admin ? ALTRA : ""));
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [per, setPer] = useState(perDefault);
  const [altraEmail, setAltraEmail] = useState("");
  const [priorita, setPriorita] = useState<Priorita>(PRIORITA_DEFAULT);
  const [scadenza, setScadenza] = useState("");
  const [link, setLink] = useState("");

  // Il messaggio «creata» sparisce da solo.
  useEffect(() => {
    if (!fatta) return;
    const t = setTimeout(() => setFatta(null), 4000);
    return () => clearTimeout(t);
  }, [fatta]);

  function azzera() {
    setTitolo("");
    setDescrizione("");
    setPer(perDefault);
    setAltraEmail("");
    setPriorita(PRIORITA_DEFAULT);
    setScadenza("");
    setLink("");
    setErrore(null);
  }

  function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const utenteEmail = per === ALTRA ? altraEmail : per;
    start(async () => {
      const esito = await creaTaskAction({ titolo, descrizione, utenteEmail, priorita, scadenza, link });
      if (!esito.ok) {
        setErrore(esito.messaggio);
        return;
      }
      const nome = persone.find((p) => p.email === utenteEmail)?.nome ?? utenteEmail;
      azzera();
      setAperto(false);
      setFatta(`Attività creata per ${nome}.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="pagina-testa">
        <div style={{ minWidth: 0 }}>{children}</div>
        <div className="pagina-azioni">
          {fatta && !aperto && <span className="nota-ok">{fatta}</span>}
          {!aperto && (
            <button type="button" className="btn" onClick={() => setAperto(true)}>
              <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>＋</span> Nuova attività
            </button>
          )}
        </div>
      </div>

      {aperto && (
        <form className="card nuova" onSubmit={invia}>
          <div className="nuova-titolo">Nuova attività</div>

          <div className="campo-blocco">
            <label className="etichetta" htmlFor="nt-titolo">
              Titolo <span className="obbl">*</span>
            </label>
            <input
              id="nt-titolo"
              className="campo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Cosa c'è da fare"
              maxLength={200}
              autoFocus
              required
            />
          </div>

          <div className="campo-blocco">
            <label className="etichetta" htmlFor="nt-desc">
              Descrizione
            </label>
            <textarea
              id="nt-desc"
              className="campo"
              rows={2}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Dettagli utili a chi la farà (facoltativo)"
            />
          </div>

          <div className="nuova-griglia">
            <div className="campo-blocco">
              <label className="etichetta" htmlFor="nt-per">
                Per chi <span className="obbl">*</span>
              </label>
              <select id="nt-per" className="campo" value={per} onChange={(e) => setPer(e.target.value)}>
                {persone.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.nome ? `${p.nome} — ${p.email}` : p.email}
                    {me && p.email === me ? " (io)" : ""}
                  </option>
                ))}
                {admin && <option value={ALTRA}>Altra email…</option>}
              </select>
              {per === ALTRA && (
                <input
                  className="campo"
                  type="email"
                  value={altraEmail}
                  onChange={(e) => setAltraEmail(e.target.value)}
                  placeholder="nome@deluxy.it"
                  style={{ marginTop: 6 }}
                  required
                />
              )}
            </div>

            <div className="campo-blocco">
              <span className="etichetta">Priorità</span>
              <div className="nuova-priorita">
                {PRIORITA.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip${priorita === p ? " attivo" : ""}`}
                    onClick={() => setPriorita(p)}
                  >
                    <span className="dot" style={{ background: priorita === p ? "#fff" : COLORE_PRIORITA[p] }} />
                    {ETICHETTA_PRIORITA[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="nt-scad">
                Scadenza
              </label>
              <input
                id="nt-scad"
                className="campo"
                type="date"
                value={scadenza}
                onChange={(e) => setScadenza(e.target.value)}
              />
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="nt-link">
                Link
              </label>
              <input
                id="nt-link"
                className="campo"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://… (facoltativo)"
              />
            </div>
          </div>

          <div className="nuova-piede">
            <span className="nuova-errore">{errore ?? ""}</span>
            <button
              type="button"
              className="btn ghost"
              disabled={inCorso}
              onClick={() => {
                azzera();
                setAperto(false);
              }}
            >
              Annulla
            </button>
            <button type="submit" className="btn" disabled={inCorso || !titolo.trim()}>
              {inCorso ? "Salvo…" : "Crea attività"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
