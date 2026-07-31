"use client";

import { useState } from "react";
import { feeDaTariffe, tariffeApplicabili, type Tariffa } from "@/lib/fee-calc";
import { MESI, IVA_DEFAULT, commissione, dovutoVendita } from "@/lib/calc";
import { euro } from "@/lib/format";
import { SceltaPartner } from "@/components/SceltaPartner";

// Partner, mese, anno, incasso e fee stanno insieme in un solo componente
// perché sono legati: la fee da applicare dipende da CHI e da QUANDO, e i
// numeri che ne escono (commissione, IVA, dovuto al partner) dipendono da
// tutti. Tenendoli qui lo stato lo gestisce React, invece di rincorrere gli
// eventi del form dal DOM.
//
// Il calcolo usa le stesse funzioni del motore (feeDaTariffe per la
// percentuale, commissione/dovutoVendita per gli importi): quello che si legge
// prima di salvare è quello che verrà scritto.
export type FeePartner = { id: string; nome: string; feeBase: number; tariffe: Tariffa[] };

export function FeeVendita({
  partners,
  partnerIniziale,
  incassoIniziale,
  meseIniziale,
  annoIniziale,
}: {
  partners: FeePartner[];
  partnerIniziale?: string;
  incassoIniziale?: string;
  meseIniziale: number;
  annoIniziale: number;
}) {
  const [partnerId, setPartnerId] = useState(partnerIniziale ?? "");
  const [mese, setMese] = useState(meseIniziale);
  // l'anno resta testo mentre si digita (cancellandolo non deve rimbalzare
  // all'anno corrente a ogni tasto); per il calcolo si usa il numero.
  const [annoTxt, setAnnoTxt] = useState(String(annoIniziale));
  const [incassoTxt, setIncassoTxt] = useState(incassoIniziale ?? "");
  const [feeTxt, setFeeTxt] = useState("");
  const anno = parseInt(annoTxt) || annoIniziale;

  const p = partners.find((x) => x.id === partnerId);
  const applicabili = p ? tariffeApplicabili(p.tariffe, anno, mese) : [];
  const feeAuto = p ? feeDaTariffe(p.tariffe, anno, mese, p.feeBase) : null;
  const provenienza = applicabili[0]
    ? `decorrenza da ${MESI[applicabili[0].dalMese - 1]} ${applicabili[0].dalAnno}`
    : "fee del profilo partner";

  // la fee scritta a mano vince su quella dell'anagrafica, come fa la server
  // action al salvataggio
  const feeManuale = feeTxt.trim() === "" ? null : parseFloat(feeTxt.replace(",", "."));
  const feeUsata = feeManuale != null && Number.isFinite(feeManuale) ? feeManuale : feeAuto;

  const incasso = parseFloat(incassoTxt.replace(",", "."));
  const contiPronti = Number.isFinite(incasso) && incasso > 0 && feeUsata != null;
  const v = { incassoLordo: contiPronti ? incasso : 0, feePercent: feeUsata ?? 0 };
  const comm = commissione(v);
  const commIvata = comm * (1 + IVA_DEFAULT / 100);
  const iva = commIvata - comm;
  const alPartner = dovutoVendita(v);

  return (
    <>
      <div>
        <label className="field-label">Partner <span className="req">*</span></label>
        <SceltaPartner partners={partners} valore={partnerId} onScegli={setPartnerId} />
      </div>
      <div>
        <label className="field-label">Incasso lordo € <span className="req">*</span></label>
        <input
          type="number"
          name="incassoLordo"
          required
          step="0.01"
          min="0"
          placeholder="0,00"
          value={incassoTxt}
          onChange={(e) => setIncassoTxt(e.target.value)}
        />
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
        <label className="field-label">Fee % (vuota = quella dell&apos;anagrafica)</label>
        <input
          type="number"
          name="feePercent"
          step="0.1"
          min="0"
          max="100"
          placeholder={feeAuto != null ? String(feeAuto) : "dal profilo partner"}
          value={feeTxt}
          onChange={(e) => setFeeTxt(e.target.value)}
        />
        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          {feeAuto == null ? (
            "Scegli il partner per vedere la fee applicata."
          ) : feeManuale != null && Number.isFinite(feeManuale) ? (
            <>
              Fee scritta a mano: <strong style={{ color: "var(--text)" }}>{feeTxt.replace(".", ",")}%</strong> —
              in anagrafica è {String(feeAuto).replace(".", ",")}%
            </>
          ) : (
            <>
              Verrà applicata <strong style={{ color: "var(--text)" }}>{String(feeAuto).replace(".", ",")}%</strong> ·{" "}
              {provenienza}
            </>
          )}
        </p>
      </div>

      {/* I conti prima di salvare: la commissione è l'incasso di Deluxy, ma al
          partner si trattiene la commissione IVATA — chi compila deve vedere
          tutte e tre le cifre, non solo la percentuale. */}
      <div className="full">
        <div
          className="card tight"
          style={{ background: "var(--bg)", padding: "12px 14px", marginTop: 4 }}
        >
          {!contiPronti ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Scegli il partner e scrivi l&apos;incasso lordo: qui compaiono commissione, IVA e
              quanto resta da girare al partner.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                <Voce
                  etichetta={`Commissione Deluxy (${String(feeUsata).replace(".", ",")}%)`}
                  valore={euro(comm)}
                  nota="imponibile, da fatturare al partner"
                />
                <Voce
                  etichetta={`IVA ${IVA_DEFAULT}%`}
                  valore={euro(iva)}
                  nota="da versare, non è nostro"
                />
                <Voce
                  etichetta="Commissione + IVA"
                  valore={euro(commIvata)}
                  nota="quello che tratteniamo dall'incasso"
                  forte
                />
                <Voce
                  etichetta="Da girare al partner"
                  valore={euro(alPartner)}
                  nota="incasso lordo meno la commissione ivata"
                />
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                Su {euro(incasso)} incassati: {euro(commIvata)} restano a Deluxy (di cui {euro(iva)} di
                IVA) e {euro(alPartner)} vanno al partner.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Voce({
  etichetta,
  valore,
  nota,
  forte,
}: {
  etichetta: string;
  valore: string;
  nota: string;
  forte?: boolean;
}) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em" }}>
        {etichetta}
      </div>
      <div style={{ fontSize: forte ? 21 : 18, fontWeight: 600, marginTop: 2 }}>{valore}</div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{nota}</div>
    </div>
  );
}
