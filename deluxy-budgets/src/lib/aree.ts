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

// Le uniche rotte "consuntivo": il fatturato reale (Finance) e i costi reali
// (banca, CFO). Tutto il resto è pianificazione; le impostazioni a parte.
const CONSUNTIVO = ["/consuntivo", "/cfo"];
const CONFIG = ["/impostazioni"];

export function areaDi(pathname: string): Area {
  if (CONSUNTIVO.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "consuntivo";
  if (CONFIG.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "config";
  return "budget";
}
