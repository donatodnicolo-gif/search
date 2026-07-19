// OAuth Client ID (tipo Web) per la People API — client "Deluxy search rubrica"
// nel progetto Google Cloud "My Project 75759" (account deluxy.delivery@gmail.com).
// È PUBBLICO: non è un segreto, sta in config. Origini JS autorizzate del client:
// https://search-deluxy.vercel.app, https://deluxy-anagrafiche.vercel.app,
// http://localhost:3060. L'app OAuth è in modalità test: gli account operatori
// devono stare tra i test user (sezione Pubblico della console).
export const GOOGLE_OAUTH_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
  "813248887384-kdksp8lq8p8pg4tou6b2q4i7r0avchjt.apps.googleusercontent.com";
