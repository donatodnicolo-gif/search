"use client";

// Menù di stato che invia il form appena si sceglie: una riga sola invece di
// una fila di pillole (nelle tabelle lunghe fa la differenza).
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
  return (
    <select
      className="selettore-stato"
      name={nome}
      defaultValue={valore}
      style={colore ? { color: colore, borderColor: colore } : undefined}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>{o.etichetta}</option>
      ))}
    </select>
  );
}
