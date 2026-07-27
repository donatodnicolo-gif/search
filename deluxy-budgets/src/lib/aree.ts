// Le due nature del dato nell'app, tenute separate: ciò che si PIANIFICA
// (budget) e ciò che è ACCADUTO davvero (consuntivo, dai dati reali di Finance
// e banca). La configurazione sta a parte. Questa è la fonte unica: la sidebar
// e l'etichetta di pagina leggono da qui, così le due aree restano coerenti.

export type Area = "budget" | "consuntivo" | "config";

export const AREE: Record<Area, { label: string; sub: string; badge: string }> = {
  budget: { label: "Budget", sub: "Pianificazione", badge: "blue" },
  consuntivo: { label: "Consuntivo", sub: "Dati reali", badge: "green" },
  config: { label: "Configurazione", sub: "Impostazioni", badge: "neutral" },
};

// Le rotte "consuntivo": il venduto dei negozi (Orders), il fatturato reale
// (Finance + quota del venduto) e i costi reali (banca, CFO). Tutto il resto è
// pianificazione; le impostazioni a parte.
const CONSUNTIVO = ["/venduto", "/consuntivo", "/cfo", "/competenza", "/conto-economico"];
const CONFIG = ["/impostazioni", "/impostazioni/chiavi", "/impostazioni/accesso"];

export function areaDi(pathname: string): Area {
  // La radice rimanda al consuntivo (src/app/page.tsx): l'etichetta deve dire
  // subito "Dati reali", non "Pianificazione" per una frazione di secondo.
  if (pathname === "/") return "consuntivo";
  if (CONSUNTIVO.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "consuntivo";
  if (CONFIG.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "config";
  return "budget";
}
