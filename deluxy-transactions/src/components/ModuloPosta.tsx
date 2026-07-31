"use client";

import { useActionState } from "react";
import { collegaPosta, scollegaPostaAzione } from "@/app/actions";

// Il server di posta si configura qui dentro. La password finisce sul database
// cifrata AES-256-GCM e non si rilegge più: si sostituisce, come le chiavi
// della banca. Serve il codice a 6 cifre, perché da questa casella passa il
// codice che fa uscire il denaro.
export function ModuloPosta({
  configurata,
  da,
  bloccataDallAmbiente,
  host,
  porta,
  utente,
  mittente,
  chiedeCodice,
}: {
  configurata: boolean;
  da: "app" | "ambiente" | null;
  bloccataDallAmbiente: boolean;
  host: string;
  porta: number;
  utente: string;
  mittente: string;
  chiedeCodice: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(collegaPosta, {} as { errore?: string; ok?: string });
  const nellApp = da === "app";

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}

      {configurata && (
        <p className="firma-nota">
          Posta attiva su <strong>{host}:{porta}</strong> come <strong>{utente}</strong>
          {mittente && mittente !== utente ? `, mittente ${mittente}` : ""} — impostata{" "}
          {nellApp ? "da questa pagina" : "dalle variabili d'ambiente di Vercel"}.
        </p>
      )}

      {bloccataDallAmbiente && (
        <p className="aiuto-campo">
          Le variabili d&apos;ambiente hanno la precedenza su quello che si scrive qui: finché su Vercel esistono
          <code className="inline">SMTP_HOST</code>, <code className="inline">SMTP_USER</code> e{" "}
          <code className="inline">SMTP_PASS</code>, sono quelle a valere. È voluto: un&apos;installazione già
          irrigidita non si ammorbidisce da una pagina web. Per usare questo modulo, togli quelle variabili.
        </p>
      )}

      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="p-host">Server di posta in uscita</label>
          <input
            id="p-host"
            name="host"
            defaultValue={nellApp ? host : ""}
            spellCheck={false}
            autoComplete="off"
            placeholder="smtp.gmail.com"
            required
          />
          <p className="aiuto-campo">Con Gmail o Google Workspace è <code className="inline">smtp.gmail.com</code>.</p>
        </div>
        <div className="campo-modulo">
          <label htmlFor="p-porta">Porta</label>
          <input id="p-porta" name="porta" defaultValue={nellApp ? String(porta) : "587"} inputMode="numeric" />
          <p className="aiuto-campo">587 quasi sempre. La 465 si usa quando il server vuole il canale cifrato da subito.</p>
        </div>
        <div className="campo-modulo">
          <label htmlFor="p-utente">Casella (utente)</label>
          <input
            id="p-utente"
            name="utente"
            type="email"
            defaultValue={nellApp ? utente : ""}
            spellCheck={false}
            autoComplete="off"
            placeholder="pagamenti@deluxy.it"
            required
          />
        </div>
        <div className="campo-modulo">
          <label htmlFor="p-password">Password</label>
          <input
            id="p-password"
            name="password"
            type="password"
            spellCheck={false}
            autoComplete="new-password"
            placeholder={configurata ? "•••••••• (già impostata)" : ""}
            required
          />
          <p className="aiuto-campo">
            Con Gmail <strong>non</strong> è la password con cui entri: serve una «password per le app», che si genera
            nel tuo account Google e vale solo per questo. Va riscritta anche solo per cambiare la porta: è ciò che
            permette di provare la connessione prima di salvare.
          </p>
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="p-mittente">Mittente che vede chi riceve (facoltativo)</label>
          <input
            id="p-mittente"
            name="mittente"
            defaultValue={nellApp ? mittente : ""}
            spellCheck={false}
            autoComplete="off"
            placeholder="Deluxy Transactions <pagamenti@deluxy.it>"
          />
          <p className="aiuto-campo">Vuoto = si usa la casella qui sopra.</p>
        </div>

        {chiedeCodice && (
          <div className="campo-modulo">
            <label htmlFor="p-codice">Il tuo codice a 6 cifre</label>
            <input id="p-codice" name="codice" inputMode="numeric" autoComplete="one-time-code" required />
            <p className="aiuto-campo">
              Da questa casella passano i codici che fanno uscire il denaro: cambiarla vale quanto autorizzare un
              pagamento, quindi non basta la sessione aperta.
            </p>
          </div>
        )}

        <div className="campo-modulo">
          <label htmlFor="p-prova">Prova</label>
          <label className="riga-interruttore">
            <input id="p-prova" type="checkbox" name="prova" defaultChecked />
            mandami un&apos;email di prova appena salvato
          </label>
        </div>

        <div className="azioni-modulo campo-modulo largo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Provo e salvo…" : "Prova e collega"}
          </button>
        </div>
      </form>

      {nellApp && (
        <form action={scollegaPostaAzione} style={{ marginTop: 12 }}>
          <button className="btn btn-secondario" type="submit">
            Scollega la posta
          </button>
          <p className="aiuto-campo" style={{ marginTop: 6 }}>
            Scollegandola nessun pagamento potrà più uscire, finché non se ne configura un&apos;altra.
          </p>
        </form>
      )}
    </>
  );
}
