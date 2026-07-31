"use client";

import { useState } from "react";
import { feeDaTariffe, tariffeApplicabili, type Tariffa } from "@/lib/fee-calc";
import { MESI } from "@/lib/calc";

// Partner, mese, anno e fee stanno insieme in un solo componente perché sono
// legati: la fee da applicare dipende da CHI e da QUANDO. Tenendoli qui lo stato
// lo gestisce React, invece di rincorrere gli eventi del form dal DOM.
//
// Il calcolo usa la stessa funzione del motore (feeDaTariffe), che tiene conto
// delle decorrenze: un partner può aver cambiato fee da un certo mese in poi.
export type FeePartner = { id: string; nome: string; feeBase: number; tariffe: Tariffa[] };

export function FeeVendita({
  partners,
  partnerIniziale,
  meseIniziale,
  annoIniziale,
}: {
  partners: FeePartner[];
  partnerIniziale?: string;
  meseIniziale: number;
  annoIniziale: number;
}) {
  const [partnerId, setPartnerId] = useState(partnerIniziale ?? "");
  const [mese, setMese] = useState(meseIniziale);
  // l'anno resta testo mentre si digita (cancellandolo non deve rimbalzare
  // all'anno corrente a ogni tasto); per il calcolo si usa il numero.
  const [annoTxt, setAnnoTxt] = useState(String(annoIniziale));
  const anno = parseInt(annoTxt) || annoIniziale;

  const p = partners.find((x) => x.id === partnerId);
  const applicabili = p ? tariffeApplicabili(p.tariffe, anno, mese) : [];
  const fee = p ? feeDaTariffe(p.tariffe, anno, mese, p.feeBase) : null;
  const provenienza = applicabili[0]
    ? `decorrenza da ${MESI[applicabili[0].dalMese - 1]} ${applicabili[0].dalAnno}`
    : "fee del profilo partner";

  return (
    <>
      <div>
        <label className="field-label">Partner <span className="req">*</span></label>
        <select name="partnerId" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="" disabled>Seleziona partner…</option>
          {partners.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}{x.feeBase ? ` — fee ${x.feeBase}%` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Incasso lordo € <span className="req">*</span></label>
        <input type="number" name="incassoLordo" required step="0.01" min="0" placeholder="0,00" />
      </div>
      <div>
        <label className="field-label">Mese di competenza <span className="req">*</span></label>
        <select name="mese" required value={mese} onChange={(e) => setMese(parseInt(e.target.value))}>
          {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="field-label">Anno <span className="req">*</span></label>
        <input
          type="number"
          name="anno"
          required
          step="1"
          value={annoTxt}
          onChange={(e) => setAnnoTxt(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Data vendita</label>
        <input type="date" name="data" />
      </div>
      <div>
        <label className="field-label">Fee % (vuota = quella qui sotto)</label>
        <input
          type="number"
          name="feePercent"
          step="0.1"
          min="0"
          max="100"
          placeholder={fee != null ? String(fee) : "dal profilo partner"}
        />
        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          {fee != null ? (
            <>
              Verrà applicata <strong style={{ color: "var(--text)" }}>{String(fee).replace(".", ",")}%</strong> ·{" "}
              {provenienza}
            </>
          ) : (
            "Scegli il partner per vedere la fee applicata."
          )}
        </p>
      </div>
    </>
  );
}
