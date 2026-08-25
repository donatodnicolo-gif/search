"use client";

import { useEffect, useState } from "react";

// Identità leggera di "chi sono io" salvata nel browser (localStorage). Serve a
// firmare richieste/acquisti/decisioni con un nome e un'email, senza un vero
// login per-utente: l'accesso è già protetto dalla password unica del team.

export type Io = { nome: string; email: string };
const CHIAVE = "da_io";

export function leggiIo(): Io {
  if (typeof window === "undefined") return { nome: "", email: "" };
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) || "{}");
    return { nome: v.nome || "", email: v.email || "" };
  } catch {
    return { nome: "", email: "" };
  }
}

export function useIo(): [Io, (io: Io) => void] {
  const [io, setIo] = useState<Io>({ nome: "", email: "" });
  useEffect(() => setIo(leggiIo()), []);
  const salva = (nuovo: Io) => {
    setIo(nuovo);
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(nuovo));
    } catch {
      /* localStorage non disponibile: pazienza */
    }
  };
  return [io, salva];
}

// Campi nascosti da inserire in ogni form: il server sa così chi ha agito.
export function CampiIo({ io }: { io: Io }) {
  return (
    <>
      <input type="hidden" name="ioNome" value={io.nome} />
      <input type="hidden" name="ioEmail" value={io.email} />
    </>
  );
}

// Widget in topbar: nome + email di chi sta usando l'app ora.
export function Identita() {
  const [io, salva] = useIo();
  return (
    <div className="io" title="Chi sei: firma le tue richieste e decisioni">
      <input
        placeholder="Il tuo nome"
        value={io.nome}
        onChange={(e) => salva({ ...io, nome: e.target.value })}
      />
      <input
        placeholder="email"
        value={io.email}
        onChange={(e) => salva({ ...io, email: e.target.value })}
      />
    </div>
  );
}
