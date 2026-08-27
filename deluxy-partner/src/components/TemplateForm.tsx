"use client";

// Il form di un template di documento, con ANTEPRIMA a fianco.
//
// ⚠️ L'anteprima non è un vezzo: qui si configura come esce un foglio che il
// cliente riceve, e senza vederlo l'unico modo di accorgersi che il logo è
// storto o che manca la P. IVA è emettere un documento vero e guardarlo dopo.
// Quello che si vede qui è la stessa intestazione che finisce sul documento.
import { useState } from "react";
import { BRAND_NOTI, DISCLAIMER_PROFORMA, LOGO_MAX_BYTE } from "@/lib/documento-costanti";

export interface CampiTemplate {
  nome: string;
  brand: string;
  ragioneSociale: string;
  indirizzo: string;
  piva: string;
  codiceFiscale: string;
  rea: string;
  contatti: string;
  logoDataUrl: string;
  iban: string;
  intestatarioConto: string;
  modalitaPagamento: string;
  noteDefault: string;
  disclaimer: string;
  aliquotaIvaDefault: string;
  attivo: boolean;
}

export const CAMPI_VUOTI: CampiTemplate = {
  nome: "",
  brand: "",
  ragioneSociale: "",
  indirizzo: "",
  piva: "",
  codiceFiscale: "",
  rea: "",
  contatti: "",
  logoDataUrl: "",
  iban: "",
  intestatarioConto: "",
  modalitaPagamento: "Bonifico bancario",
  noteDefault: "",
  disclaimer: "",
  aliquotaIvaDefault: "22",
  attivo: true,
};

export function TemplateForm({
  iniziale,
  azione,
  testoBottone,
}: {
  iniziale: CampiTemplate;
  azione: (fd: FormData) => void | Promise<void>;
  testoBottone: string;
}) {
  const [c, setC] = useState<CampiTemplate>(iniziale);
  const [erroreLogo, setErroreLogo] = useState<string | null>(null);
  const set = (k: keyof CampiTemplate, v: string | boolean) => setC((x) => ({ ...x, [k]: v }));

  /**
   * Il logo si sceglie dal disco e diventa un data URI qui nel browser.
   * ⚠️ Non si carica da nessuna parte: il documento si stampa e viaggia via
   * email, e un logo ospitato fuori sparisce dal PDF il giorno che quell'host
   * cambia. Il prezzo è il peso, e infatti c'è un limite.
   */
  function leggiLogo(file: File | null) {
    setErroreLogo(null);
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setErroreLogo("Quel file non è un'immagine.");
      return;
    }
    if (file.size > LOGO_MAX_BYTE) {
      setErroreLogo(
        `Il logo pesa ${(file.size / 1024).toFixed(0)} KB: il massimo è ${LOGO_MAX_BYTE / 1024} KB, altrimenti le email col documento non partono. Rimpiccioliscilo e riprova.`,
      );
      return;
    }
    const fr = new FileReader();
    fr.onload = () => set("logoDataUrl", String(fr.result ?? ""));
    fr.onerror = () => setErroreLogo("Il file non si è potuto leggere.");
    fr.readAsDataURL(file);
  }

  return (
    <div className="tpl-wrap">
      <form action={azione} className="card tpl-form">
        <h2 className="tpl-sez">Come si chiama</h2>
        <div className="fgrid fgrid-2">
          <label>
            Nome del template *
            <input name="nome" value={c.nome} onChange={(e) => set("nome", e.target.value)} placeholder="es. Deluxy Flowers" required />
          </label>
          <label>
            Brand
            <input
              name="brand"
              list="brand-noti"
              value={c.brand}
              onChange={(e) => set("brand", e.target.value)}
              placeholder="es. deluxyflowers.com"
            />
            <datalist id="brand-noti">
              {BRAND_NOTI.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <small className="hint">
              Serve a farlo scegliere da fuori senza conoscerne il codice: Scout chiede «emetti con
              l&apos;intestazione di {BRAND_NOTI[1]}».
            </small>
          </label>
        </div>

        <h2 className="tpl-sez">Chi emette</h2>
        <p className="hint">
          Sono i dati che vanno in testa alla pro-forma: denominazione, indirizzo e partita IVA (o codice
          fiscale) sono quelli che la prassi chiede sempre.
        </p>
        <label>
          Ragione sociale *
          <input
            name="ragioneSociale"
            value={c.ragioneSociale}
            onChange={(e) => set("ragioneSociale", e.target.value)}
            placeholder="es. Deluxy S.r.l."
            required
          />
        </label>
        <label>
          Indirizzo
          <input
            name="indirizzo"
            value={c.indirizzo}
            onChange={(e) => set("indirizzo", e.target.value)}
            placeholder="Via, numero — CAP Città (PR)"
          />
        </label>
        <div className="fgrid fgrid-3">
          <label>
            Partita IVA
            <input name="piva" value={c.piva} onChange={(e) => set("piva", e.target.value)} placeholder="IT01234567890" />
          </label>
          <label>
            Codice fiscale
            <input name="codiceFiscale" value={c.codiceFiscale} onChange={(e) => set("codiceFiscale", e.target.value)} />
          </label>
          <label>
            REA
            <input name="rea" value={c.rea} onChange={(e) => set("rea", e.target.value)} placeholder="MI-1234567" />
          </label>
        </div>
        <label>
          Contatti
          <input
            name="contatti"
            value={c.contatti}
            onChange={(e) => set("contatti", e.target.value)}
            placeholder="+39 02 000000 · amministrazione@deluxy.it · deluxy.it"
          />
        </label>

        <h2 className="tpl-sez">Logo</h2>
        <input type="hidden" name="logoDataUrl" value={c.logoDataUrl} />
        <div className="tpl-logo-riga">
          {c.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logoDataUrl} alt="Logo del template" className="tpl-logo-prova" />
          ) : (
            <div className="tpl-logo-vuoto">nessun logo</div>
          )}
          <div>
            <input type="file" accept="image/*" onChange={(e) => leggiLogo(e.target.files?.[0] ?? null)} />
            {c.logoDataUrl && (
              <button type="button" className="btn secondary small" onClick={() => set("logoDataUrl", "")}>
                Togli il logo
              </button>
            )}
            <small className="hint">
              Resta dentro al documento (non su un server esterno), così non sparisce dal PDF. Massimo{" "}
              {LOGO_MAX_BYTE / 1024} KB.
            </small>
            {erroreLogo && <p className="tpl-errore">{erroreLogo}</p>}
          </div>
        </div>

        <h2 className="tpl-sez">Come si paga</h2>
        <p className="hint">
          Un documento che chiede soldi senza dire dove mandarli fa perdere un giro di mail.
        </p>
        <div className="fgrid fgrid-2">
          <label>
            IBAN
            <input name="iban" value={c.iban} onChange={(e) => set("iban", e.target.value)} placeholder="IT00 X000 0000 0000 0000 0000 000" />
          </label>
          <label>
            Intestato a
            <input
              name="intestatarioConto"
              value={c.intestatarioConto}
              onChange={(e) => set("intestatarioConto", e.target.value)}
              placeholder="se diverso dalla ragione sociale"
            />
          </label>
        </div>
        <label>
          Modalità di pagamento
          <input
            name="modalitaPagamento"
            value={c.modalitaPagamento}
            onChange={(e) => set("modalitaPagamento", e.target.value)}
            placeholder="es. Bonifico bancario a 30 giorni data documento"
          />
        </label>

        <h2 className="tpl-sez">In calce</h2>
        <label>
          Condizioni predefinite
          <textarea
            name="noteDefault"
            rows={3}
            value={c.noteDefault}
            onChange={(e) => set("noteDefault", e.target.value)}
            placeholder="Finiscono nelle note del documento quando nasce da un'automazione e nessuno le scrive a mano."
          />
        </label>
        <label>
          Testo di legge
          <textarea
            name="disclaimer"
            rows={4}
            value={c.disclaimer}
            onChange={(e) => set("disclaimer", e.target.value)}
            placeholder={DISCLAIMER_PROFORMA}
          />
          <small className="hint">
            Lasciandolo vuoto si usa la formula standard (quella scritta qui sopra in grigio). È la frase
            che rende la pro-forma un documento non fiscale: senza, il cliente potrebbe registrarla.
          </small>
        </label>

        <div className="fgrid fgrid-2">
          <label>
            IVA predefinita (%)
            <input
              name="aliquotaIvaDefault"
              inputMode="decimal"
              value={c.aliquotaIvaDefault}
              onChange={(e) => set("aliquotaIvaDefault", e.target.value)}
            />
          </label>
          <label className="tpl-check">
            <input type="checkbox" name="attivo" checked={c.attivo} onChange={(e) => set("attivo", e.target.checked)} />
            <span>Attivo (si può scegliere per i documenti nuovi)</span>
          </label>
        </div>

        <button className="btn primary" type="submit">
          {testoBottone}
        </button>
      </form>

      {/* ————— Anteprima ————— */}
      <div className="card tpl-anteprima">
        <div className="tpl-anteprima-tit">Come esce sul documento</div>
        <div className="docpf" style={{ padding: 18 }}>
          <div className="docpf-top">
            <div>
              {c.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logoDataUrl} alt="" className="docpf-logo" />
              ) : null}
              <div className="docpf-brand">{c.ragioneSociale || "Ragione sociale"}</div>
              {c.indirizzo && <div className="docpf-mittente">{c.indirizzo}</div>}
              {c.piva && <div className="docpf-mittente">P. IVA {c.piva}</div>}
              {c.codiceFiscale && <div className="docpf-mittente">C.F. {c.codiceFiscale}</div>}
              {c.rea && <div className="docpf-mittente">REA {c.rea}</div>}
              {c.contatti && <div className="docpf-mittente">{c.contatti}</div>}
            </div>
            <div className="docpf-titolo">
              <div className="docpf-tipo">Fattura pro-forma</div>
              <div className="docpf-numero">PF 1/{new Date().getFullYear()}</div>
              <div className="docpf-data">del …</div>
            </div>
          </div>
          <div className="docpf-dest">
            <div className="docpf-label">Spettabile</div>
            <div className="docpf-dest-nome">Nome del cliente</div>
          </div>
          <div className="docpf-bottom" style={{ marginTop: 14 }}>
            <div className="docpf-note">
              {(c.modalitaPagamento || c.iban) && (
                <p>
                  <span className="docpf-label">Pagamento</span> {c.modalitaPagamento}
                  {c.iban ? ` — IBAN ${c.iban}` : ""}
                  {c.intestatarioConto ? ` (intestato a ${c.intestatarioConto})` : ""}
                </p>
              )}
              {c.noteDefault && <p style={{ whiteSpace: "pre-wrap" }}>{c.noteDefault}</p>}
              <p className="docpf-disclaimer">{c.disclaimer || DISCLAIMER_PROFORMA}</p>
            </div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Righe, totali e dati del cliente cambiano da documento a documento: qui si vede solo la parte
          che il template decide.
        </p>
      </div>
    </div>
  );
}
