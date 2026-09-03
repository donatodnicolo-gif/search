"use client";

import { useState, useTransition } from "react";
import type { BriefCampagnaMeta, EsitoBriefMeta } from "@/lib/azioni-brief";

// Il brief AI del modulo META: si descrive la campagna a parole e l'AI compila
// i campi — obiettivo, budget e livello, strategia, pubblico, copy, CTA.
// Stesse regole dei gemelli Google: RIEMPIE I CAMPI, NON MANDA NIENTE, e
// scrive nei campi non controllati del form per lasciare il modulo un server
// component. Lint, coda e approvazione restano tutti.
export function BriefCampagnaMetaAi({
  brand,
  azione,
}: {
  brand: string;
  azione: (input: { descrizione: string; brand: string }) => Promise<EsitoBriefMeta>;
}) {
  const [descrizione, setDescrizione] = useState("");
  const [esito, setEsito] = useState<EsitoBriefMeta | null>(null);
  const [applicato, setApplicato] = useState(false);
  const [inCorso, avvia] = useTransition();

  const chiedi = () => {
    setApplicato(false);
    avvia(async () => {
      const r = await azione({ descrizione, brand });
      setEsito(r);
      if (r.ok) applica(r.brief);
    });
  };

  const applica = (b: BriefCampagnaMeta) => {
    const form = document.querySelector<HTMLFormElement>("form.modulo-creazione");
    if (!form) return;
    const scrivi = (nome: string, valore: string) => {
      const campo = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${nome}"]`);
      if (campo && valore) campo.value = valore;
    };
    const radio = (nome: string, valore: string) => {
      const r = form.querySelector<HTMLInputElement>(`input[name="${nome}"][value="${valore}"]`);
      if (r) r.checked = true;
    };

    scrivi("nome", b.nome);
    scrivi("budget", b.budget ? String(b.budget) : "");
    radio("obiettivoTipo", b.obiettivoTipo);
    radio("livelloBudget", b.livelloBudget);
    scrivi("strategia", b.strategia);
    scrivi("etaMin", String(b.etaMin));
    scrivi("etaMax", String(b.etaMax));
    scrivi("genere", b.genere);
    scrivi("citta", b.citta.join("\n"));
    scrivi("testi", b.testi.join("\n"));
    scrivi("titolo", b.titolo);
    scrivi("descrizione", b.descrizione);
    scrivi("cta", b.cta);
    scrivi("finalUrl", b.finalUrl);
    scrivi("motivo", b.motivo);

    // I paesi: si spuntano le caselle che esistono, il resto va nel campo libero.
    const caselle = [...form.querySelectorAll<HTMLInputElement>('input[name="paesi"]')];
    const restanti: string[] = [];
    for (const p of b.paesi) {
      const casella = caselle.find((c) => c.value === p);
      if (casella) casella.checked = true;
      else restanti.push(p);
    }
    scrivi("paesiAltri", restanti.join(", "));

    setApplicato(true);
  };

  const errore = esito && !esito.ok ? esito.errore : null;
  const buono = esito?.ok ? esito : null;

  return (
    <section className="scheda scheda-ai">
      <div className="scheda-titolo">
        <span className="titolo-icona">✧</span>
        Fatti scrivere il brief dall&apos;AI
      </div>
      <p className="cella-sub" style={{ marginBottom: 12, whiteSpace: "normal" }}>
        Descrivi la campagna Meta a parole: l&apos;AI compila i campi qui sotto. Poi <b>rileggi e
        correggi</b> — i pubblici si spuntano a mano, e quello che finisce in coda è ciò che
        resta scritto nel modulo.
      </p>

      <div className="campo-modulo largo">
        <label>Che campagna ti serve</label>
        <textarea
          rows={3}
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="es. Prospecting in Italia per le torte di compleanno, 20 € al giorno, pubblico donne 25-54, manda alla collezione compleanni."
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
                <b>Da controllare:</b> {buono.scartati.join(" · ")}.{" "}
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
