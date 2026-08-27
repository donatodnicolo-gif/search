import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ I lettori di documenti restano FUORI dal bundle del server.
  //
  // pdf-parse si porta dietro pdf.js, che si aspetta di girare come modulo a
  // sé: impacchettato da Next fallisce su ogni PDF con «Object.defineProperty
  // called on non-object», un errore che non dice niente. In uno script node
  // normale non si vede — lì il pacchetto è già esterno — quindi la prova va
  // fatta passando dall'app, non da un file di prova a parte.
  serverExternalPackages: ["pdf-parse", "mammoth"],

  // Il widget viene caricato dentro un iframe sui siti dei clienti: la pagina
  // /widget deve poter essere incorniciata ovunque, il resto dell'app no.
  async headers() {
    return [
      // ── LE INTESTAZIONI DI SICUREZZA, DOVUNQUE TRANNE IL WIDGET ──
      //
      // ⚠️⚠️ IL `source` ESCLUDE `widget`, e non è pignoleria: Next applica
      // **tutte** le regole che combaciano, quindi un `source: "/(.*)"` con
      // `X-Frame-Options: DENY` la metterebbe anche sul widget — e il widget
      // dentro l'iframe dei siti dei clienti **è il prodotto**. Sarebbe una
      // correzione di sicurezza che spegne una funzione che funziona, cioè un
      // danno più grande del problema che risolve.
      //
      // ⚠️ E il problema che risolve, oggi, è **futuro**. Il clickjacking di un
      // operatore loggato adesso non funziona: il cookie è `SameSite=Lax`, e in
      // un iframe cross-site il browser non lo manda — l'attaccante incornicia
      // una pagina di login. Verificato che `vercel.app` è nella **Public
      // Suffix List** (sottomesso da Vercel), quindi
      // `deluxy-messaging.vercel.app` è un dominio registrabile a sé e le altre
      // app Deluxy su `*.vercel.app` sono cross-site rispetto a questa.
      //
      // ⚠️⚠️ Ma quella protezione è **gratuita e fragile**: il giorno che l'app
      // passa a un dominio proprio (`cs.deluxy.it`), `www.deluxy.it` e ogni
      // altra app sullo stesso dominio registrabile diventano *same-site*, il
      // cookie Lax parte anche nell'iframe, e il clickjacking diventa reale
      // **senza che nessuno tocchi questo repo**. Queste righe costano nulla e
      // chiudono anche quel giorno.
      {
        // ⚠️ Ancorato, per lo stesso motivo del matcher del middleware: scritto
        // `(?!widget)` nudo, l'eccezione varrebbe per PREFISSO e una futura
        // `/widget-statistiche` nascerebbe senza intestazioni di sicurezza —
        // che è il difetto latente che si è appena chiuso di là. Qui escono
        // solo il widget vero, il suo script e quello che ci sta sotto.
        source: "/((?!widget(?:$|/|\\.js$)).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // ⚠️ `nosniff` è una seconda riga di difesa sotto gli allegati: la
          // prima è la lista bianca dei tipi in `api/media/[id]`, perché
          // `nosniff` impedisce di INDOVINARE un tipo, non di dichiararlo.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/widget",
        headers: [
          // Nessun X-Frame-Options: l'iframe del widget è il prodotto stesso.
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
