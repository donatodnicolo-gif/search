import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { daMobile } from "./dispositivo";

// Il Cartellino si usa solo da computer. Qui sta il controllo lato server, che
// vale sia per le pagine sia per le server action: il middleware fa la stessa
// verifica sull'Edge, questa è la seconda serratura (una action è comunque un
// endpoint POST raggiungibile a mano).

export async function daDispositivoMobile(): Promise<boolean> {
  const h = await headers();
  return daMobile(h.get("user-agent"), h.get("sec-ch-ua-mobile"));
}

export async function richiediDesktop(): Promise<void> {
  if (await daDispositivoMobile()) redirect("/cartellino/solo-desktop");
}
