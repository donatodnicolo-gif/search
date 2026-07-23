"use client";

import { useEffect, useRef, useState } from "react";
import {
  contactName,
  getToken,
  salvaSeAssente,
  type RigaContatto,
} from "./google-rubrica";

type Esito = { fase: "attesa" | "lavoro" | "presente" | "aggiunto" | "errore"; testo: string };

// Compare nella scheda partner quando un'azienda è appena diventata cliente
// (?rubrica=1): salva in automatico tutti i referenti nella rubrica Google
// dell'operatore. Il popup di consenso Google può richiedere un click
// (i browser bloccano i popup non richiesti): in quel caso resta il bottone.
export function SalvaRubricaAuto({ contatti }: { contatti: RigaContatto[] }) {
  const [esiti, setEsiti] = useState<Record<string, Esito>>({});
  const [stato, setStato] = useState<"in_corso" | "fatto" | "consenso">("in_corso");
  // Perché il tentativo silenzioso è fallito: senza questo il pannello dice
  // solo "serve il consenso" e non si capisce se è Google a rifiutare
  // (consenso scaduto: l'app OAuth in modalità test lo revoca ogni 7 giorni),
  // il popup bloccato o l'operatore non loggato su Google in questo browser.
  const [motivo, setMotivo] = useState<string | null>(null);
  const partito = useRef(false);

  // `automatico`: primo tentativo senza popup (riesce se il consenso Google
  // è già stato dato in passato). Col bottone invece il popup è permesso,
  // perché nasce da un click dell'operatore.
  async function salvaTutti(automatico = false) {
    setStato("in_corso");
    let token: string;
    try {
      token = await getToken(automatico);
    } catch (e) {
      // niente consenso silenzioso: lo si chiede col bottone (gesto utente)
      setMotivo(e instanceof Error ? e.message : String(e));
      setStato("consenso");
      return;
    }
    for (const c of contatti) {
      setEsiti((s) => ({ ...s, [c.id]: { fase: "lavoro", testo: "Salvo…" } }));
      try {
        const esito = await salvaSeAssente(token, c);
        setEsiti((s) => ({ ...s, [c.id]: esito }));
      } catch (e) {
        setEsiti((s) => ({
          ...s,
          [c.id]: { fase: "errore", testo: e instanceof Error ? e.message : "Errore" },
        }));
      }
    }
    setStato("fatto");
  }

  useEffect(() => {
    if (partito.current) return;
    partito.current = true;
    void salvaTutti(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (contatti.length === 0) return null;

  return (
    <section className="scheda" style={{ borderLeft: "3px solid var(--green)" }}>
      <h2 className="scheda-titolo">
        Nuovo cliente → rubrica Google{" "}
        <span className="scheda-sub">
          {stato === "in_corso"
            ? "salvo i referenti in rubrica…"
            : stato === "consenso"
              ? "serve il consenso Google"
              : "fatto"}
        </span>
      </h2>
      {stato === "consenso" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p className="testo-guida" style={{ margin: 0 }}>
            Autorizza Google una volta per salvare {contatti.length} referent
            {contatti.length === 1 ? "e" : "i"} in rubrica. Dalla prossima azienda che diventa
            cliente il salvataggio parte da solo.
            {motivo && (
              <>
                {" "}
                <span className="cella-fonte" title={motivo}>
                  (Google: {motivo})
                </span>
              </>
            )}
          </p>
          <button type="button" className="btn small" onClick={() => void salvaTutti()}>
            Autorizza e salva in rubrica
          </button>
        </div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          {contatti.map((c) => {
            const e = esiti[c.id];
            return (
              <li key={c.id} style={{ fontSize: 13.5 }}>
                <span className="cella-nome">{contactName(c)}</span>{" "}
                {e ? (
                  <span
                    className={
                      e.fase === "aggiunto"
                        ? "match-esito ok"
                        : e.fase === "presente"
                          ? "match-esito warn"
                          : "cella-fonte"
                    }
                    title={e.testo}
                  >
                    {e.testo}
                  </span>
                ) : (
                  <span className="cella-fonte">in coda…</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
