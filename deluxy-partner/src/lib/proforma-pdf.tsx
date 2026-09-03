// IL PDF DELLA PRO-FORMA / DEL PREVENTIVO (02/09/2026).
//
// Generato sul server con @react-pdf/renderer: un PDF vero, scaricabile e
// allegabile all'email, identico su ogni macchina — la «stampa del browser»
// dipende dal browser di chi stampa e non si può allegare. Legge lo stesso
// `DocumentoProForma` dell'anteprima HTML (proforma-documento.ts): i numeri e
// i testi non possono divergere; solo il vestito è scritto due volte (CSS di
// stampa e stili qui), e segue le stesse regole (documento A4, margini 18 mm,
// gerarchia tipografica, oro solo come accento).
//
// ⚠️ Font: i tre incorporati (Helvetica, Times, Courier) — niente download di
// font a runtime su Vercel, niente file binari nel repo. Helvetica È la
// famiglia «di sistema» dello stile Apple del design system.
// ⚠️ Logo: react-pdf legge PNG/JPEG (data URL o https). Un logo SVG non lo sa
// disegnare: in quel caso si usa il wordmark tipografico, come quando manca.
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { DocumentoProForma } from "./proforma-documento";
import { euro, dataIt, pctIt } from "./format";

const INK = "#1d1d1f";
const SECONDARY = "#6e6e73";
const TERTIARY = "#8e8e93";
const HAIRLINE = "#e2e2e6";
const GOLD = "#b8963e";
const FILL = "#f5f5f7";

const s = StyleSheet.create({
  page: {
    paddingTop: 51, // 18 mm
    paddingBottom: 62, // 22 mm: spazio per il piede fisso
    paddingHorizontal: 51,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: INK,
    // ⚠️ niente lineHeight sulla pagina: con un lineHeight ereditato, il Text
    // con `render` (numero di pagina) non viene disegnato (provato: è l'unica
    // proprietà che lo spegne). Le interlinee stanno sui singoli stili.
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { height: 40, width: 150, objectFit: "contain", objectPosition: "left", marginBottom: 6 },
  wordmark: { fontFamily: "Times-Bold", fontSize: 22, lineHeight: 1.1, letterSpacing: 2.2, marginBottom: 10, color: INK },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  mittente: { fontSize: 8, color: SECONDARY, lineHeight: 1.4 },
  titolo: { alignItems: "flex-end" },
  tipo: { fontSize: 7.5, letterSpacing: 1.6, color: GOLD, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  numero: { fontSize: 22, lineHeight: 1.2, fontFamily: "Helvetica-Bold", letterSpacing: -0.4, marginTop: 3 },
  data: { fontSize: 8.5, color: SECONDARY, marginTop: 4 },
  regolaOro: { height: 1, backgroundColor: GOLD, marginTop: 16, marginBottom: 22, opacity: 0.9 },
  blocchi: { flexDirection: "row", justifyContent: "space-between", gap: 28 },
  etichetta: { fontSize: 7, letterSpacing: 1.1, color: TERTIARY, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 4 },
  destNome: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  destRiga: { fontSize: 8.5, color: SECONDARY, lineHeight: 1.4 },
  meta: { minWidth: 170 },
  metaRiga: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: HAIRLINE },
  metaK: { fontSize: 8, color: SECONDARY },
  metaV: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  oggetto: { marginTop: 18, fontSize: 9.5 },
  tabella: { marginTop: 20 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 5 },
  thText: { fontSize: 7, letterSpacing: 0.9, color: SECONDARY, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 6.5, borderBottomWidth: 0.5, borderBottomColor: HAIRLINE, alignItems: "flex-start" },
  cDesc: { flex: 1, paddingRight: 8 },
  cQta: { width: 44, textAlign: "right" },
  cPrezzo: { width: 76, textAlign: "right" },
  cIva: { width: 44, textAlign: "right" },
  cImp: { width: 82, textAlign: "right" },
  num: { fontFamily: "Helvetica" },
  bottom: { flexDirection: "row", justifyContent: "space-between", gap: 30, marginTop: 18, alignItems: "flex-start" },
  note: { flex: 1, fontSize: 8.5, color: SECONDARY, lineHeight: 1.45 },
  totali: { width: 210 },
  totRiga: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, fontSize: 9, color: SECONDARY },
  totFinale: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, paddingTop: 7, borderTopWidth: 1, borderTopColor: INK, fontSize: 12.5, fontFamily: "Helvetica-Bold", color: INK },
  pagamento: { marginTop: 22, padding: 12, backgroundColor: FILL, borderRadius: 6 },
  pagRiga: { flexDirection: "row", gap: 10, marginBottom: 2 },
  pagK: { width: 78, fontSize: 8, color: SECONDARY },
  pagV: { fontSize: 9 },
  iban: { fontFamily: "Courier-Bold", fontSize: 9.5, letterSpacing: 0.6 },
  disclaimer: { marginTop: 16, fontSize: 7.5, color: TERTIARY, lineHeight: 1.5 },
  piede: {
    position: "absolute", left: 51, right: 51, bottom: 26,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    borderTopWidth: 0.5, borderTopColor: HAIRLINE, paddingTop: 7,
  },
  piedeTesto: { fontSize: 7, color: TERTIARY, paddingRight: 140, lineHeight: 1.4 },
  // ⚠️ left E right: un Text con `render` nasce vuoto al primo passaggio, e un
  // assoluto senza larghezza resta a zero — il numero non si vedeva.
  pagina: { position: "absolute", left: 51, right: 51, bottom: 26, fontSize: 7, color: TERTIARY, textAlign: "right" },
});

/** Un logo che react-pdf sa disegnare (PNG/JPEG); SVG → wordmark. */
function logoUsabile(url: string): boolean {
  return /^data:image\/(png|jpeg|jpg);base64,/i.test(url) || /^https:\/\/.+\.(png|jpe?g)(\?.*)?$/i.test(url);
}

export function DocumentoPdf({ d }: { d: DocumentoProForma }) {
  const e = d.emittente;
  const c = d.cliente;
  const righeMittente = [
    e.indirizzo,
    e.piva ? `P. IVA ${e.piva}` : "",
    e.codiceFiscale && e.codiceFiscale !== e.piva ? `C.F. ${e.codiceFiscale}` : "",
    e.rea ? `REA ${e.rea}` : "",
    e.sdi ? `SDI ${e.sdi}` : "",
    e.pec ? `PEC ${e.pec}` : "",
    e.contatti,
  ].filter(Boolean);
  const righePiede = [e.ragioneSociale, e.indirizzo, e.piva ? `P. IVA ${e.piva}` : "", e.contatti].filter(Boolean).join("  ·  ");
  const mostraPagamento = !d.preventivo && (e.modalitaPagamento || e.iban);

  return (
    <Document
      title={`${d.titolo} ${d.rif} — ${c.nome}`}
      author={e.ragioneSociale}
      subject={d.oggetto ?? d.titolo}
      creator="Deluxy FINANCE"
    >
      <Page size="A4" style={s.page}>
        {/* ————— Testa: chi emette · che documento è ————— */}
        <View style={s.top}>
          <View style={{ maxWidth: 300 }}>
            {e.logoDataUrl && logoUsabile(e.logoDataUrl) ? (
              <Image src={e.logoDataUrl} style={s.logo} />
            ) : (
              <Text style={s.wordmark}>{(e.brand || e.ragioneSociale || "DELUXY").toUpperCase()}</Text>
            )}
            <Text style={s.brand}>{e.ragioneSociale}</Text>
            {righeMittente.map((r, i) => (
              <Text key={i} style={s.mittente}>{r}</Text>
            ))}
          </View>
          <View style={s.titolo}>
            <Text style={s.tipo}>{d.titolo}</Text>
            <Text style={s.numero}>{d.rif}</Text>
            <Text style={s.data}>del {dataIt(d.data)}</Text>
          </View>
        </View>
        <View style={s.regolaOro} />

        {/* ————— A chi · i dati del documento ————— */}
        <View style={s.blocchi}>
          <View style={{ flex: 1 }}>
            <Text style={s.etichetta}>Spettabile</Text>
            <Text style={s.destNome}>{c.nome}</Text>
            {c.insegna && <Text style={s.destRiga}>{c.insegna}</Text>}
            {c.indirizzo && <Text style={s.destRiga}>{c.indirizzo}</Text>}
            {c.citta && <Text style={s.destRiga}>{c.citta}</Text>}
            {c.pIva && <Text style={s.destRiga}>P. IVA {c.pIva}</Text>}
            {c.codiceFiscale && <Text style={s.destRiga}>C.F. {c.codiceFiscale}</Text>}
            {c.codiceSdi && <Text style={s.destRiga}>Cod. SDI {c.codiceSdi}</Text>}
            {c.pec && <Text style={s.destRiga}>PEC {c.pec}</Text>}
            {c.email && <Text style={s.destRiga}>{c.email}</Text>}
          </View>
          <View style={s.meta}>
            <View style={s.metaRiga}><Text style={s.metaK}>Documento</Text><Text style={s.metaV}>{d.rif}</Text></View>
            <View style={s.metaRiga}><Text style={s.metaK}>Data</Text><Text style={s.metaV}>{dataIt(d.data)}</Text></View>
            {d.scadenza && (
              <View style={s.metaRiga}><Text style={s.metaK}>Termine di pagamento</Text><Text style={s.metaV}>{dataIt(d.scadenza)}</Text></View>
            )}
            {d.preventivo && d.validoFino && (
              <View style={s.metaRiga}><Text style={s.metaK}>Offerta valida fino al</Text><Text style={s.metaV}>{dataIt(d.validoFino)}</Text></View>
            )}
            <View style={s.metaRiga}><Text style={s.metaK}>Totale</Text><Text style={s.metaV}>{euro(d.totali.totale)}</Text></View>
          </View>
        </View>

        {d.oggetto && (
          <View style={s.oggetto}>
            <Text style={s.etichetta}>Oggetto</Text>
            <Text>{d.oggetto}</Text>
          </View>
        )}

        {/* ————— Righe ————— */}
        <View style={s.tabella}>
          <View style={s.th} fixed>
            <Text style={[s.cDesc, s.thText]}>Descrizione</Text>
            <Text style={[s.cQta, s.thText]}>Q.tà</Text>
            <Text style={[s.cPrezzo, s.thText]}>Prezzo unit.</Text>
            <Text style={[s.cIva, s.thText]}>IVA</Text>
            <Text style={[s.cImp, s.thText]}>Importo</Text>
          </View>
          {d.righe.map((r) => (
            <View key={r.id} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>{r.descrizione}</Text>
              <Text style={s.cQta}>{r.quantita.toLocaleString("it-IT")}</Text>
              <Text style={s.cPrezzo}>{euro(r.prezzoUnitario)}</Text>
              <Text style={s.cIva}>{pctIt(r.aliquotaIva)}</Text>
              <Text style={[s.cImp, { fontFamily: "Helvetica-Bold" }]}>{euro(r.importo)}</Text>
            </View>
          ))}
        </View>

        {/* ————— Note · totali ————— */}
        <View style={s.bottom} wrap={false}>
          <View style={s.note}>
            {d.note ? <Text>{d.note}</Text> : null}
          </View>
          <View style={s.totali}>
            {d.totali.perAliquota.map((a) => (
              <View key={`i${a.aliquota}`} style={s.totRiga}>
                <Text>Imponibile {pctIt(a.aliquota)}</Text>
                <Text>{euro(a.imponibile)}</Text>
              </View>
            ))}
            {d.totali.perAliquota.map((a) => (
              <View key={`v${a.aliquota}`} style={s.totRiga}>
                <Text>IVA {pctIt(a.aliquota)}</Text>
                <Text>{euro(a.iva)}</Text>
              </View>
            ))}
            <View style={s.totFinale}>
              <Text>Totale documento</Text>
              <Text>{euro(d.totali.totale)}</Text>
            </View>
          </View>
        </View>

        {/* ————— Come si paga ————— */}
        {mostraPagamento ? (
          <View style={s.pagamento} wrap={false}>
            <Text style={[s.etichetta, { marginBottom: 6 }]}>Pagamento</Text>
            {e.modalitaPagamento ? (
              <View style={s.pagRiga}><Text style={s.pagK}>Modalità</Text><Text style={s.pagV}>{e.modalitaPagamento}</Text></View>
            ) : null}
            {e.iban ? (
              <View style={s.pagRiga}><Text style={s.pagK}>IBAN</Text><Text style={s.iban}>{e.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim()}</Text></View>
            ) : null}
            {e.intestatarioConto ? (
              <View style={s.pagRiga}><Text style={s.pagK}>Intestato a</Text><Text style={s.pagV}>{e.intestatarioConto}</Text></View>
            ) : null}
            {e.banca || e.bic ? (
              <View style={s.pagRiga}><Text style={s.pagK}>Banca</Text><Text style={s.pagV}>{[e.banca, e.bic ? `BIC ${e.bic}` : ""].filter(Boolean).join(" · ")}</Text></View>
            ) : null}
            {d.scadenza ? (
              <View style={s.pagRiga}><Text style={s.pagK}>Entro il</Text><Text style={s.pagV}>{dataIt(d.scadenza)}</Text></View>
            ) : null}
          </View>
        ) : null}

        <Text style={s.disclaimer}>{e.disclaimer}</Text>

        {/* ————— Piede fisso su ogni pagina ————— */}
        <View style={s.piede} fixed>
          <Text style={s.piedeTesto}>{righePiede}</Text>
        </View>
        {/* Il numero di pagina: figlio diretto della pagina, come da manuale di
            react-pdf — dentro un View a righe il `render` non riceveva le pagine. */}
        <Text style={s.pagina} fixed render={({ pageNumber, totalPages }) => `${d.rif}  ·  pagina ${pageNumber} di ${totalPages}`} />
      </Page>
    </Document>
  );
}

/** Il PDF come Buffer, pronto per la risposta HTTP o l'allegato email. */
export async function pdfProForma(d: DocumentoProForma): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<DocumentoPdf d={d} />));
}
