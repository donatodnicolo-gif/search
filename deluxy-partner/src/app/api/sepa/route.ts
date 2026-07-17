import { NextRequest, NextResponse } from "next/server";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { nomeMese } from "@/lib/calc";
import { CHIAVI, leggiImpostazioni } from "@/lib/impostazioni";

// Export dei bonifici da fare ai partner per un mese:
//  - formato=csv  → distinta in CSV (controllo/contabilità)
//  - default      → SEPA Credit Transfer pain.001.001.03, da caricare
//                   nell'home banking dove viene autorizzato manualmente.
// L'app NON esegue pagamenti: genera solo la distinta.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function soloAscii(s: string): string {
  // charset SEPA limitato
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 \-./]/g, " ").trim().slice(0, 70);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const anno = parseInt(sp.get("anno") ?? "") || ANNO_CORRENTE;
  const mese = parseInt(sp.get("mese") ?? "") || new Date().getMonth() + 1;
  const formato = sp.get("formato") ?? "xml";

  const tutti = await riepilogoTutti(anno);
  const pendenti = tutti
    .map((t) => {
      const m = t.mesi.find((x) => x.mese === mese)!;
      return { partner: t.partner, daBonificare: m.riepilogo.daBonificare };
    })
    .filter((x) => x.daBonificare >= 0.01) // Deluxy deve al partner
    .map((x) => ({ partner: x.partner, importo: +x.daBonificare.toFixed(2) }));

  const causale = (nome: string) =>
    soloAscii(`Saldo vendite ${nomeMese(mese)} ${anno} - ${nome}`);

  if (formato === "csv") {
    const righe = [
      "Partner;IBAN;Importo;Divisa;Causale;Note",
      ...pendenti.map((x) =>
        [
          x.partner.nome.replace(/;/g, ","),
          x.partner.iban ?? "MANCANTE",
          x.importo.toFixed(2).replace(".", ","),
          "EUR",
          causale(x.partner.nome),
          x.partner.iban ? "" : "Inserire IBAN nella scheda partner",
        ].join(";")
      ),
    ];
    return new NextResponse("﻿" + righe.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bonifici-partner-${anno}-${String(mese).padStart(2, "0")}.csv"`,
      },
    });
  }

  // SEPA pain.001 — solo partner con IBAN
  const imp = await leggiImpostazioni();
  const ordinanteNome = imp[CHIAVI.ordinanteNome];
  const ordinanteIban = imp[CHIAVI.ordinanteIban];
  const ordinanteBic = imp[CHIAVI.ordinanteBic];
  if (!ordinanteNome || !ordinanteIban) {
    return new NextResponse(
      "Per generare il file SEPA servono intestazione e IBAN del conto Deluxy: impostali in Impostazioni (menu Configurazione).",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  const conIban = pendenti.filter((x) => x.partner.iban);
  const now = new Date();
  const msgId = `DELUXY-PARTNER-${anno}${String(mese).padStart(2, "0")}-${now.getTime()}`;
  const totale = conIban.reduce((a, x) => a + x.importo, 0).toFixed(2);
  const dataEsecuzione = now.toISOString().slice(0, 10);

  const txs = conIban
    .map(
      (x, i) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(msgId)}-${i + 1}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${x.importo.toFixed(2)}</InstdAmt></Amt>
        <Cdtr><Nm>${esc(soloAscii(x.partner.nome))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(x.partner.iban!.replace(/\s/g, ""))}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(causale(x.partner.nome))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${now.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${conIban.length}</NbOfTxs>
      <CtrlSum>${totale}</CtrlSum>
      <InitgPty><Nm>DELUXY</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-P1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${conIban.length}</NbOfTxs>
      <CtrlSum>${totale}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${dataEsecuzione}</ReqdExctnDt>
      <Dbtr><Nm>${esc(soloAscii(ordinanteNome))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(ordinanteIban.replace(/\s/g, ""))}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${ordinanteBic ? `<FinInstnId><BIC>${esc(ordinanteBic)}</BIC></FinInstnId>` : "<FinInstnId/>"}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="sepa-bonifici-partner-${anno}-${String(mese).padStart(2, "0")}.xml"`,
    },
  });
}
