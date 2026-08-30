"use client";

import { useEffect } from "react";

// L'esito di un'azione viaggia in querystring (pattern PRG, legittimo con i
// Server Component). Il Libro §7 però vieta che un REFRESH lo riproponga: era
// il caso di /cartellini, dove un F5 ripeteva «Rapporto inviato a …» senza che
// nulla fosse partito in quel momento — chi non ricordava se aveva spedito
// leggeva una conferma di un invio non avvenuto (misurato il 29/08/2026).
//
// Qui il messaggio si mostra una volta e il parametro sparisce dall'URL con
// `replaceState`: niente voce nella cronologia, nessuna nuova richiesta, e la
// pagina resta condivisibile senza portarsi dietro un esito altrui.
// ⚠️ La via del «cookie flash» NON regge in RSC: un Server Component non può
// cancellare un cookie durante il render, quindi la nota resterebbe appiccicata
// al giro successivo.
export function NotaEsito({ testo, tono = "ok" }: { testo: string; tono?: "ok" | "errore" }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("nota") && !url.searchParams.has("err")) return;
    url.searchParams.delete("nota");
    url.searchParams.delete("err");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
  }, []);

  return (
    <div className={tono === "ok" ? "nota-ok" : "avviso-errore"} role="status">
      {testo}
    </div>
  );
}
