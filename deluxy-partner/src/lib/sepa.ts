import { CHIAVI, leggiImpostazioni } from "./impostazioni";

// Generazione di file SEPA Credit Transfer (pain.001.001.03) da caricare
// nell'home banking / Qonto, dove il pagamento viene AUTORIZZATO manualmente.
// L'app non esegue mai bonifici: prepara solo la distinta.

export type BonificoSepa = {
  beneficiario: string;
  iban: string;
  importo: number;
  causale?: string | null;
  bic?: string | null;
};

export type Ordinante = { nome: string; iban: string; bic?: string | null };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// charset SEPA limitato + max 70 caratteri
export function soloAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 \-./]/g, " ")
    .trim()
    .slice(0, 70);
}

export async function ordinanteSepa(): Promise<Ordinante | null> {
  const imp = await leggiImpostazioni();
  const nome = imp[CHIAVI.ordinanteNome];
  const iban = imp[CHIAVI.ordinanteIban];
  if (!nome || !iban) return null;
  return { nome, iban, bic: imp[CHIAVI.ordinanteBic] || null };
}

// Costruisce l'XML pain.001 per una lista di bonifici da un dato ordinante.
export function generaSepaXml(
  bonifici: BonificoSepa[],
  ordinante: Ordinante,
  opts?: { prefissoId?: string; dataEsecuzione?: string; ora?: Date }
): string {
  const now = opts?.ora ?? new Date();
  const prefisso = opts?.prefissoId ?? "DELUXY-PAGAMENTO";
  const msgId = `${prefisso}-${now.getTime()}`;
  const dataEsecuzione = opts?.dataEsecuzione ?? now.toISOString().slice(0, 10);
  const totale = bonifici.reduce((a, x) => a + x.importo, 0).toFixed(2);

  const txs = bonifici
    .map(
      (x, i) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(msgId)}-${i + 1}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${x.importo.toFixed(2)}</InstdAmt></Amt>${
        x.bic ? `\n        <CdtrAgt><FinInstnId><BIC>${esc(x.bic.replace(/\s/g, ""))}</BIC></FinInstnId></CdtrAgt>` : ""
      }
        <Cdtr><Nm>${esc(soloAscii(x.beneficiario))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(x.iban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(soloAscii(x.causale ?? `Pagamento ${x.beneficiario}`))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${now.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${bonifici.length}</NbOfTxs>
      <CtrlSum>${totale}</CtrlSum>
      <InitgPty><Nm>${esc(soloAscii(ordinante.nome))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-P1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${bonifici.length}</NbOfTxs>
      <CtrlSum>${totale}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${dataEsecuzione}</ReqdExctnDt>
      <Dbtr><Nm>${esc(soloAscii(ordinante.nome))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(ordinante.iban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${ordinante.bic ? `<FinInstnId><BIC>${esc(ordinante.bic)}</BIC></FinInstnId>` : "<FinInstnId/>"}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
