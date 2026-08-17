"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EsitoRiga } from "@/lib/transazioni-actions";

// Quanto resta leggibile l'esito verde prima che la lista si aggiorni e la riga
// registrata sparisca. Le azioni di riga apposta NON rivalidano /transazioni
// (lo fa il client, qui): senza questa pausa il messaggio verrebbe cancellato
// nello stesso istante in cui compare.
const MS_PRIMA_DEL_RINFRESCO = 2200;

// Bottone di riga in /transazioni («Salda fattura», «Registra incasso»,
// «Registra bonifico», «Ignora») che DICE com'è andata.
//
// Perché esiste: prima era un `<form action={azione}>` con un'azione che non
// tornava niente. Quando funzionava, la riga spariva; quando NON funzionava,
// non compariva nulla — nessun messaggio, nessun colore, niente. Caso vero del
// 17/08/2026: il movimento CONLESTELLE di 2.544,98 € è rimasto «nuova» e la
// fattura 569/2026 «da incassare», mentre a schermo il clic sembrava non fare
// nulla. Un salvataggio che fallisce in silenzio è peggio di uno che fallisce.
//
// Tre cose che il `<form>` non faceva:
//  1. il bottone si blocca e dice «Salvo…», così non lo si preme due volte;
//  2. l'esito compare ACCANTO alla riga, verde o rosso col motivo vero;
//  3. l'errore viene CATTURATO qui (`try/catch` attorno alla chiamata). Con un
//     form, un'azione che lancia — o che il server non riconosce più perché la
//     pagina è aperta da prima di un deploy — finisce in un errore non gestito
//     che l'utente non vede.
export function AzioneTransazione({
  azione,
  etichetta,
  inCorso = "Salvo…",
  variante = "primary",
  title,
}: {
  /** Server action già legata ai suoi argomenti (`.bind(null, txId, …)`). */
  azione: () => Promise<EsitoRiga>;
  etichetta: string;
  inCorso?: string;
  variante?: "primary" | "secondary";
  title?: string;
}) {
  const [esito, setEsito] = useState<EsitoRiga>(null);
  const [inAttesa, avvia] = useTransition();
  const router = useRouter();

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button
        type="button"
        className={`btn small ${variante}`}
        disabled={inAttesa}
        aria-busy={inAttesa}
        title={title}
        style={inAttesa ? { opacity: 0.75, cursor: "progress" } : undefined}
        onClick={() =>
          avvia(async () => {
            setEsito(null);
            try {
              const r = await azione();
              setEsito(r);
              // Riuscita: la riga ora è registrata e va tolta dall'elenco, ma
              // solo dopo che il messaggio è stato letto.
              if (r?.ok) setTimeout(() => router.refresh(), MS_PRIMA_DEL_RINFRESCO);
            } catch (e) {
              // Rete caduta, funzione scaduta, azione non più riconosciuta dal
              // server: sono i casi in cui prima non si vedeva niente.
              const m = (e as Error)?.message ?? String(e);
              setEsito({
                ok: false,
                testo: /Server Action|Failed to find|unexpected response/i.test(m)
                  ? "La pagina è aperta da prima di un aggiornamento dell'app: ricaricala (F5) e ripremi."
                  : `Non riuscito: ${m.slice(0, 200)}`,
              });
            }
          })
        }
      >
        {inAttesa ? inCorso : etichetta}
      </button>
      {esito && (
        <span
          role="status"
          style={{
            fontSize: 11.5,
            lineHeight: 1.35,
            maxWidth: 260,
            whiteSpace: "normal",
            color: esito.ok ? "var(--green)" : "var(--red)",
          }}
        >
          {esito.ok ? "✓ " : "✕ "}
          {esito.testo}
        </span>
      )}
    </span>
  );
}
