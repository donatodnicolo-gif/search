"use client";

import { useState } from "react";
import { registraGiornata } from "@/lib/cartellino-actions";

// Registrazione manuale di una giornata. Il giorno può essere passato
// (timbratura arretrata), ma allora la motivazione è obbligatoria: la regola
// vera sta nella server action, qui la si anticipa al browser col `required`
// dinamico, per non scoprirla solo dopo l'invio.
export function FormGiornata({ oggi }: { oggi: string }) {
  const [giorno, setGiorno] = useState(oggi);
  // Confronto lessicografico: le date "YYYY-MM-DD" si ordinano come stringhe.
  const arretrata = giorno !== "" && giorno < oggi;

  return (
    <form action={registraGiornata} className="griglia-form">
      <label className="campo">
        <span>Giorno</span>
        <input
          type="date"
          name="giorno"
          defaultValue={oggi}
          max={oggi}
          required
          onChange={(e) => setGiorno(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Entrata</span>
        <input type="time" name="entrata" required />
      </label>
      <label className="campo">
        <span>Uscita (vuoto = turno aperto)</span>
        <input type="time" name="uscita" />
      </label>
      <label className="campo campo-largo">
        <span>
          {arretrata ? "Motivazione della timbratura arretrata (obbligatoria)" : "Motivo"}
        </span>
        <input
          name="note"
          required={arretrata}
          placeholder={
            arretrata
              ? "Perché si registra solo ora"
              : "Dimenticato di timbrare, cliente in sede…"
          }
        />
      </label>
      <button type="submit" className="btn">
        Registra giornata
      </button>
    </form>
  );
}
