"use client";

import { useEffect, useState } from "react";

// Menù di stato che invia il form appena si sceglie: una riga sola invece di
// una fila di pillole (nelle tabelle lunghe fa la differenza).
//
// ⚠️ È CONTROLLATO, e deve restarlo. Con `defaultValue` React applica il valore
// del server solo al primo montaggio e poi lo ignora: dopo il salvataggio la
// pagina si rigenera con lo stato nuovo, ma il `<select>` resta quello di prima
// — e siccome ogni pagina ne ha molti (uno per riga di tabella), React riusa gli
// stessi nodi cambiandoli di posto. Il risultato è che il menù mostra lo stato
// di un'altra riga, o quello vecchio, e sembra che il cambiamento «torni
// indietro da solo». Segnalato il 03/08/2026 sul gruppo "Consegna Rose", dove
// il registro aveva tre salvataggi consecutivi tutti sullo stesso valore.
//
// Con `value` + il `useEffect` qui sotto, il menù segue sempre il database:
// quando la pagina si rigenera con un valore diverso, il menù lo prende.
export function SelettoreStato({
  valore,
  opzioni,
  nome = "stato",
  colore,
}: {
  valore: string;
  opzioni: { valore: string; etichetta: string }[];
  nome?: string;
  colore?: string;
}) {
  const [scelto, setScelto] = useState(valore);

  // Il server ha l'ultima parola: se la pagina torna con un valore diverso da
  // quello mostrato — perché il salvataggio è andato, o perché React ha riusato
  // questo nodo per un'altra riga — il menù si riallinea.
  useEffect(() => setScelto(valore), [valore]);

  return (
    <select
      className="selettore-stato"
      name={nome}
      value={scelto}
      style={colore ? { color: colore, borderColor: colore } : undefined}
      onChange={(e) => {
        const form = e.currentTarget.form;
        setScelto(e.currentTarget.value);
        // requestSubmit dopo aver aggiornato lo stato: il FormData si legge dal
        // DOM, che a questo punto ha già il valore nuovo.
        form?.requestSubmit();
      }}
    >
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>{o.etichetta}</option>
      ))}
    </select>
  );
}
