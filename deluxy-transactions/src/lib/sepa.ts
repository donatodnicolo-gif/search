import { importoSepa } from "./denaro";
import { normalizzaIban } from "./iban";

// Distinta SEPA Credit Transfer, formato pain.001.001.03 (quello che le banche
// italiane accettano ancora universalmente per l'upload manuale).
//
// ⚠️ Confine dell'app, per scelta: qui si PRODUCE il file, non si invia. Non
// esistono credenziali bancarie in questa applicazione e nessun endpoint parla
// con una banca. Il file lo carica una persona nel portale della banca, dove
// c'è il suo secondo fattore. Se un domani servisse l'invio automatico, è un
// progetto a sé con requisiti (EBICS/CBI, certificati) che non si improvvisano.

export type RigaDistinta = {
  riferimento: string;
  beneficiario: string;
  iban: string;
  bic: string | null;
  importoCent: number;
  causale: string;
};

export type Ordinante = { nome: string; iban: string; bic: string };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** I caratteri ammessi da SEPA sono pochi: il resto va tradotto o tolto. */
export function ripulisci(testo: string, max: number): string {
  const mappa: Record<string, string> = { à: "a", è: "e", é: "e", ì: "i", ò: "o", ù: "u", "€": "EUR" };
  return testo
    .split("")
    .map((c) => mappa[c.toLowerCase()] ?? c)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function generaXml(
  righe: RigaDistinta[],
  ordinante: Ordinante,
  opzioni: { riferimentoLotto: string; dataEsecuzione: Date },
): string {
  const creato = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const totale = righe.reduce((s, r) => s + r.importoCent, 0);
  const dataEs = opzioni.dataEsecuzione.toISOString().slice(0, 10);
  const idMessaggio = ripulisci(opzioni.riferimentoLotto, 35);

  const operazioni = righe
    .map((r) => {
      const bic = r.bic ? `\n            <FinInstnId><BIC>${esc(r.bic)}</BIC></FinInstnId>` : "";
      return `        <CdtTrfTxInf>
          <PmtId><EndToEndId>${esc(ripulisci(r.riferimento, 35))}</EndToEndId></PmtId>
          <Amt><InstdAmt Ccy="EUR">${importoSepa(r.importoCent)}</InstdAmt></Amt>
          <CdtrAgt>${bic || "\n            <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>"}
          </CdtrAgt>
          <Cdtr><Nm>${esc(ripulisci(r.beneficiario, 70))}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${esc(normalizzaIban(r.iban))}</IBAN></Id></CdtrAcct>
          <RmtInf><Ustrd>${esc(ripulisci(r.causale, 140))}</Ustrd></RmtInf>
        </CdtTrfTxInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(idMessaggio)}</MsgId>
      <CreDtTm>${creato}</CreDtTm>
      <NbOfTxs>${righe.length}</NbOfTxs>
      <CtrlSum>${importoSepa(totale)}</CtrlSum>
      <InitgPty><Nm>${esc(ripulisci(ordinante.nome, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(idMessaggio)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${righe.length}</NbOfTxs>
      <CtrlSum>${importoSepa(totale)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${dataEs}</ReqdExctnDt>
      <Dbtr><Nm>${esc(ripulisci(ordinante.nome, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(normalizzaIban(ordinante.iban))}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId>${
        ordinante.bic ? `<BIC>${esc(ordinante.bic)}</BIC>` : "<Othr><Id>NOTPROVIDED</Id></Othr>"
      }</FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${operazioni}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

/** Controlli prima di generare: meglio un errore qui che un file respinto. */
export function verificaOrdinante(o: Ordinante): string | null {
  if (!o.nome.trim()) return "Manca il nome dell'ordinante (Impostazioni).";
  if (!o.iban.trim()) return "Manca l'IBAN aziendale ordinante (Impostazioni).";
  return null;
}
