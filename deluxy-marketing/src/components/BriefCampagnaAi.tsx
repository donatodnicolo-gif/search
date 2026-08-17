"use client";

import { useState, useTransition } from "react";
import type { BriefCampagna, EsitoBrief } from "@/lib/azioni-brief";

// «Chiedi un brief all'AI»: si descrive la campagna a parole e l'AI compila il
// modulo sotto — nome, obiettivo, budget, località, URL, keyword, negative,
// titoli, descrizioni.
//
// ⚠️ RIEMPIE I CAMPI, NON MANDA NIENTE. Dopo il riempimento il modulo è
// esattamente come se lo avessi scritto a mano: si rilegge, si corregge, e
// resta tutta la strada di prima — lint del copy, limiti di Google, coda,
// approvazione. L'AI non salta nemmeno un cancello.
//
// ⚠️ PERCHÉ SCRIVE NEI CAMPI E NON TIENE UNO STATO SUO: i campi del modulo
// sono NON CONTROLLATI (hanno defaultValue e placeholder, non value). Scriverci
// dentro con `form.elements` è il modo che NON entra in conflitto con React e
// che lascia il resto della pagina un server component. Trasformare tutto il
// modulo in componente client per tenere uno stato React vorrebbe dire
// riscrivere sette sezioni per un pannello che si usa una volta.
export function BriefCampagnaAi({
  brand,
  azione,
}: {
  brand: string;
  azione: (input: { descrizione: string; brand: string }) => Promise<EsitoBrief>;
}) {
  const [descrizione, setDescrizione] = useState("");
  const [esito, setEsito] = useState<EsitoBrief | null>(null);
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

  const applica = (b: BriefCampagna) => {
    const form = document.querySelector<HTMLFormElement>("form.modulo-creazione");
    if (!form) return;
    const el = <T extends HTMLElement>(nome: string) =>
      form.querySelector<T>(`[name="${nome}"]`);

    const scrivi = (nome: string, valore: string) => {
      const campo = el<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(nome);
      if (campo && valore) campo.value = valore;
    };

    scrivi("nome", b.nome);
    scrivi("budget", b.budget ? String(b.budget) : "");
    scrivi("lingua", b.lingua);
    scrivi("finalUrl", b.finalUrl);
    scrivi("gruppo", b.gruppo);
    scrivi("motivo", b.motivo);
    scrivi("titoli", b.titoli.join("\n"));
    scrivi("descrizioni", b.descrizioni.join("\n"));
    scrivi("negative", b.negative.join("\n"));
    // Le keyword tornano nella forma che il modulo si aspetta: «testo | match».
    scrivi("keywords", b.keywords.map((k) => `${k.testo} | ${k.corrispondenza}`).join("\n"));

    // L'obiettivo è un gruppo di radio: si accende quella giusta.
    const radio = form.querySelector<HTMLInputElement>(
      `input[name="obiettivoTipo"][value="${b.obiettivoTipo}"]`
    );
    if (radio) radio.checked = true;

    // Le località sono caselle più un campo libero. Quelle che hanno una
    // casella si spuntano; le altre finiscono in «altre località», invece di
    // essere buttate perché non erano nell'elenco.
    const caselle = [...form.querySelectorAll<HTMLInputElement>('input[name="localita"]')];
    const restanti: string[] = [];
    const normalizza = (s: string) => s.trim().toLowerCase();
    for (const l of b.localita) {
      const casella = caselle.find((c) => normalizza(c.value) === normalizza(l));
      if (casella) casella.checked = true;
      else restanti.push(l.trim());
    }
    scrivi("localitaAltre", restanti.join(", "));

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
        Descrivi la campagna a parole: l&apos;AI compila i campi qui sotto. Poi <b>rileggi e
        correggi</b> — quello che finisce in coda è ciò che resta scritto nel modulo, non ciò
        che ha detto l&apos;AI.
      </p>

      <div className="campo-modulo largo">
        <label>Che campagna ti serve</label>
        <textarea
          rows={3}
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="es. Consegna fiori a Napoli in giornata, per chi cerca in italiano. Budget intorno ai 20 € al giorno, manda alla collezione Napoli."
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

      {buono && (
        <div style={{ marginTop: 14 }}>
          <div className="nota-info" style={{ marginBottom: 0 }}>
            <span className="nota-icona">✓</span>
            <span>
              <b>
                {buono.brief.keywords.length} keyword · {buono.brief.titoli.length} titoli ·{" "}
                {buono.brief.descrizioni.length} descrizioni
              </b>{" "}
              scritti nel modulo{buono.modello ? ` da ${buono.modello}` : ""}.
              {buono.note && <> {buono.note}</>}
            </span>
          </div>
          {/* ⚠️ Quello che è stato scartato si DICE. Un titolo di 31 caratteri
              tolto in silenzio diventa «me ne ha dati 7 invece di 10» senza
              che si capisca perché, e si dà la colpa al modello. */}
          {buono.scartati.length > 0 && (
            <div className="nota-info" style={{ marginTop: 8, marginBottom: 0, borderColor: "rgba(201,52,0,.35)" }}>
              <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
              <span>
                <b>Scartato perché fuori dai limiti di Google:</b> {buono.scartati.join(" · ")}.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
