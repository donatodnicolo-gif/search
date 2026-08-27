import React from "react";
/**
 * Deluxy Fondo — pezzi di interfaccia condivisi.
 *
 * Sono componenti server: nessuna interattività, nessun JavaScript spedito al browser.
 * Tutti seguono la stessa regola: un valore assente si scrive, non si nasconde.
 */

import { percentuale, verso } from "@/lib/formato";
import type { Punteggio, StatoFonte } from "@/lib/tipi";

export function Metrica({
  nome,
  valore,
  nota,
  colore,
}: {
  nome: string;
  valore: string;
  nota?: string | null;
  colore?: "su" | "giu" | "neutro";
}) {
  return (
    <div className="metrica">
      <div className="metrica-nome">{nome}</div>
      <div className={`metrica-valore ${colore ?? ""}`}>{valore}</div>
      {nota ? <div className="metrica-nota">{nota}</div> : null}
    </div>
  );
}

export function MetricaPercentuale({ nome, valore, nota }: { nome: string; valore: number | null; nota?: string | null }) {
  return <Metrica nome={nome} valore={percentuale(valore)} nota={nota} colore={verso(valore)} />;
}

/**
 * Formula del badge (Libro UX&UI cap.5): pillola + dot `currentColor` + tinta `-soft`
 * di sfondo + testo semantico pieno. Prima lo sfondo era sempre neutro e solo il dot
 * era colorato — «le due metà sbagliate della stessa regola» (28/08/2026).
 * L'oro usa gold-strong come testo: il gold pieno sul -soft non regge il contrasto.
 */
const TINTA_BADGE: Record<string, { sfondo: string; testo: string }> = {
  "var(--green)": { sfondo: "var(--green-soft)", testo: "var(--green)" },
  "var(--red)": { sfondo: "var(--red-soft)", testo: "var(--red)" },
  "var(--orange)": { sfondo: "var(--orange-soft)", testo: "var(--orange)" },
  "var(--blue)": { sfondo: "var(--blue-soft)", testo: "var(--blue)" },
  "var(--purple)": { sfondo: "var(--purple-soft)", testo: "var(--purple)" },
  "var(--gold)": { sfondo: "var(--gold-soft)", testo: "var(--gold-strong)" },
};

export function Badge({ testo, colore, forte }: { testo: string; colore?: string; forte?: boolean }) {
  const tinta = colore ? TINTA_BADGE[colore] : undefined;
  return (
    <span
      className={`badge ${forte ? "forte" : ""}`}
      style={tinta ? { background: tinta.sfondo, color: tinta.testo } : undefined}
    >
      {/* senza tinta (colore fuori mappa, es. text-tertiary) il dot prende il colore richiesto */}
      {colore ? <span className="dot" style={tinta ? undefined : { background: colore }} /> : null}
      {testo}
    </span>
  );
}

/**
 * Stato vuoto canonico (Libro cap.6): card con icona in quadratino gold-soft 44px,
 * titolo e frase che spiega; l'azione (facoltativa) è un collegamento, coerente con
 * un'app senza JavaScript client.
 */
export function Vuoto({
  titolo,
  children,
  azione,
}: {
  titolo: string;
  children?: React.ReactNode;
  azione?: { href: string; testo: string };
}) {
  return (
    <div className="card vuoto">
      <div className="vuoto-icona" aria-hidden>
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </svg>
      </div>
      <div className="vuoto-titolo">{titolo}</div>
      {children ? <p className="vuoto-testo">{children}</p> : null}
      {azione ? (
        <a className="btn ghost" href={azione.href}>
          {azione.testo}
        </a>
      ) : null}
    </div>
  );
}

export function Avviso({
  titolo,
  children,
  grave,
  icona = "!",
}: {
  titolo?: string;
  children: React.ReactNode;
  grave?: boolean;
  icona?: string;
}) {
  return (
    <div className={`avviso ${grave ? "grave" : ""}`} role="note">
      <span className="avviso-icona" aria-hidden>
        {icona}
      </span>
      <div>
        {titolo ? <strong>{titolo}</strong> : null}
        {titolo ? " " : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Barra del punteggio.
 * Quando la copertura dei dati è sotto la soglia, NON mostra un numero: mostra il motivo.
 * Un punteggio costruito su metà dei dati sembra identico a uno costruito su tutti, e questa
 * è precisamente l'illusione da evitare.
 */
export function BarraPunteggio({ punteggio }: { punteggio: Punteggio | null }) {
  if (!punteggio) return <span className="neutro">non calcolato</span>;
  if (punteggio.valore === null) {
    return (
      <div>
        <Badge testo="da valutare" colore="var(--gold)" />
        <div className="metrica-nota" style={{ marginTop: 5 }}>
          {punteggio.esito}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="punteggio">
        <div className="punteggio-barra">
          <div className="punteggio-riemp" style={{ width: `${Math.round(punteggio.valore)}%` }} />
        </div>
        <div className="punteggio-num">{Math.round(punteggio.valore)}</div>
      </div>
      <div className="metrica-nota" style={{ marginTop: 4 }}>
        su {Math.round(punteggio.copertura * 100)}% dei dati previsti
      </div>
    </div>
  );
}

/** Dettaglio del punteggio: ogni variabile, con il suo peso e da dove viene. */
export function DettaglioPunteggio({ punteggio }: { punteggio: Punteggio }) {
  return (
    <div className="tabella-scroll">
      <table className="tab">
        <thead>
          <tr>
            <th>Blocco e variabile</th>
            <th className="num">Peso</th>
            <th className="num">Valore</th>
            <th>Da dove viene</th>
          </tr>
        </thead>
        <tbody>
          {punteggio.blocchi.map((b) => (
            <React.Fragment key={b.nome}>
              <tr>
                <td style={{ fontWeight: 600 }}>{b.nome}</td>
                <td className="num">—</td>
                <td className="num">
                  {b.valore === null ? (
                    <span className="neutro">nessun dato</span>
                  ) : (
                    `${Math.round(b.valore * 100)} / 100`
                  )}
                </td>
                <td className="neutro">copertura {Math.round(b.copertura * 100)}%</td>
              </tr>
              {b.variabili.map((v) => (
                <tr key={b.nome + v.nome}>
                  <td style={{ paddingLeft: 22, color: "var(--text-secondary)" }}>{v.etichetta}</td>
                  <td className="num neutro">{Math.round(v.peso * 100)}%</td>
                  <td className="num">
                    {v.normalizzato === null ? (
                      <span className="badge">esclusa</span>
                    ) : (
                      Math.round(v.normalizzato * 100)
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{v.provenienza}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stato delle fonti: se una cade, deve vedersi in testa alla pagina. */
export function StatoFonti({ fonti, generataIl }: { fonti: StatoFonte[]; generataIl: string | null }) {
  const ko = fonti.filter((f) => f.esito !== "ok");
  return (
    <div className="card">
      <div className="card-testa">
        <div>
          <div className="card-titolo">Stato delle fonti</div>
          <div className="card-sub">
            {fonti.length} interrogate, {fonti.length - ko.length} riuscite
            {generataIl ? ` — ultimo giro ${new Date(generataIl).toLocaleString("it-IT")}` : ""}
          </div>
        </div>
        <Badge testo={ko.length === 0 ? "tutte attive" : `${ko.length} non disponibili`} colore={ko.length === 0 ? "var(--green)" : "var(--red)"} forte />
      </div>
      {ko.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Avviso grave titolo="Fonti non disponibili.">
            I valori che dipendono da queste fonti non vengono mostrati, invece di essere
            riempiti con l&apos;ultimo dato noto:
            <ul style={{ margin: "6px 0 0 18px" }}>
              {ko.map((f) => (
                <li key={f.nome}>
                  {f.nome} — {f.messaggio}
                </li>
              ))}
            </ul>
          </Avviso>
        </div>
      ) : null}
    </div>
  );
}
