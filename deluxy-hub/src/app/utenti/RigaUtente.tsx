"use client";

import { useState } from "react";
import { aggiornaUtente, eliminaUtente } from "@/lib/actions";
import { RUOLI, RUOLO_INFO, type Ruolo } from "@/lib/ruoli";
import { ScelteApp } from "./ScelteApp";

// La riga di un utente, con il suo pannello di modifica.
//
// ⚠️ Il pannello sta in una RIGA SUA a tutta larghezza, non dentro la cella
// delle azioni. Con un <details> dentro un <td> aprire «Modifica» rimisurava
// l'intera tabella: le colonne passavano da 246/238/170/187/165 a
// 166/143/115/85/498 e la data andava a capo anche nelle righe vicine — cioè
// modificare una persona scompaginava la lista che serve per trovare le altre.
//
// È l'unica ragione per cui questa riga è un componente client: serve uno stato
// aperto/chiuso che non può vivere dentro un <details> di una cella sola.
export function RigaUtente({
  utente,
  team,
  appElenco,
  appAbilitateTesto,
  ultimoAccesso,
  puoEliminare,
}: {
  utente: { id: string; nome: string; email: string; ruolo: string; attivo: boolean; appAbilitate: string[] };
  team: string | null;
  appElenco: readonly { id: string; nome: string }[];
  appAbilitateTesto: string;
  // Già formattato sul server in ora di Roma: formattarlo qui darebbe il fuso
  // del computer di chi guarda.
  ultimoAccesso: string;
  puoEliminare: boolean;
}) {
  const [aperto, setAperto] = useState(false);

  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 500 }}>{utente.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            {utente.email}
            {team ? ` · ${team}` : ""}
          </div>
        </td>
        <td>
          <span className="badge gold">
            <span className="dot" />
            {RUOLO_INFO[utente.ruolo as Ruolo]?.etichetta ?? utente.ruolo}
          </span>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
            {appAbilitateTesto}
          </div>
        </td>
        <td>
          <span className={`badge ${utente.attivo ? "green" : "red"}`}>
            <span className="dot" />
            {utente.attivo ? "Attivo" : "Disattivato"}
          </span>
        </td>
        <td style={{ color: "var(--text-secondary)", fontSize: 13, whiteSpace: "nowrap" }}>
          {ultimoAccesso}
        </td>
        <td>
          <button
            type="button"
            className={`btn${aperto ? " attivo" : ""}`}
            onClick={() => setAperto((x) => !x)}
            aria-expanded={aperto}
          >
            {aperto ? "Chiudi" : "Modifica"}
          </button>
        </td>
      </tr>

      {aperto && (
        <tr>
          <td colSpan={5} style={{ background: "var(--fill)" }}>
            <form action={aggiornaUtente} style={{ display: "grid", gap: 10, maxWidth: 620 }}>
              <input type="hidden" name="id" value={utente.id} />
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>Nome</span>
                <input name="nome" defaultValue={utente.nome} required />
              </label>
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>Ruolo</span>
                <select name="ruolo" defaultValue={utente.ruolo}>
                  {RUOLI.map((r) => (
                    <option key={r} value={r}>
                      {RUOLO_INFO[r].etichetta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>Nuova password (vuoto = invariata)</span>
                <input name="password" type="password" autoComplete="new-password" />
              </label>
              <ScelteApp app={appElenco} selezionate={utente.appAbilitate} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                <input type="checkbox" name="attivo" defaultChecked={utente.attivo} style={{ width: "auto" }} />
                Può accedere
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" className="btn primary">
                  Salva
                </button>
              </div>
            </form>

            {puoEliminare && (
              <form action={eliminaUtente} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={utente.id} />
                <button type="submit" className="btn danger">
                  Elimina utente
                </button>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
