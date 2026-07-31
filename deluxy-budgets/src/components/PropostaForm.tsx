"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";
import { CampoEuro } from "@/components/CampoEuro";
// Solo il tipo: `import type` sparisce in compilazione, quindi il client non si
// tira dietro la catena che parla con Finance e Orders.
import type { ConsuntivoAmbiti } from "@/lib/proposta-consuntivo";

type Opzione = { slug: string; nome: string };

export function PropostaForm({
  year,
  maisons,
  linee,
  tipologie = [],
  ambiti = {},
  mesiChiusi = [],
}: {
  year: number;
  maisons: Opzione[];
  linee: Opzione[];
  // Le linee di business (D2C, Eventi, B2B, e quelle aggiunte in /margini).
  // **Su una proposta di maison si propone canale per canale**: un brand deve
  // avere un budget su ognuna, e da tutte insieme nasce quanto può spendere in
  // pubblicità — l'ADV consentito è una percentuale sulle vendite del mese
  // sommate su tutti i canali. Un numero unico avrebbe costretto chi consolida
  // a **scegliere lui** su quale voce metterlo, cioè a indovinare.
  tipologie?: Opzione[];
  // Consuntivo dei mesi chiusi **per ambito**: azienda, ogni maison, ogni
  // linea. Il calcolo è sul server; qui si legge la casella dell'ambito scelto.
  ambiti?: ConsuntivoAmbiti;
  // I mesi già passati. Bloccati sempre — anche dove il consuntivo non esiste:
  // il motivo per cui non si propongono è che sono successi, non che c'è un
  // numero da mostrare al loro posto.
  mesiChiusi?: number[];
}) {
  const router = useRouter();
  const [autore, setAutore] = useState("");
  const [ruolo, setRuolo] = useState("Responsabile");
  const [ambito, setAmbito] = useState("GLOBALE"); // "GLOBALE" | "MAISON:slug" | "LINEA:slug"
  const [valori, setValori] = useState<number[]>(Array(12).fill(0));
  // Su una maison si propone **canale per canale**: una riga di dodici mesi per
  // ogni linea di business. Sta in uno stato separato perché è una forma
  // diversa di proposta, non lo stesso numero scritto meglio.
  const [perCanale, setPerCanale] = useState<Record<string, number[]>>({});
  const [note, setNote] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const perMaison = ambito.startsWith("MAISON:") && tipologie.length > 0;
  const canaleVal = (slug: string) => perCanale[slug] ?? Array(12).fill(0);
  const totaleMeseCanali = (i: number) => tipologie.reduce((s, t) => s + (canaleVal(t.slug)[i] || 0), 0);
  const totale = perMaison
    ? tipologie.reduce((s, t) => s + canaleVal(t.slug).reduce((a, v) => a + (v || 0), 0), 0)
    : valori.reduce((s, v) => s + (v || 0), 0);
  // Il consuntivo dell'ambito scelto. Cambiando la tendina cambia il numero
  // letto e cambia la riga che dice **che cosa** è quel numero: il venduto
  // ecommerce di una maison e i ricavi di tutta l'azienda si somigliano solo
  // finché nessuno dichiara quale dei due si sta guardando.
  const info = ambiti[ambito];
  const consuntivoMese = info?.mesi ?? [];
  const chiuso = (i: number) => mesiChiusi.includes(i + 1);

  async function invia() {
    if (!autore.trim()) {
      setErrore("Indicare il nome dell'autore.");
      return;
    }
    setInvio(true);
    setErrore(null);
    const [ambitoTipo, ambitoSlug] = ambito === "GLOBALE" ? ["GLOBALE", null] : ambito.split(":");
    const res = await fetch("/api/proposte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        autore: autore.trim(),
        ruolo,
        ambitoTipo,
        ambitoSlug,
        note: note.trim() || null,
        // **Si mandano solo i mesi che si sono davvero proposti.** Mandare uno
        // zero per i mesi già chiusi sembrava innocuo — la casella è bloccata,
        // il totale non li conta — ma il consolidamento scrive nel budget
        // *quello che la proposta contiene*: quegli zeri hanno cancellato il
        // budget pubblicato dei mesi passati (Deluxy.it, 31/07/2026: 692.728 €
        // di gennaio-giugno finiti a zero). Un mese che non si propone non deve
        // esistere nella proposta.
        //
        // Su una maison ogni riga porta anche il **canale**: così chi consolida
        // non deve più scegliere su quale voce di budget applicarla — lo dice
        // la proposta. Prima glielo si chiedeva, ed era un modo educato di
        // fargli indovinare.
        valori: (perMaison
          ? tipologie.flatMap((t) =>
              canaleVal(t.slug).map((valore, i) => ({ month: i + 1, canale: t.slug, valore: valore || 0 }))
            )
          : valori.map((valore, i) => ({ month: i + 1, valore: valore || 0 }))
        ).filter((v) => !mesiChiusi.includes(v.month)),
      }),
    });
    setInvio(false);
    if (!res.ok) {
      setErrore("Invio non riuscito, riprovare.");
      return;
    }
    router.push("/proposte");
    router.refresh();
  }

  return (
    <div className="card">
      <div className="form-grid">
        <div>
          <label className="field-label">Autore</label>
          <input type="text" value={autore} onChange={(e) => setAutore(e.target.value)} placeholder="Nome e cognome" />
        </div>
        <div>
          <label className="field-label">Ruolo</label>
          <select value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
            <option>Responsabile</option>
            <option>Commerciale</option>
            <option>Amministrazione</option>
          </select>
        </div>
        <div>
          <label className="field-label">Ambito della proposta</label>
          <select value={ambito} onChange={(e) => setAmbito(e.target.value)}>
            <option value="GLOBALE">Tutta l&apos;azienda</option>
            <optgroup label="Maison">
              {maisons.map((m) => (
                <option key={m.slug} value={`MAISON:${m.slug}`}>{m.nome}</option>
              ))}
            </optgroup>
            <optgroup label="Linee commerciali">
              {linee.map((l) => (
                <option key={l.slug} value={`LINEA:${l.slug}`}>{l.nome}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <h2 className="section-title">
        {perMaison ? "Vendite proposte per linea di business e per mese (€)" : "Vendite proposte per mese (€)"}
      </h2>
      {perMaison && (
        <p className="page-caption" style={{ marginTop: 0 }}>
          Su una maison si propone <strong>linea per linea</strong>, non con un numero solo. Due motivi, e valgono
          entrambi: un brand deve avere un budget su <strong>ognuna</strong> delle sue linee, e{" "}
          <strong>da tutte insieme nasce quanto può spendere in pubblicità</strong> — l&apos;ADV consentito è una
          percentuale sulle vendite del mese sommate su tutti i canali, quindi una linea lasciata a zero non è
          «una linea a zero»: è una linea che non porta con sé i soldi per farla. E chi consolida non deve più
          scegliere su quale voce applicarla: lo dice la proposta.
        </p>
      )}
      {/* Che cosa mostrano i mesi chiusi, per questo ambito — o perché non
          mostrano niente. Sta sopra la griglia perché è la cosa da leggere
          prima dei numeri, non dopo. */}
      {info?.nota && (
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", maxWidth: 760, lineHeight: 1.5 }}>
          {info.nota}
        </p>
      )}
      {perMaison ? (
        <div className="card tight" style={{ marginBottom: 4 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Linea di business</th>
                  {MESI.map((m) => (<th className="num" key={m} style={{ minWidth: 96 }}>{m}</th>))}
                  <th className="num">Anno</th>
                </tr>
              </thead>
              <tbody>
                {tipologie.map((t) => (
                  <tr key={t.slug}>
                    <td style={{ fontWeight: 500 }}>{t.nome}</td>
                    {MESI.map((_, i) => (
                      <td className="num" key={i}>
                        {/* Sui mesi chiusi il consuntivo per maison esiste solo
                            per l'ecommerce: si mostra sulla riga D2C e sulle
                            altre resta un trattino, invece di ripetere lo stesso
                            numero su tre righe come se fossero tre misure. */}
                        {chiuso(i) ? (
                          t.slug === "D2C" && typeof consuntivoMese[i] === "number" ? (
                            <span
                              style={{ fontWeight: 600 }}
                              title="Mese già chiuso: questo è il venduto reale, non una proposta"
                            >
                              {eur(consuntivoMese[i] ?? 0)}
                            </span>
                          ) : (
                            <span className="muted" title="Mese già chiuso: non si propone">—</span>
                          )
                        ) : (
                          <CampoEuro
                            valore={canaleVal(t.slug)[i]}
                            onChange={(v) =>
                              setPerCanale((p) => ({
                                ...p,
                                [t.slug]: canaleVal(t.slug).map((x, j) => (j === i ? v : x)),
                              }))
                            }
                            style={{ width: 92, padding: "4px 6px", textAlign: "right", fontSize: 12.5 }}
                          />
                        )}
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>
                      {eur(canaleVal(t.slug).reduce((s, v) => s + (v || 0), 0))}
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>Totale del mese</td>
                  {MESI.map((_, i) => (
                    <td className="num" key={i}>
                      {chiuso(i) ? <span className="muted">—</span> : eur(totaleMeseCanali(i))}
                    </td>
                  ))}
                  <td className="num">{eur(totale)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="mesi-grid">
        {MESI.map((m, i) => (
          <div className="mese-cell" key={m} style={chiuso(i) ? { opacity: 0.75 } : undefined}>
            <div className="k">
              {m} {year}
              {chiuso(i) && info?.etichetta && (
                <span className="muted" style={{ fontSize: 10.5, marginLeft: 4 }}>{info.etichetta}</span>
              )}
            </div>
            {/* Un mese già passato non si propone: si legge. La casella resta
                visibile — toglierla farebbe perdere il confronto con i mesi che
                restano — ma mostra il dato vero e non si può scrivere. Dove il
                dato per quell'ambito non esiste resta un trattino: vuoto, non
                zero, e la riga sopra dice perché. */}
            {chiuso(i) ? (
              <div
                style={{ padding: "9px 0", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                title={
                  typeof consuntivoMese[i] === "number"
                    ? "Mese già chiuso: questo è il dato reale, non una proposta"
                    : "Mese già chiuso: non si propone, e per questo ambito non c'è un consuntivo da leggere"
                }
              >
                {typeof consuntivoMese[i] === "number" ? eur(consuntivoMese[i] ?? 0) : <span className="muted">—</span>}
              </div>
            ) : (
              // I punti delle migliaia e il simbolo € compaiono mentre si
              // digita: un campo che mostra `55000` accanto a una riga che
              // mostra `50.576 €` obbliga a contare gli zeri a occhio, ed è
              // così che si scrive un numero dieci volte più grande senza
              // accorgersene.
              <CampoEuro
                valore={valori[i]}
                onChange={(v) => setValori((p) => p.map((x, j) => (j === i ? v : x)))}
              />
            )}
          </div>
        ))}
      </div>
      )}

      <div style={{ marginTop: 20 }}>
        <label className="field-label">Note (facoltative)</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ipotesi, condizioni, richieste di risorse…" />
      </div>

      <div className="form-footer">
        {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
        <span className="muted" style={{ fontSize: 13.5 }}>
          Totale proposto
          {mesiChiusi.length > 0 && mesiChiusi.length < 12 && ` (${MESI[mesiChiusi.length]}–${MESI[11]})`}:{" "}
          <strong style={{ color: "var(--text)" }}>{eur(totale)}</strong>
        </span>
        <button className="btn primary" onClick={invia} disabled={invio}>
          {invio ? "Invio…" : "Invia proposta"}
        </button>
      </div>
    </div>
  );
}
