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

  function riempi(p: PersonaScelta) {
    const form = ancora.current?.closest("form");
    if (!form) return;
    const campo = (i: number, nome: string) =>
      form.querySelector<HTMLInputElement>(`input[name="c${i}-${nome}"]`);

    for (let i = 0; i < righe; i++) {
      const nome = campo(i, "nome");
      const telefono = campo(i, "telefono");
      const email = campo(i, "email");
      const ruolo = campo(i, "ruolo");
      if (!nome || !telefono || !email || !ruolo) continue;
      const libera = ![nome, telefono, email, ruolo].some((c) => c.value.trim());
      if (!libera) continue;
      nome.value = p.nome;
      telefono.value = p.telefono ?? "";
      email.value = p.email ?? "";
      ruolo.value = p.ruolo ?? "";
      nome.focus();
      setAvviso(null);
      return;
    }
    setAvviso("Non c'è una riga libera: salva quelle compilate e riapri la modifica per aggiungerne altre.");
  }

  return (
    <span ref={ancora} className="rubrica-nel-modulo">
      <CercaInRubrica partnerNome={partnerNome} citta={citta} onScegli={riempi} />
      {avviso && <span className="testo-guida">{avviso}</span>}
    </span>
  );
}
