"use client";

import { useState } from "react";

// I quattro dati che servono per pagare a mano, ognuno con il suo tasto.
//
// Chi sta per segnare una richiesta «già pagata altrove» di solito sta facendo
// l'opposto: sta per aprire il portale della banca e battere IBAN, intestatario,
// importo e causale in un modulo. Ricopiarli a mano da qui è il punto in cui si
// sbaglia una cifra dell'IBAN — e un IBAN sbagliato non è un errore di
// battitura, è un bonifico a uno sconosciuto.
//
// Quello che si copia NON è sempre quello che si legge: l'IBAN si copia senza
// spazi e l'importo senza il simbolo dell'euro, perché è così che lo vogliono i
// moduli delle banche. Il valore mostrato resta leggibile per l'occhio.
export type CampoCopiabile = {
  etichetta: string;
  mostra: string;
  copia: string;
  /** true per IBAN e importi: numeri incolonnati, non testo. */
  mono?: boolean;
};

export function CampiDaCopiare({ campi, titolo }: { campi: CampoCopiabile[]; titolo?: string }) {
  const [copiato, setCopiato] = useState("");

  async function copia(campo: CampoCopiabile) {
    try {
      await navigator.clipboard.writeText(campo.copia);
    } catch {
      // Browser vecchi o permesso negato: si ripiega sul metodo di prima, che
      // funziona anche fuori dai contesti sicuri. Meglio di un tasto che non fa
      // niente e non dice perché.
      const appoggio = document.createElement("textarea");
      appoggio.value = campo.copia;
      appoggio.style.position = "fixed";
      appoggio.style.opacity = "0";
      document.body.appendChild(appoggio);
      appoggio.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(appoggio);
      }
    }
    setCopiato(campo.etichetta);
    window.setTimeout(() => setCopiato((c) => (c === campo.etichetta ? "" : c)), 1800);
  }

  return (
    <div className="copiabili">
      {titolo && <div className="copiabili-titolo">{titolo}</div>}
      {campi.map((c) => (
        <button
          key={c.etichetta}
          // Dentro un form ogni bottone senza type manderebbe il form: qui
          // vorrebbe dire registrare una chiusura per aver copiato un IBAN.
          type="button"
          className="copiabile"
          onClick={() => copia(c)}
          title={`Copia ${c.etichetta.toLowerCase()}`}
        >
          <span className="copiabile-etichetta">{c.etichetta}</span>
          <span className={`copiabile-valore${c.mono ? " iban" : ""}`}>{c.mostra}</span>
          <span className="copiabile-azione">{copiato === c.etichetta ? "copiato ✓" : "copia"}</span>
        </button>
      ))}
    </div>
  );
}
