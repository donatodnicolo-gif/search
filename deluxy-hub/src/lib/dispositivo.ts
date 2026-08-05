// Da che dispositivo arriva la richiesta.
// Serve al Cartellino, che si usa SOLO da computer: una timbratura fatta dal
// telefono può essere fatta da ovunque, quindi la si accetta solo dalla
// postazione. Non è una misura di sicurezza forte (un user-agent si falsifica):
// è la regola aziendale resa evidente, applicata sul server e non solo con il CSS.

const MOBILE =
  /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle/i;
// L'iPad "desktop mode" si dichiara Macintosh: lo si riconosce solo dal touch,
// che nell'user-agent non c'è. Il tablet dichiarato lo blocchiamo comunque.
const TABLET = /iPad|Tablet|PlayBook|Nexus 7|Nexus 10|SM-T/i;

export function daMobile(userAgent: string | null, chUaMobile?: string | null): boolean {
  // Client Hint: i browser Chromium mandano `sec-ch-ua-mobile: ?1`. È il segnale
  // più affidabile quando c'è, quindi vince sull'user-agent.
  if (chUaMobile === "?1") return true;
  if (chUaMobile === "?0" && !TABLET.test(userAgent ?? "")) return false;

  const ua = userAgent ?? "";
  if (!ua) return false; // niente user-agent (curl, health-check): non è un telefono
  return MOBILE.test(ua) || TABLET.test(ua);
}
