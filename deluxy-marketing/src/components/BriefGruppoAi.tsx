"use client";

import { useState, useTransition } from "react";
import type { BriefGruppo, EsitoBriefGruppo } from "@/lib/azioni-brief";

// Il gemello di BriefCampagnaAi per il GRUPPO nuovo: si descrive a parole
// l'intento del gruppo e l'AI compila il modulo — nome, keyword, titoli,
// descrizioni, URL. Stesse regole di casa: RIEMPIE I CAMPI, NON MANDA NIENTE
// (lint, coda e approvazione restano tutti), e scrive nei campi non
// controllati del form per lasciare la pagina un server component.
export function BriefGruppoAi({
  campagnaId,
  azione,
}: {
  campagnaId: string;
  azione: (input: { descrizione: string; campagnaId: string }) => Promise<EsitoBriefGruppo>;
}) {
  const [descrizione, setDescrizione] = useState("");
  const [esito, setEsito] = useState<EsitoBriefGruppo | null>(null);
  const [applicato, setApplicato] = useState(false);
  const [inCorso, avvia] = useTransition();

  const chiedi = () => {
    setApplicato(false);
    avvia(async () => {
      const r = await azione({ descrizione, campagnaId });
      setEsito(r);
      if (r.ok) applica(r.brief);
    });
  };

  const applica = (b: BriefGruppo) => {
    const form = document.querySelector<HTMLFormElement>("form.modulo-creazione");
    if (!form) return;
    const scrivi = (nome: string, valore: string) => {
      const campo = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${nome}"]`);
      if (campo && valore) campo.value = valore;
    };
    scrivi("gruppo", b.gruppo);
    scrivi("keywords", b.keywords.map((k) => `${k.testo} | ${k.corrispondenza}`).join("\n"));
    scrivi("titoli", b.titoli.join("\n"));
    scrivi("descrizioni", b.descrizioni.join("\n"));
    scrivi("finalUrl", b.finalUrl);
    scrivi("motivo", b.motivo);
    setApplicato(true);
  };

  const errore = esito && !esito.ok ? esito.errore : null;
  const buono = esito?.ok ? esito : null;

  return (
    <section className="scheda scheda-ai">
      <div className="scheda-titolo">
        <span className="titolo-icona">✧</span>
        Fatti scrivere il brief del gruppo dall&apos;AI
      </div>
      <p className="cella-sub" style={{ marginBottom: 12, whiteSpace: "normal" }}>
        Descrivi l&apos;intento del gruppo a parole: l&apos;AI compila i campi qui sotto,
        conoscendo i gruppi che la campagna ha già. Poi <b>rileggi e correggi</b> — quello che
        finisce in coda è ciò che resta scritto nel modulo.
      </p>

      <div className="campo-modulo largo">
        <label>Che gruppo ti serve</label>
        <textarea
          rows={3}
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="es. Chi cerca torte di compleanno per bambini a Milano, manda alla collezione compleanni."
        />
      </div>

      <div className="azioni-modulo" style={{ justifyContent: "flex-start", marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={chiedi}
          disabled={inCorso || descrizione.trim().length < 10}
        >
          {inCorso ? "Ci sto pensando…" : applicato ? "Rifai il brief" : "Compila con l'AI"}
        </button>
        {applicato && (
          <span className="cella-sub" style={{ alignSelf: "center" }}>
            Campi compilati — controllali prima di mettere in coda.
          </span>
        )}
      </div>

      {errore && (
        <div className="avviso-errore" style={{ marginTop: 12, marginBottom: 0 }}>
          {errore}
        </div>
      )}

      {buono && (buono.scartati.length > 0 || buono.note) && (
        <div className="nota-info" style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="nota-icona">◈</span>
          <span>
            {buono.scartati.length > 0 && (
              <>
                <b>Scartato dai limiti:</b> {buono.scartati.join(" · ")}.{" "}
              </>
            )}
            {buono.note}
            <span className="cella-sub" style={{ display: "block", marginTop: 4 }}>
              Proposto da {buono.modello}.
            </span>
          </span>
        </div>
      )}
    </section>
  );
}
