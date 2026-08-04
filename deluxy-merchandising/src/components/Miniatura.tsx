// La foto del prodotto (o della collezione) grande quanto basta a riconoscerlo
// scorrendo un elenco. Una sola implementazione: con due copie la stessa cosa
// avrebbe due misure diverse a due pagine di distanza.
//
// Chi non ha foto tiene comunque il suo posto, con il segnaposto ❀: senza, le
// righe con e senza immagine avrebbero il nome incolonnato in due punti diversi
// e l'elenco diventerebbe illeggibile proprio dove i dati mancano.

export function Miniatura({ url, alt = "", lato = 34 }: { url: string | null; alt?: string; lato?: number }) {
  return (
    <span
      aria-hidden={alt === "" ? true : undefined}
      style={{
        width: lato,
        height: lato,
        flex: `0 0 ${lato}px`,
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--surface-2, #F5F5F7)",
        border: "1px solid var(--hairline, rgba(0,0,0,.08))",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-tertiary)",
        fontSize: Math.round(lato / 2.4),
        verticalAlign: "middle",
      }}
    >
      {url ? (
        // `loading="lazy"` e non un componente immagine ottimizzato: sono URL
        // del CDN di Shopify, già serviti bene, e in una lista da cento righe
        // conta solo non scaricarle tutte insieme.
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        "❀"
      )}
    </span>
  );
}
