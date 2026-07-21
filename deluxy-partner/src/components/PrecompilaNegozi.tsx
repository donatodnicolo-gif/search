"use client";

// Pulsanti che precompilano il form "Aggiungi negozio" con uno dei negozi noti
// (ognuno con un Brand DIVERSO, così non si sovrascrivono a vicenda). L'utente
// aggiunge solo il token e salva; ripete per ogni negozio.
const NOTI = [
  { brand: "deluxyflowers.com", dominio: "fb72b1-2.myshopify.com" },
  { brand: "deluxy.it", dominio: "deluxygifts.myshopify.com" },
  { brand: "cakedesign.me", dominio: "cakedesign-5921.myshopify.com" },
];

export function PrecompilaNegozi() {
  function precompila(brand: string, dominio: string) {
    const form = document.querySelector<HTMLFormElement>("#form-negozio");
    if (!form) return;
    const b = form.querySelector<HTMLInputElement>('input[name="brand"]');
    const d = form.querySelector<HTMLInputElement>('input[name="dominio"]');
    const t = form.querySelector<HTMLInputElement>('input[name="token"]');
    if (b) b.value = brand;
    if (d) d.value = dominio;
    t?.focus();
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>Precompila un negozio noto:</span>
      {NOTI.map((n) => (
        <button
          key={n.brand}
          type="button"
          className="btn small secondary"
          onClick={() => precompila(n.brand, n.dominio)}
          title={`Brand ${n.brand} · ${n.dominio}`}
        >
          {n.brand}
        </button>
      ))}
    </div>
  );
}
