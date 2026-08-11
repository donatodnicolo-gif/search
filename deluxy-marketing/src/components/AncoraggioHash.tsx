"use client";

import { useEffect } from "react";

// Rifà il salto all'àncora dell'URL quando la pagina ha finito di montarsi.
//
// ⚠️ Su una pagina lenta il browser prova a saltare a #keywords PRIMA che la
// sezione esista nel DOM: il link «punta a qualcosa che ancora manca» e si
// resta in cima, perdendo il segno — che è esattamente il difetto che
// l'àncora doveva curare. Qui si riprova a DOM pronto; se l'elemento non
// esiste davvero, non si fa niente.
export function AncoraggioHash() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    document.getElementById(hash)?.scrollIntoView();
  }, []);
  return null;
}
