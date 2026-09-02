'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creaAccount } from '@/lib/actions'

// Preset dei provider più comuni: evitano di dover cercare host e porte.
const PRESET: Record<string, { imapHost: string; smtpHost: string; nota?: string }> = {
  'SecureMail (deluxy.it)': {
    imapHost: 'pop.securemail.pro',
    smtpHost: 'authsmtp.securemail.pro',
    nota: 'Le caselle @deluxy.it. La password è quella scelta nell’Area Clienti per l’attivazione della casella.',
  },
  Gmail: {
    imapHost: 'imap.gmail.com',
    smtpHost: 'smtp.gmail.com',
    nota: 'Con Gmail serve una “password per le app” (account Google → Sicurezza), non la password normale.',
  },
  'Aruba': { imapHost: 'imaps.aruba.it', smtpHost: 'smtps.aruba.it' },
  'Outlook / Microsoft 365': {
    imapHost: 'outlook.office365.com',
    smtpHost: 'smtp.office365.com',
    nota: 'Su Microsoft 365 l’accesso IMAP con password va abilitato dall’amministratore.',
  },
  Register: {
    imapHost: 'imap.register.it',
    smtpHost: 'smtp.register.it',
    nota: 'register.it usa un certificato per *.securemail.pro: la spunta “Ignora verifica certificato” qui sotto è già attiva (connessione comunque cifrata).',
  },
  Altro: { imapHost: '', smtpHost: '' },
}

// I provider il cui certificato è intestato a un dominio diverso dall'host:
// per questi la verifica del NOME sul certificato va saltata di default.
const CERT_DA_IGNORARE = new Set(['Register'])

// Host noti col certificato "sbagliato" (intestato a un altro dominio): per
// questi conviene attivare da soli l'opzione, qualunque preset sia scelto.
function hostConCertDiverso(host: string): boolean {
  return /register\.it$/i.test(host.trim())
}

const PRESET_INIZIALE = 'SecureMail (deluxy.it)'

export function FormAccount() {
  const [provider, setProvider] = useState(PRESET_INIZIALE)
  const [imapHost, setImapHost] = useState(PRESET[PRESET_INIZIALE].imapHost)
  const [smtpHost, setSmtpHost] = useState(PRESET[PRESET_INIZIALE].smtpHost)
  const [ignoraCert, setIgnoraCert] = useState(CERT_DA_IGNORARE.has(PRESET_INIZIALE))
  const [stato, setStato] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function cambiaProvider(nome: string) {
    setProvider(nome)
    setImapHost(PRESET[nome].imapHost)
    setSmtpHost(PRESET[nome].smtpHost)
    setIgnoraCert(CERT_DA_IGNORARE.has(nome))
  }

  /**
   * LE CASELLE @deluxy.it VIVONO SU DUE PIATTAFORME di register.it, e da fuori
   * non si vede quale: le storiche su SecureMail (`pop.securemail.pro`), le
   * nuove sulla webmail register.it (`imap.register.it`, che presenta un
   * certificato per *.securemail.pro → serve il salto della verifica del nome).
   * Misurato sul database il 02/09/2026: 8 caselle sulla prima, 2 sulla
   * seconda — e chi collegava una casella nuova col preset predefinito
   * (SecureMail) si vedeva rifiutare il collegamento senza capire perché.
   *
   * Quindi: se la piattaforma scelta rifiuta, si PROVA DA SOLI l'altra, e si
   * salva quella che risponde. Due tentativi al massimo, solo fra questa
   * coppia di host: su Gmail/Aruba/altro non si improvvisa niente.
   */
  const GEMELLE: Record<string, { imapHost: string; smtpHost: string; ignoraCert: boolean; nome: string }> = {
    'pop.securemail.pro': { imapHost: 'imap.register.it', smtpHost: 'smtp.register.it', ignoraCert: true, nome: 'register.it' },
    'imap.register.it': { imapHost: 'pop.securemail.pro', smtpHost: 'authsmtp.securemail.pro', ignoraCert: false, nome: 'SecureMail' },
  }

  /**
   * ⚠️ La chiamata all'azione può fallire PRIMA di entrare in `creaAccount`:
   * un deploy appena fatto invalida gli id delle azioni della pagina aperta,
   * la rete cade, la sessione scade. Un'eccezione dentro la transizione non si
   * vede come errore: fa comparire la schermata «Questa schermata non si è
   * aperta» al posto di tutto (successo il 02/09/2026, collegando la casella
   * di Michela a cavallo di un deploy). Qui si cattura e si dice cosa fare.
   */
  async function creaSenzaEsplodere(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
    try {
      return await creaAccount(form)
    } catch (e) {
      const m = e instanceof Error && e.message ? ` (${e.message.slice(0, 80)})` : ''
      return {
        ok: false,
        messaggio: `La richiesta non è partita${m}. Se l’app è stata appena aggiornata, ricarica la pagina e riprova: i dati inseriti non hanno lasciato il tuo browser.`,
      }
    }
  }

  function invia(form: FormData) {
    setStato(null)
    startTransition(async () => {
      const esito = await creaSenzaEsplodere(form)
      if (esito.ok) {
        setStato(esito)
        router.refresh()
        return
      }
      const gemella = GEMELLE[String(form.get('imapHost') ?? '').trim().toLowerCase()]
      if (!gemella) {
        setStato(esito)
        return
      }
      setStato({ ok: false, messaggio: `${esito.messaggio} — provo l’altra piattaforma (${gemella.nome})…` })
      const form2 = new FormData()
      form.forEach((v, k) => form2.set(k, v))
      form2.set('imapHost', gemella.imapHost)
      form2.set('smtpHost', gemella.smtpHost)
      if (gemella.ignoraCert) form2.set('ignoraCertTls', 'on')
      else form2.delete('ignoraCertTls')
      const esito2 = await creaSenzaEsplodere(form2)
      if (esito2.ok) {
        setStato({ ok: true, messaggio: `${esito2.messaggio} (piattaforma ${gemella.nome}, trovata da sola)` })
        router.refresh()
        return
      }
      // Rifiutano ENTRAMBE le piattaforme: a questo punto quasi sempre è la
      // password (quella dell'Area Clienti, non quella di altri servizi).
      setStato({
        ok: false,
        messaggio: `${esito.messaggio}\nHo provato anche ${gemella.nome} (${gemella.imapHost}): ${esito2.messaggio}\nSe rifiutano entrambe, di solito è la password: serve quella scelta nell’Area Clienti register.it per QUESTA casella.`,
      })
    })
  }

  return (
    <form action={invia}>
      <div className="form-grid">
        <div>
          <label className="field-label">Provider</label>
          <select value={provider} onChange={(e) => cambiaProvider(e.target.value)}>
            {Object.keys(PRESET).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">
            Nome della casella <span className="req">*</span>
          </label>
          <input type="text" name="nome" required placeholder="Deluxy Delivery" />
        </div>

        <div>
          <label className="field-label">
            Indirizzo email <span className="req">*</span>
          </label>
          <input type="email" name="email" required placeholder="posta@deluxy.it" />
        </div>
        <div>
          <label className="field-label">
            Password <span className="req">*</span>
          </label>
          <input type="password" name="imapPassword" required />
        </div>

        <div>
          <label className="field-label">
            Server IMAP <span className="req">*</span>
          </label>
          <input
            type="text"
            name="imapHost"
            required
            value={imapHost}
            onChange={(e) => {
              setImapHost(e.target.value)
              // Host register.it → attiva da sola l'opzione "ignora certificato".
              if (hostConCertDiverso(e.target.value)) setIgnoraCert(true)
            }}
          />
        </div>
        <div>
          <label className="field-label">Porta IMAP</label>
          <input type="number" name="imapPort" defaultValue={993} />
        </div>

        <div>
          <label className="field-label">
            Server SMTP <span className="req">*</span>
          </label>
          <input
            type="text"
            name="smtpHost"
            required
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Porta SMTP</label>
          <input type="number" name="smtpPort" defaultValue={465} />
        </div>

        <div className="full">
          <label className="field-label">Cartella da leggere</label>
          <input type="text" name="cartella" defaultValue="INBOX" />
        </div>

        <div className="full">
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="ignoraCertTls"
              checked={ignoraCert}
              onChange={(e) => setIgnoraCert(e.target.checked)}
            />
            Ignora la verifica del certificato TLS
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Attivala se il collegamento fallisce con “Hostname/IP does not match certificate”
            (il provider ha un certificato per un altro dominio, es. register.it → securemail.pro).
            La connessione resta cifrata.
          </div>
        </div>
      </div>

      {PRESET[provider].nota && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14 }}>
          {PRESET[provider].nota}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
        La password viene cifrata prima di essere salvata e non lascia mai il tuo server.
      </div>

      {stato && (
        <div
          style={{
            fontSize: 13,
            marginTop: 14,
            color: stato.ok ? 'var(--green)' : 'var(--red)',
            // L'esito del doppio tentativo è su più righe: senza, le tre frasi
            // diventano un rigo solo e non si capisce cosa è stato provato.
            whiteSpace: 'pre-wrap',
          }}
        >
          {stato.messaggio}
        </div>
      )}

      <div className="form-footer">
        <button className="btn primary" type="submit" disabled={inCorso}>
          {inCorso ? 'Verifico il collegamento…' : 'Collega casella'}
        </button>
      </div>
    </form>
  )
}
