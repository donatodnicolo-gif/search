import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Uscita dalla sessione.
//
// ⚠️ PERCHÉ È UNA GET E NON UNA SERVER ACTION (27/08/2026, revisione di
// sicurezza). Prima «Esci» era una server action, quindi un POST — e il
// middleware, per il ruolo `sola_lettura`, rifiuta ogni metodo di scrittura
// con un 403. Risultato: il profilo di sola lettura era l'unico che **non
// poteva uscire**, e su un computer condiviso la sua sessione restava aperta
// per giorni. Una GET la può fare chiunque sia entrato.
//
// Il rischio noto e accettato: un indirizzo di uscita in GET si può far
// chiamare da fuori (un'immagine con questo src). Il danno è al massimo un
// logout indesiderato — nessun dato si muove — e vale meno di una sessione che
// non si chiude.
//
// La rotta NON è fra le esclusioni del middleware: per uscire bisogna essere
// dentro, e il cookie si cancella comunque.
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete("dp_utente");
  return res;
}
