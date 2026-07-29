"use client";

import { useRef, useState } from "react";
import { CercaInRubrica, type PersonaScelta } from "./CercaInRubrica";

// «Dalla rubrica» dentro il form di modifica: la persona scelta riempie la
// prima riga referente ancora vuota, e si salva insieme al resto — niente
// scrittura immediata, altrimenti il refresh della pagina butterebbe via le
// modifiche non ancora salvate negli altri campi.
//
// Le righe sono input non controllati (defaultValue): si scrivono per
// riferimento, come farebbe un ref, cercandole per `name` dentro il form.
export function RubricaNelModulo({
  partnerNome,
  citta,
  righe,
}: {
  partnerNome: string;
  citta: string | null;
  righe: number;
}) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  // Le persone scelte riempiono, in ordine, le righe ancora libere. Se sono più
  // delle righe disponibili lo si dice con i numeri: sparire a metà sarebbe il
  // modo migliore per perdere un referente senza accorgersene.
  function riempi(persone: PersonaScelta[]) {
    const form = ancora.current?.closest("form");
    if (!form) return;
    const campo = (i: number, nome: string) =>
      form.querySelector<HTMLInputElement>(`input[name="c${i}-${nome}"]`);

    let messi = 0;
    let primo: HTMLInputElement | null = null;
    for (let i = 0; i < righe && messi < persone.length; i++) {
      const nome = campo(i, "nome");
      const telefono = campo(i, "telefono");
      const email = campo(i, "email");
      const ruolo = campo(i, "ruolo");
      if (!nome || !telefono || !email || !ruolo) continue;
      if ([nome, telefono, email, ruolo].some((c) => c.value.trim())) continue;
      const p = persone[messi];
      nome.value = p.nome;
      telefono.value = p.telefono ?? "";
      email.value = p.email ?? "";
      ruolo.value = p.ruolo ?? "";
      primo ??= nome;
      messi++;
    }
    primo?.focus();
    if (messi === persone.length) {
      setAvviso(
        messi === 1
          ? "Persona inserita nella riga libera: controlla il ruolo e salva."
          : `${messi} persone inserite nelle righe libere: controlla i ruoli e salva.`,
      );
    } else {
      setAvviso(
        `Righe libere finite: inserite ${messi} di ${persone.length}. Salva queste e riapri la modifica per le altre.`,
      );
    }
  }

  return (
    <span ref={ancora} className="rubrica-nel-modulo">
      <CercaInRubrica partnerNome={partnerNome} citta={citta} onScegli={riempi} />
      {avviso && <span className="testo-guida">{avviso}</span>}
    </span>
  );
}
