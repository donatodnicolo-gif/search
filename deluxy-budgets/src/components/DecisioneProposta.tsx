"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

export function DecisioneProposta({
  id,
  stato,
  ambitoTipo,
  consolidataSu,
  tipologie,
  valori = [],
  budgetAttuale = {},
}: {
  id: string;
  stato: string;
  ambitoTipo: string;
  consolidataSu: string | null;
  // Le voci di budget su cui si può far atterrare una proposta di maison.
  tipologie: { slug: string; nome: string }[];
  // I mesi che la proposta contiene davvero: sono esattamente quelli che il
  // consolidamento scriverà.
  valori?: { month: number; canale?: string; valore: number }[];
  // Quanto c'è a budget oggi, per voce e per mese. Serve a **far vedere cosa si
  // sta per sovrascrivere prima di premere**: il 31/07/2026 un consolidamento
  // ha azzerato 692.728 € di budget pubblicato di Deluxy.it perché la proposta
  // portava con sé degli zeri sui mesi già chiusi, e nessuna schermata lo
  // diceva. La causa è stata tolta (una proposta non contiene più i mesi che
  // non propone), ma la difesa vera è vedere il prima e il dopo.
  budgetAttuale?: Record<string, number[]>;
}) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [canale, setCanale] = useState(tipologie[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  async function decidi(nuovo: string) {
    setBusy(true);
    setErrore(null);
    setFatto(null);
    const res = await fetch("/api/proposte/decisione", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stato: nuovo, notaAdmin: nota }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Non riuscito.");
      return;
    }
    router.refresh();
  }

  // **La proposta dice già su quale linea va, quando è stata scritta così.**
  // Dal 31/07/2026 una proposta di maison si compila linea per linea: la
  // tendina della voce serve solo alle proposte vecchie, che portavano un
  // numero solo per mese e obbligavano chi consolidava a sceglierla lui.
  const conCanale = valori.some((v) => v.canale);
  const nomeCanale = (slug: string) => tipologie.find((t) => t.slug === slug)?.nome ?? slug;

  // Le righe che il consolidamento scriverà davvero, con il prima e il dopo.
  const righe = valori
    .slice()
    .sort((a, b) => (a.canale ?? "").localeCompare(b.canale ?? "") || a.month - b.month)
    .map((v) => {
      const suQuale = v.canale ?? canale;
      return { ...v, suQuale, prima: (budgetAttuale[suQuale] ?? [])[v.month - 1] ?? 0 };
    });
  const perde = righe.filter((r) => r.prima > 0 && r.valore < r.prima);
  const persi = perde.reduce((s, r) => s + (r.prima - r.valore), 0);

  // **Quante caselle, dette come sono fatte.** Diceva «18 mesi» perché contava
  // le righe: su una proposta per linea sono 6 mesi × 3 linee, e un anno di 18
  // mesi non esiste. Un'etichetta che conta una cosa e ne nomina un'altra fa
  // dubitare del numero anche quando il numero è giusto.
  const mesiTocchi = new Set(righe.map((r) => r.month)).size;
  const linee = new Set(righe.map((r) => r.suQuale)).size;
  const quante = conCanale
    ? `${mesiTocchi} mes${mesiTocchi === 1 ? "e" : "i"} × ${linee} line${linee === 1 ? "a" : "e"}`
    : `${mesiTocchi} mes${mesiTocchi === 1 ? "e" : "i"}`;

  async function consolida() {
    const avviso = perde.length
      ? `\n\nATTENZIONE: ${perde.length} caselle scendono, per ${Math.round(persi).toLocaleString("it-IT")} € di budget in meno.`
      : "";
    if (!confirm(`Scrivere ${quante} (${righe.length} caselle) nel budget ufficiale? Sovrascrive quello che c'è adesso.${avviso}`)) return;
    setBusy(true);
    setErrore(null);
    setFatto(null);
    const res = await fetch("/api/proposte/decisione", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, canale }),
    });
    setBusy(false);
    const b = await res.json().catch(() => null);
    if (!res.ok) {
      setErrore(b?.error ?? "Consolidamento non riuscito.");
      return;
    }
    setFatto(`Budget aggiornato su ${b.dove}.`);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Risposta dell&apos;admin</h3>
      <p className="page-caption" style={{ marginTop: 0 }}>
        <strong>Approvare</strong> vuol dire «ho letto, va bene». <strong>Consolidare</strong> è un secondo gesto e
        riscrive davvero i numeri del budget pubblicato: sono separati perché una proposta si può approvare e
        applicare in parte, più tardi, o mai.
      </p>

      {errore && <div className="avviso-errore" style={{ marginBottom: 10 }}>{errore}</div>}
      {fatto && <div className="card" style={{ borderColor: "var(--green)", marginBottom: 10 }}>{fatto}</div>}

      <label style={{ display: "grid", gap: 4, fontSize: 12.5, marginBottom: 10 }}>
        Nota per chi l&apos;ha scritta (obbligatoria se respingi)
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="es. rivedi il secondo semestre, i mesi di punta sono sottostimati"
          style={{ width: "100%", padding: "7px 9px" }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" disabled={busy || stato === "APPROVATA"} onClick={() => decidi("APPROVATA")}>
          Approva
        </button>
        <button
          className="btn secondary"
          style={{ color: "var(--red)" }}
          disabled={busy || stato === "RESPINTA"}
          onClick={() => decidi("RESPINTA")}
        >
          Respingi
        </button>
        {stato !== "INVIATA" && (
          <button className="btn secondary" disabled={busy} onClick={() => decidi("INVIATA")}>
            Rimetti in attesa
          </button>
        )}
      </div>

      {stato === "APPROVATA" && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline, rgba(0,0,0,.08))" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            {ambitoTipo === "MAISON" && !conCanale && (
              <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
                Voce di budget su cui applicarla
                <select value={canale} onChange={(e) => setCanale(e.target.value)}>
                  {tipologie.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.nome}</option>
                  ))}
                </select>
              </label>
            )}
            {ambitoTipo === "MAISON" && conCanale && (
              <span className="badge green" style={{ alignSelf: "center" }}>
                <span className="dot" />
                la proposta dice già su quali linee va
              </span>
            )}
            <button className="btn" disabled={busy} onClick={consolida}>
              {busy ? "Scrivo…" : `Consolida ${quante} nel budget`}
            </button>
          </div>

          {/* Cosa cambia, prima di premere. Una proposta scrive **solo i mesi
              che contiene**: gli altri restano come sono, e si vede. */}
          {righe.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    {conCanale && <th>Linea</th>}
                    <th>Mese</th>
                    <th className="num">A budget oggi</th>
                    <th className="num">Dalla proposta</th>
                    <th className="num">Differenza</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => {
                    const d = r.valore - r.prima;
                    return (
                      <tr key={`${r.suQuale}-${r.month}`}>
                        {conCanale && (
                          <td className="muted" style={{ fontSize: 12.5 }}>{nomeCanale(r.suQuale)}</td>
                        )}
                        <td style={{ fontWeight: 500 }}>{MESI[r.month - 1]}</td>
                        <td className="num muted">{eur(r.prima)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{eur(r.valore)}</td>
                        <td className={`num ${d === 0 ? "muted" : d > 0 ? "pos" : "neg"}`}>
                          {d === 0 ? "—" : `${d > 0 ? "+" : ""}${eur(d)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {perde.length > 0 && (
            <div className="card" style={{ borderColor: "var(--red)", marginTop: 10 }}>
              <strong>{perde.length} caselle scendono</strong>, per{" "}
              <strong>{eur(persi)}</strong> di budget in meno. Se non è quello che
              vuoi, la proposta va corretta prima — non dopo: consolidare <strong>sovrascrive</strong>,
              non somma, e il valore di prima non si recupera da qui.
            </div>
          )}
          {consolidataSu && (
            <p className="page-caption" style={{ marginTop: 8, marginBottom: 0 }}>
              Già consolidata su <strong>{consolidataSu}</strong>: rifarlo sovrascrive di nuovo.
            </p>
          )}
          {ambitoTipo === "MAISON" && (
            <p className="page-caption" style={{ marginTop: 8, marginBottom: 0 }}>
              Una proposta per maison non dice se è D2C, Eventi o B2B: la voce la sceglie chi approva, perché è
              un&apos;informazione che nella proposta non c&apos;è e indovinarla scriverebbe numeri nel posto sbagliato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
