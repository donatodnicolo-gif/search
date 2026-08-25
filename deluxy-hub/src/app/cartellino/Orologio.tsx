"use client";

import { useEffect, useRef, useState } from "react";

// L'ora italiana che scorre. È l'unico pezzo di client del Cartellino: davanti a
// un bottone «timbra» ci si aspetta di vedere l'orologio muoversi. Parte vuoto e
// si riempie dopo il montaggio, così il server non stampa un'ora che al secondo
// dopo sarebbe già diversa (e nessun avviso di idratazione).
//
// ⚠️ L'ora mostrata è ANCORATA AL SERVER, non all'orologio del computer
// (25/08/2026: un PC con l'ora di sistema indietro mostrava le 08:32 alle
// 09:30, proprio sopra il bottone «Timbra»). Le timbrature si scrivono con
// l'ora del server, quindi è quella che il numero grande deve dire: al
// montaggio si misura lo scarto fra l'ora del server (arrivata col rendering
// della pagina) e quella del computer, e ogni secondo si mostra
// «ora del computer + scarto». Se lo scarto è grande, sotto l'orologio lo si
// dice invece di lasciare che le due ore si contraddicano in silenzio.
export function Orologio({ oraServer }: { oraServer: number }) {
  const [ora, setOra] = useState("");
  const [scartoMin, setScartoMin] = useState(0);
  // Lo scarto si misura UNA volta, al montaggio (il rendering è appena
  // avvenuto, quindi oraServer è fresca): entrambe le ore avanzano insieme,
  // rimisurarlo a ogni tick riporterebbe dentro l'errore del PC.
  const scartoMs = useRef<number | null>(null);

  useEffect(() => {
    if (scartoMs.current === null) {
      scartoMs.current = oraServer - Date.now();
      setScartoMin(Math.round(scartoMs.current / 60_000));
    }
    const formatta = () =>
      setOra(
        new Intl.DateTimeFormat("it-IT", {
          timeZone: "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(Date.now() + (scartoMs.current ?? 0))),
      );
    formatta();
    const t = setInterval(formatta, 1000);
    return () => clearInterval(t);
  }, [oraServer]);

  return (
    <>
      <span className="orologio">{ora || "--:--:--"}</span>
      {Math.abs(scartoMin) >= 3 && (
        <div style={{ fontSize: 12.5, color: "var(--orange, #b45309)", marginTop: 2 }}>
          L&rsquo;orologio di questo computer è {scartoMin > 0 ? "indietro" : "avanti"} di ~
          {Math.abs(scartoMin)} min: qui vale l&rsquo;ora del server, la stessa delle timbrature.
        </div>
      )}
    </>
  );
}
