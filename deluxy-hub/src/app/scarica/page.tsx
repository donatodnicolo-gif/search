import { AppIcon } from "@/components/AppIcon";
import { InstallaApp } from "@/components/InstallaApp";
import { catalogoApp } from "@/lib/apps";
import { richiediSessione } from "@/lib/sessione-server";

// Sezione «Installa le app»: come portare le app Deluxy sul telefono.
// Quasi tutte sono web (si installano come PWA, aprendole dal loro indirizzo);
// solo Scout è nativa e ha un APK vero da scaricare.

export const metadata = { title: "Installa le app · Deluxy Hub" };

// L'unico APK vero è quello di Scout (app Expo/React Native). Quando è pronto,
// il file va in /public e questo indirizzo lo serve. Finché non c'è, la card lo
// dichiara «in preparazione» invece di offrire un link morto.
const SCOUT_APK: string | null = null; // es. "/apk/deluxy-scout.apk"

export default async function ScaricaPage() {
  await richiediSessione();
  const app = catalogoApp();

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Installa le app</h1>
        <p className="page-sub">
          Porta le app Deluxy sul telefono: compaiono come icone e si aprono a schermo pieno,
          come le app dello store. Si aggiornano da sole — non c&rsquo;è mai niente da riscaricare.
        </p>
      </div>

      {/* Il Hub: qui l'installazione a un tocco funziona davvero */}
      <div className="section-label">Questa app · Deluxy Hub</div>
      <div className="card installa-hero">
        <div className="app-icon" aria-hidden="true"><AppIcon icona="tasks" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>Deluxy Hub</div>
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
            La porta d&rsquo;ingresso a tutte le app. Installala una volta e avrai tutto a portata di icona.
          </div>
          <InstallaApp />
        </div>
      </div>

      {/* Scout: l'unica app nativa, con APK vero */}
      <div className="section-label">App per il telefono · con APK</div>
      <div className="card scout-card">
        <div className="app-icon" aria-hidden="true"><AppIcon icona="scout" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>
            Commerciale Scout <span className="badge"><span className="dot" />Nativa</span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
            L&rsquo;app di prospezione sul campo. È una vera app Android: si scarica come file APK e si installa.
          </div>
          {SCOUT_APK ? (
            <a className="btn primary" href={SCOUT_APK} download>
              Scarica l&rsquo;APK di Scout
            </a>
          ) : (
            <p className="installa-esito">
              APK <b>in preparazione</b>. La build si genera con EAS; una volta pronta il file compare qui.
            </p>
          )}
        </div>
      </div>

      {/* Le web app: installabili aprendole dal loro indirizzo */}
      <div className="section-label">Le altre app · si installano dal browser</div>
      <div className="card" style={{ padding: "18px 20px", marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--text-secondary)" }}>
          Le app qui sotto sono <b>web app</b>: si installano aprendole e scegliendo, dal menu del
          browser, <b>«Installa app»</b> (Android) o <b>«Aggiungi a Home»</b> (iPhone). Una volta
          installate stanno sul telefono come tutte le altre — e restano sempre aggiornate da sole.
        </p>
      </div>
      <div className="app-grid">
        {app
          .filter((a) => a.id !== "scout")
          .map((a) => (
            <div key={a.id} className="app-card" style={{ cursor: "default" }}>
              <div className="app-icon"><AppIcon icona={a.icona} /></div>
              <div>
                <div className="app-name">{a.nome}</div>
                <div className="app-role">{a.sottotitolo}</div>
              </div>
              <p className="app-desc">Aprila e scegli «Installa app» o «Aggiungi a Home».</p>
              <div className="app-foot">
                <a
                  className="app-open"
                  href={a.sso ? `/vai/${a.id}` : a.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Apri e installa ↗
                </a>
              </div>
            </div>
          ))}
      </div>
    </main>
  );
}
