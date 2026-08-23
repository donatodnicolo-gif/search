import React from "react";
import { salvaVenditeAttese } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { COLORE_BRAND, ETICHETTA_BRAND, formattaEuro, MESI_IT } from "@/lib/dominio";

// Quanto ci si aspetta da ogni canale, brand per brand.
//
// Il Monitoraggio arriva fino al brand ("Gifts venderà 65.000 € a luglio"), ma
// quando il mese va male la domanda è un'altra: quale canale ha mancato? Senza
// un'attesa per canale non si può rispondere — si può solo dire che il totale
// è basso, che non aiuta a decidere dove intervenire.
//
// È una DECISIONE, non un dato: si scrive a mano e nessun import la tocca.

const CANALI = [
  { chiave: "google_ads", nome: "Google Ads", pagato: true },
  { chiave: "meta_ads", nome: "Meta", pagato: true },
  { chiave: "tiktok", nome: "TikTok", pagato: true },
  { chiave: "organico", nome: "Ricerca organica", pagato: false },
  { chiave: "diretto", nome: "Diretto", pagato: false },
  { chiave: "email", nome: "Email", pagato: false },
  { chiave: "altro", nome: "Altro", pagato: false },
];

// Come si chiama quel canale fra le provenienze degli ordini di Shopify.
const ORIGINE_CANALE: Record<string, string[]> = {
  google_ads: ["google-ads", "shopping"],
  meta_ads: ["meta-ads"],
  tiktok: ["tiktok"],
  organico: ["ricerca"],
  diretto: ["diretto"],
  email: ["email"],
};

const BRANDS = ["gifts", "flowers", "cake"];

export async function VenditeAttese({
  anno,
  mese,
  salvato,
}: {
  anno: number;
  mese: number;
  salvato?: boolean;
}) {
  const inizio = new Date(anno, mese - 1, 1);
  const fine = new Date(anno, mese, 1);

  const [attese, piano, venduto] = await Promise.all([
    prisma.venditaAttesa.findMany({ where: { anno, mese } }),
    prisma.venditaMensile.findMany({ where: { anno, mese } }),
    // Il venduto vero per brand e provenienza: serve a mettere l'attesa
    // accanto al fatto, invece di lasciarla un numero senza risposta.
    prisma.ordine.groupBy({
      by: ["brand", "origine"],
      where: { data: { gte: inizio, lt: fine }, stato: { notIn: ["annullato", "rimborsato"] } },
      _sum: { totale: true },
    }),
  ]);

  const attesaDi = (brand: string, canale: string) =>
    attese.find((a) => a.brand === brand && a.canale === canale);

  const vendutoDi = (brand: string, canale: string) => {
    const origini = ORIGINE_CANALE[canale];
    if (!origini) return null;
    const righe = venduto.filter((v) => v.brand === brand && v.origine && origini.includes(v.origine));
    if (righe.length === 0) return 0;
    return righe.reduce((s, v) => s + (v._sum.totale ?? 0), 0);
  };

  const totaleAtteso = (brand: string) =>
    CANALI.reduce((s, c) => s + (attesaDi(brand, c.chiave)?.vendite ?? 0), 0);

  const pianoDi = (brand: string) => piano.find((p) => p.sito === brand)?.vendite ?? null;

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Vendite attese per canale — {MESI_IT[mese - 1]} {anno}
      </div>

      {salvato && (
        <div className="conferma">
          <span className="segno">✓</span> Attese salvate.
        </div>
      )}

      <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
        Il piano del Monitoraggio arriva fino al brand. Qui si dice <b>quanto ci si aspetta da
        ciascun canale</b>: serve a sapere, quando il mese va male, quale canale ha mancato e non
        solo che il totale è basso. Accanto a ogni casella c&apos;è il <b>venduto vero</b> del mese,
        preso dalla provenienza che Shopify attribuisce agli ordini.
      </p>

      <form action={salvaVenditeAttese}>
        <input type="hidden" name="anno" value={anno} />
        <input type="hidden" name="mese" value={mese} />

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Canale</th>
                {BRANDS.map((b) => (
                  <th key={b} colSpan={2} style={{ textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="sb-dot" style={{ background: COLORE_BRAND[b] }} />
                      {ETICHETTA_BRAND[b]}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                <th />
                {BRANDS.map((b) => (
                  <React.Fragment key={b}>
                    <th className="num" title="Vendite attese da questo canale nel mese">atteso €</th>
                    <th className="num" title="Venduto davvero, dagli ordini con questa provenienza">venduto</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {CANALI.map((c) => (
                <tr key={c.chiave}>
                  <td>
                    <div className="cella-nome">{c.nome}</div>
                    <div className="cella-sub">{c.pagato ? "a pagamento" : "non pagato"}</div>
                  </td>
                  {BRANDS.map((b) => {
                    const a = attesaDi(b, c.chiave);
                    const reale = vendutoDi(b, c.chiave);
                    const quota = a?.vendite && a.vendite > 0 && reale != null ? reale / a.vendite : null;
                    return (
                      <React.Fragment key={b}>
                        <td className="num">
                          <input
                            name={`attesa:${b}:${c.chiave}`}
                            type="number"
                            step="100"
                            min="0"
                            defaultValue={a?.vendite ?? ""}
                            placeholder="—"
                            style={{ width: 96, textAlign: "right", font: "inherit", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--hairline-strong)" }}
                          />
                        </td>
                        <td className="num cella-muta">
                          {reale != null ? formattaEuro(reale) : "—"}
                          {quota != null && (
                            <div
                              className="cella-sub"
                              style={{ color: quota >= 1 ? "var(--green)" : quota >= 0.7 ? "var(--gold-strong)" : "var(--red)" }}
                            >
                              {Math.round(quota * 100)}% dell&apos;atteso
                            </div>
                          )}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              <tr style={{ fontWeight: 600, background: "rgba(0,0,0,.02)" }}>
                <td>
                  <div className="cella-nome">Somma delle attese</div>
                  <div className="cella-sub">contro il piano del brand</div>
                </td>
                {BRANDS.map((b) => {
                  const somma = totaleAtteso(b);
                  const p = pianoDi(b);
                  const scarto = p && p > 0 ? somma / p : null;
                  return (
                    <React.Fragment key={b}>
                      <td className="num">{somma > 0 ? formattaEuro(somma) : "—"}</td>
                      <td className="num cella-muta">
                        {p != null ? formattaEuro(p) : "—"}
                        {/* ⚠️ Nessuna attesa scritta NON è «attese a zero».
                            Il confronto col piano dava «-100% sul piano» in
                            rosso su ogni brand — un numero da disastro che
                            diceva soltanto che le caselle erano vuote, e che
                            faceva sembrare rotta la pagina. */}
                        {somma <= 0 ? (
                          <div className="cella-sub">attese non compilate</div>
                        ) : (
                          scarto != null && (
                            <div
                              className="cella-sub"
                              style={{ color: Math.abs(scarto - 1) <= 0.02 ? "var(--green)" : "var(--orange)" }}
                            >
                              {scarto > 1 ? "+" : ""}
                              {Math.round((scarto - 1) * 100)}% sul piano
                            </div>
                          )
                        )}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="azioni-modulo" style={{ marginTop: 14 }}>
          <button className="btn" type="submit">Salva le attese</button>
        </div>
      </form>

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        Una casella svuotata <b>cancella</b> l&apos;attesa invece di salvare zero: «zero vendite
        attese» è una previsione, «non lo so» è un&apos;altra cosa. La riga in fondo somma le attese e
        le confronta col piano del brand: se la somma è più bassa del piano, qualche canale non è
        stato assegnato a nessuno.
        <br />
        Il venduto per canale usa la provenienza che Shopify attribuisce al <b>primo contatto</b>:
        gli ordini senza provenienza nota non finiscono in nessuna riga, quindi la somma delle
        colonne «venduto» può essere più bassa del venduto totale del brand.
      </p>
    </section>
  );
}
