"use client";

import { useEffect, useState } from "react";

// L'ora italiana che scorre. È l'unico pezzo di client del Cartellino: davanti a
// un bottone «timbra» ci si aspetta di vedere l'orologio muoversi. Parte vuoto e
// si riempie dopo il montaggio, così il server non stampa un'ora che al secondo
// dopo sarebbe già diversa (e nessun avviso di idratazione).
export function Orologio() {
  const [ora, setOra] = useState("");

  useEffect(() => {
    const formatta = () =>
      setOra(
        new Intl.DateTimeFormat("it-IT", {
          timeZone: "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    formatta();
    const t = setInterval(formatta, 1000);
    return () => clearInterval(t);
  }, []);

  return <span className="orologio">{ora || "--:--:--"}</span>;
}
