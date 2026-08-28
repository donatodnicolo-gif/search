"use client";

import { useEffect, useState } from "react";

// Il bottone «Installa» del Hub. L'installazione a un tocco si può offrire solo
// dall'origine dell'app stessa: questa pagina È il Hub, quindi qui il bottone
// funziona davvero (evento beforeinstallprompt di Android/Chrome). Su iPhone
// quell'evento non esiste: si spiega il gesto «Condividi → Aggiungi a Home».
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallaApp() {
  const [evento, setEvento] = useState<PromptEvent | null>(null);
  const [installata, setInstallata] = useState(false);
  const [iOS, setIOS] = useState(false);

  useEffect(() => {
    setIOS(/iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window));
    if (window.matchMedia("(display-mode: standalone)").matches) setInstallata(true);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvento(e as PromptEvent); };
    const onInstalled = () => { setInstallata(true); setEvento(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installata) {
    return <p className="installa-esito">✓ Il Hub è già installato su questo dispositivo.</p>;
  }
  if (iOS) {
    return (
      <p className="installa-esito">
        Su iPhone: tocca <b>Condividi</b> (il quadrato con la freccia) e poi{" "}
        <b>«Aggiungi a Home»</b>. Il Hub comparirà come un&rsquo;app.
      </p>
    );
  }
  if (evento) {
    return (
      <button
        className="btn primary"
        onClick={async () => { await evento.prompt(); await evento.userChoice; setEvento(null); }}
      >
        Installa il Hub sul telefono
      </button>
    );
  }
  return (
    <p className="installa-esito">
      Per installarlo: apri il menu del browser (i tre puntini) e scegli{" "}
      <b>«Installa app»</b> o <b>«Aggiungi a schermata Home»</b>.
    </p>
  );
}
