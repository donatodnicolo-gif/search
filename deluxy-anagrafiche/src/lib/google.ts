// OAuth Client ID (tipo Web) per la People API — infrastruttura Deluxy esistente
// (progetto Google Cloud "My Maps Project", app OAuth "Deluxy"). È PUBBLICO:
// non è un segreto, sta in config. Per usarlo da questa app, l'origine
// (https://deluxy-anagrafiche.vercel.app e http://localhost:3060) va aggiunta
// tra le "Origini JavaScript autorizzate" del client su Google Cloud, e gli
// account operatori tra i test user finché l'app OAuth resta in modalità test.
export const GOOGLE_OAUTH_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
  "639032328429-16kj92rbb0ppigt8ps6oe0ds9lbfd45r.apps.googleusercontent.com";
