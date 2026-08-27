import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { creaSessione, DURATA_GIORNI } from "@/lib/sessione";
import { registraAccesso, frenaTentativi } from "@/lib/accessi";
import { segretoCombacia } from "@/lib/confronto";
import { verificaCredenziali } from "@/lib/utenti";
import { prisma } from "@/lib/db";

const OPZIONI_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

// Due ingressi in un unico form:
//   - con l'EMAIL → account personale, e le azioni finiscono nei registri col
//     nome della persona;
//   - senza email → password di TEAM, come prima. Resta perché è la porta di
//     servizio: togliendola, chi non ha ancora un account resterebbe fuori.
async function login(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim();
  const tentativo = String(fd.get("password") ?? "");
  const intestazioni = await headers();
  const jar = await cookies();

  if (email) {
    const esito = await verificaCredenziali(email, tentativo);
    if (!esito.ok) {
      await registraAccesso(
        { utente: email.toLowerCase(), via: "email", esito: "fallito" },
        intestazioni
      );
      // il freno si applica DOPO aver annotato, così conta anche questo
      await frenaTentativi(intestazioni);
      // «Utente disattivato» si può dire: chi lo legge ha già dimostrato di
      // conoscere la password giusta, quindi non si sta rivelando niente.
      redirect(`/login?errore=${esito.motivo === "disattivato" ? "disattivato" : "credenziali"}`);
    }
    const u = esito.utente;
    jar.set(
      SESSION_COOKIE,
      await creaSessione({ uid: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo, via: "email" }),
      { ...OPZIONI_COOKIE, maxAge: 60 * 60 * 24 * DURATA_GIORNI }
    );
    jar.delete("dp_utente"); // il nome ora sta nella sessione firmata
    await prisma.utenteApp.update({ where: { id: u.id }, data: { ultimoAccesso: new Date() } });
    await registraAccesso(
      { utente: u.nome, utenteId: u.id, ruolo: u.ruolo, via: "email" },
      intestazioni
    );
    redirect("/");
  }

  const password = process.env.PARTNER_APP_PASSWORD;
  const readonly = process.env.PARTNER_APP_PASSWORD_READONLY;
  // accetta la password piena o quella di sola lettura; il cookie codifica il ruolo
  // Confronto a tempo costante anche qui: è pur sempre un segreto.
  const usata = segretoCombacia(tentativo, password)
    ? password!
    : segretoCombacia(tentativo, readonly)
      ? readonly!
      : null;
  if (!usata) {
    // Anche i tentativi sbagliati finiscono nel registro accessi: sono il solo
    // segnale che qualcuno sta provando a entrare. Non si annota la password
    // tentata — servirebbe a niente e sarebbe un segreto scritto nel database.
    await registraAccesso({ utente: "Sconosciuto", via: "password", esito: "fallito" }, intestazioni);
    await frenaTentativi(intestazioni);
    redirect("/login?errore=credenziali");
  }
  const ruolo = usata === password ? "admin" : "sola_lettura";
  await registraAccesso(
    { utente: ruolo === "admin" ? "Accesso a password" : "Accesso sola lettura", ruolo, via: "password" },
    intestazioni
  );
  jar.set(SESSION_COOKIE, await sessionToken(usata), { ...OPZIONI_COOKIE, maxAge: 60 * 60 * 24 * 30 });
  // Login a password: non c'è un nome persona. Rimuovi un eventuale nome SSO
  // rimasto, così il registro modifiche non attribuisce le azioni a chi non è.
  jar.delete("dp_utente");
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(600px 400px at 18% 12%, rgba(184,150,62,0.14), transparent 60%), radial-gradient(700px 500px at 85% 90%, rgba(17,19,24,0.10), transparent 60%), var(--bg)",
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "100%",
          background: "var(--surface-translucent)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          border: "1px solid var(--hairline)",
          borderRadius: 24,
          boxShadow: "var(--shadow-float)",
          padding: "40px 36px 30px",
          textAlign: "center",
        }}
      >
        <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}>
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Finance</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 }}>
          Gestione finanziaria partner. Accesso riservato al team.
        </p>
        <form action={login}>
          <input
            type="email"
            name="email"
            autoFocus
            autoComplete="username"
            placeholder="Email"
            style={{ textAlign: "center" }}
          />
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            style={{ textAlign: "center", marginTop: 10 }}
          />
          {sp.errore === "disattivato" ? (
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>
              Questo account è stato disattivato. Chiedi a un amministratore di riattivarlo.
            </p>
          ) : sp.errore ? (
            // Un messaggio solo per «email che non esiste» e «password
            // sbagliata»: distinguerli direbbe a chiunque quali indirizzi hanno
            // un account qui dentro.
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>Email o password non corretti.</p>
          ) : null}
          <button type="submit" className="btn primary" style={{ width: "100%", marginTop: 16, padding: "12px 18px", justifyContent: "center" }}>
            Entra
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 18, lineHeight: 1.5 }}>
          Hai solo la <strong>password di team</strong>? Lascia l&apos;email vuota.
        </p>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 14 }}>
          Consegne in guanti bianchi, dal 2019.
        </p>
      </div>
    </div>
  );
}
